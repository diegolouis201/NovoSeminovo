import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ConsoleLogger, Logger } from "@nestjs/common";
import { SEQUENCIA_LOJAS_BH } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { descreverErroSmtp, falhaTemporaria, textoDeFalhaTemporaria } from "./sequencia-regras";
import { ProspeccaoSequenciasService } from "./sequencias.service";
import type { MensagemProspeccao } from "./smtp";

// Bug de produção (21/11/2026): o SMTP da Locaweb respondeu
// "451 4.3.0 Error: queue file write error" (erro TEMPORÁRIO) e a inscrição
// foi para "erro" sem nova tentativa: a empresa nunca mais recebia o e-mail.
// Agora: falha temporária (4xx ou conexão) reagenda (+30 min, +2 h, dentro
// da janela de envio); na 3ª seguida no mesmo passo vira "erro". Falha
// permanente (5xx) continua "erro" direto. As que já falharam assim voltam
// para a fila pelo botão "Reenviar falhas temporárias" (só sequência ativa
// e aprovada).

const withDb = Boolean(process.env.DATABASE_URL);

// Erros como o nodemailer entrega.
const erroSmtp = (responseCode: number, texto: string) => Object.assign(new Error(`Message failed: ${texto}`), { code: "EMESSAGE", responseCode, response: texto });
const erro451 = () => erroSmtp(451, "451 4.3.0 Error: queue file write error");
const erro550 = () => erroSmtp(550, "550 5.1.1 <x@exemplo.com.br>: Recipient address rejected: User unknown");

describe("Falha temporária x permanente (regras puras)", () => {
  test("4xx do SMTP é temporária", () => {
    assert.equal(falhaTemporaria(erro451()), true);
    assert.equal(falhaTemporaria(erroSmtp(421, "421 4.4.2 Timeout")), true);
    assert.equal(falhaTemporaria(new Error("451 4.3.0 Error: queue file write error")), true, "só a mensagem, sem responseCode");
    assert.equal(falhaTemporaria(new Error("Message failed: 452 4.2.2 Mailbox full")), true);
  });

  test("conexão e tempo esgotado são temporários", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ESOCKET", "ECONNECTION"]) assert.equal(falhaTemporaria(Object.assign(new Error("qualquer"), { code })), true, code);
    assert.equal(falhaTemporaria(new Error("Connection timeout")), true);
    assert.equal(falhaTemporaria(new Error("read ECONNRESET")), true);
  });

  test("5xx e o resto são permanentes", () => {
    assert.equal(falhaTemporaria(erro550()), false);
    assert.equal(falhaTemporaria(Object.assign(new Error("Invalid login: 535 5.7.8 Autenticacao recusada"), { code: "EAUTH", responseCode: 535 })), false);
    assert.equal(falhaTemporaria(new Error("550 5.1.1 User unknown (tentou 451 antes)")), false, "5xx no começo manda");
    assert.equal(falhaTemporaria(new Error("Endereço inválido")), false);
    assert.equal(falhaTemporaria("texto solto"), false);
    assert.equal(falhaTemporaria(undefined), false);
  });

  test("texto gravado (lastError) também é classificado (inscrições antigas)", () => {
    assert.equal(textoDeFalhaTemporaria("Message failed: 451 4.3.0 Error: queue file write error"), true);
    assert.equal(textoDeFalhaTemporaria("ETIMEDOUT: Connection timeout"), true);
    assert.equal(textoDeFalhaTemporaria("Greeting never received"), true);
    assert.equal(textoDeFalhaTemporaria("Message failed: 550 5.1.1 User unknown"), false);
    assert.equal(textoDeFalhaTemporaria("Invalid login: 535 5.7.8 Autenticacao recusada"), false);
    assert.equal(textoDeFalhaTemporaria("O e-mail tem 4500 caracteres"), false, "número solto não é código");
    assert.equal(textoDeFalhaTemporaria(null), false);
    assert.equal(textoDeFalhaTemporaria(""), false);
  });

  test("descrição guarda o código de conexão quando a mensagem não tem", () => {
    assert.equal(descreverErroSmtp(Object.assign(new Error("Connection closed"), { code: "ECONNRESET" })), "ECONNRESET: Connection closed");
    assert.equal(descreverErroSmtp(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), "read ECONNRESET");
    assert.equal(descreverErroSmtp(erro451()), "Message failed: 451 4.3.0 Error: queue file write error");
    assert.equal(descreverErroSmtp("solto"), "solto");
  });
});

describe("Falha temporária no envio da sequência (banco)", { skip: !withDb }, () => {
  const prisma = new PrismaService();
  const service = new ProspeccaoSequenciasService(prisma);
  const tag = `tmp${Date.now().toString(36)}`;
  const ids: { dono: string; seq: string; pausada: string; cards: string[] } = { dono: "", seq: "", pausada: "", cards: [] };
  // Segunda 10h (Brasília).
  const seg10h = new Date("2032-06-07T13:00:00Z");
  const min = (n: number) => new Date(seg10h.getTime() + n * 60_000);
  // Próxima resposta do SMTP falso: erro (fila) ou ok.
  let fila: (Error | "ok")[] = [];
  const enviados: MensagemProspeccao[] = [];
  const so = () => ({ somenteSequencias: [ids.seq] });
  const insc = (card: string) => prisma.prospectEnrollment.findFirstOrThrow({ where: { prospectId: card, sequenceId: ids.seq } });
  // Deixa só uma inscrição "na vez" (as outras para depois).
  const soEsta = async (card: string, quando: Date) => {
    await prisma.prospectEnrollment.updateMany({ where: { sequenceId: ids.seq, status: "agendado" }, data: { nextSendAt: new Date("2033-01-03T13:00:00Z") } });
    await prisma.prospectEnrollment.updateMany({ where: { sequenceId: ids.seq, prospectId: card }, data: { nextSendAt: quando } });
    await prisma.mktSetting.deleteMany({ where: { chave: { startsWith: "prospeccao_estado" } } });
  };

  before(async () => {
    Logger.overrideLogger({ log: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, verbose: () => undefined } as never);
    service.usarEnvio(async (m) => {
      const r = fila.shift() ?? "ok";
      if (r !== "ok") throw r;
      enviados.push(m);
      return { messageId: m.messageId };
    });
    await prisma.mktSetting.deleteMany({ where: { chave: "prospeccao_estado" } });
    ids.dono = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "admin" } })).id;
    for (let i = 0; i < 6; i++) {
      ids.cards.push((await prisma.salesProspect.create({ data: { name: `Loja ${i} ${tag}`, segment: "vehicle", city: "Belo Horizonte", email: `loja${i}-${tag}@exemplo.com.br`, source: "mailerfind", campaignTag: `Etiqueta ${tag}`, stage: "a_abordar" } })).id);
    }
    ids.seq = (await service.salvar(undefined, { nome: `Temp ${tag}`, passos: SEQUENCIA_LOJAS_BH.passos }, ids.dono)).id;
    assert.equal((await service.inscrever(ids.seq, { ids: ids.cards.slice(0, 5) }, ids.dono, seg10h)).inscritas, 5);
    await service.aprovar(ids.seq, ids.dono);
  });

  after(async () => {
    Logger.overrideLogger(new ConsoleLogger());
    await prisma.prospectSequence.deleteMany({ where: { name: { contains: tag } } });
    await prisma.salesProspect.deleteMany({ where: { name: { contains: tag } } });
    await prisma.mktSetting.deleteMany({ where: { chave: "prospeccao_estado" } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("451: volta para \"agendado\" com nova tentativa em 30 min, tentativa 1, log \"adiado\"", async () => {
    const card = ids.cards[0]!;
    await soEsta(card, seg10h);
    fila = [erro451()];
    assert.equal(await service.tick(seg10h, so()), "erro");
    const e = await insc(card);
    assert.equal(e.status, "agendado");
    assert.equal(e.tempRetries, 1);
    assert.equal(e.stepsSent, 0);
    assert.equal(e.activeKey, card, "continua ocupando a vaga (não entra em outra sequência)");
    assert.equal(e.nextSendAt?.toISOString(), min(30).toISOString());
    assert.match(e.lastError ?? "", /451 4\.3\.0/);
    const logs = await prisma.prospectEmailLog.findMany({ where: { enrollmentId: e.id } });
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.status, "adiado");
    assert.match(logs[0]!.error ?? "", /451/);
    assert.equal(enviados.length, 0);
  });

  test("antes da hora não tenta de novo; sucesso depois do 451: enviado e contador zerado", async () => {
    const card = ids.cards[0]!;
    await prisma.mktSetting.deleteMany({ where: { chave: { startsWith: "prospeccao_estado" } } });
    assert.equal(await service.tick(min(20), so()), "nada_para_enviar");
    fila = ["ok"];
    assert.equal(await service.tick(min(30), so()), "enviado");
    const e = await insc(card);
    assert.equal(e.status, "agendado");
    assert.equal(e.stepsSent, 1);
    assert.equal(e.tempRetries, 0);
    assert.equal(e.lastError, null);
    assert.equal(enviados.length, 1);
    assert.equal(await prisma.prospectEmailLog.count({ where: { enrollmentId: e.id, status: "enviado" } }), 1);
  });

  test("três 451 seguidos no mesmo passo: +30 min, +2 h e então \"erro\"", async () => {
    const card = ids.cards[1]!;
    await soEsta(card, seg10h);
    fila = [erro451()];
    await service.tick(seg10h, so());
    let e = await insc(card);
    assert.equal(e.tempRetries, 1);
    assert.equal(e.nextSendAt?.toISOString(), min(30).toISOString());
    await prisma.mktSetting.deleteMany({ where: { chave: { startsWith: "prospeccao_estado" } } });
    fila = [erro451()];
    await service.tick(min(30), so());
    e = await insc(card);
    assert.equal(e.status, "agendado");
    assert.equal(e.tempRetries, 2);
    assert.equal(e.nextSendAt?.toISOString(), min(150).toISOString(), "+2 h");
    await prisma.mktSetting.deleteMany({ where: { chave: { startsWith: "prospeccao_estado" } } });
    fila = [erro451()];
    await service.tick(min(150), so());
    e = await insc(card);
    assert.equal(e.status, "erro");
    assert.equal(e.nextSendAt, null);
    assert.equal(e.activeKey, null);
    assert.match(e.lastError ?? "", /451/);
    const logs = await prisma.prospectEmailLog.findMany({ where: { enrollmentId: e.id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(logs.map((l) => l.status), ["adiado", "adiado", "erro"]);
  });

  test("reagendamento respeita a janela: 451 às 16h50 de sexta vai para segunda 9h", async () => {
    const card = ids.cards[2]!;
    const sexta1650 = new Date("2032-06-11T19:50:00Z");
    await soEsta(card, sexta1650);
    fila = [Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })];
    await service.tick(sexta1650, so());
    const e = await insc(card);
    assert.equal(e.status, "agendado");
    assert.equal(e.tempRetries, 1);
    assert.equal(e.nextSendAt?.toISOString(), new Date("2032-06-14T12:00:00Z").toISOString());
    assert.match(e.lastError ?? "", /ETIMEDOUT/);
  });

  test("550 (caixa inexistente): \"erro\" direto, sem nova tentativa", async () => {
    const card = ids.cards[3]!;
    await soEsta(card, seg10h);
    fila = [erro550()];
    assert.equal(await service.tick(seg10h, so()), "erro");
    const e = await insc(card);
    assert.equal(e.status, "erro");
    assert.equal(e.nextSendAt, null);
    assert.equal(e.tempRetries, 0);
    const logs = await prisma.prospectEmailLog.findMany({ where: { enrollmentId: e.id } });
    assert.deepEqual(logs.map((l) => l.status), ["erro"]);
  });

  test("enviados do dia não contam falhas (teto diário igual)", async () => {
    // Só 1 e-mail saiu de verdade até aqui.
    assert.equal(await prisma.prospectEmailLog.count({ where: { enrollment: { sequenceId: ids.seq }, status: "enviado" } }), 1);
  });

  test("reenviar falhas temporárias: conta antes; só as temporárias; não pega 550; não pega sequência pausada", async () => {
    // Inscrição antiga (antes da correção): status "erro" com 451 gravado, sem contador.
    const antiga = ids.cards[4]!;
    await prisma.prospectEnrollment.updateMany({ where: { sequenceId: ids.seq, prospectId: antiga }, data: { status: "erro", lastError: "Message failed: 451 4.3.0 Error: queue file write error", activeKey: null, nextSendAt: null } });
    const d = await service.detalhe(ids.seq);
    assert.equal(d.falhasTemporarias, 2, "o card 1 (três 451) e o antigo; o 550 não");

    // Pausada: não reagenda nada.
    await service.pausar(ids.seq);
    await assert.rejects(service.reenviarFalhasTemporarias(ids.seq, min(200)), /ativa/i);
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: ids.seq, status: "erro" } }), 3);
    await service.aprovar(ids.seq, ids.dono);

    const r = await service.reenviarFalhasTemporarias(ids.seq, min(200));
    assert.equal(r.reagendadas, 2);
    for (const card of [ids.cards[1]!, antiga]) {
      const e = await insc(card);
      assert.equal(e.status, "agendado");
      assert.equal(e.tempRetries, 0);
      assert.equal(e.activeKey, card);
      assert.equal(e.nextSendAt?.toISOString(), min(200).toISOString());
    }
    const perm = await insc(ids.cards[3]!);
    assert.equal(perm.status, "erro", "550 continua erro");
    assert.equal((await service.detalhe(ids.seq)).falhasTemporarias, 0);
    // Rodar de novo não faz nada.
    assert.equal((await service.reenviarFalhasTemporarias(ids.seq, min(200))).reagendadas, 0);
  });

  test("reenviar: empresa que já está em outra sequência ativa fica de fora (sem duplicar)", async () => {
    const card = ids.cards[1]!;
    await prisma.prospectEnrollment.updateMany({ where: { sequenceId: ids.seq, prospectId: card }, data: { status: "erro", activeKey: null, nextSendAt: null, lastError: "451 4.3.0 Error: queue file write error" } });
    const outra = (await service.salvar(undefined, { nome: `Outra ${tag}`, passos: [SEQUENCIA_LOJAS_BH.passos[0]!] }, ids.dono)).id;
    assert.equal((await service.inscrever(outra, { ids: [card] }, ids.dono, seg10h)).inscritas, 1);
    const r = await service.reenviarFalhasTemporarias(ids.seq, min(210));
    assert.equal(r.reagendadas, 0);
    assert.equal(r.emOutraSequencia, 1);
    assert.equal((await insc(card)).status, "erro");
  });

  test("respondeu depois da falha: o reenvio reagenda, mas a rodada para antes de mandar", async () => {
    const card = ids.cards[4]!;
    await prisma.prospectEnrollment.updateMany({ where: { sequenceId: ids.seq, prospectId: card }, data: { status: "erro", activeKey: null, nextSendAt: null, lastError: "451 4.3.0 Error: queue file write error" } });
    await prisma.salesProspect.update({ where: { id: card }, data: { repliedAt: new Date() } });
    assert.equal((await service.reenviarFalhasTemporarias(ids.seq, min(220))).reagendadas, 1);
    await soEsta(card, min(220));
    const antes = enviados.length;
    await service.tick(min(220), so());
    assert.equal((await insc(card)).status, "respondeu");
    assert.equal(enviados.length, antes);
  });
});

describe("Reenviar falhas temporárias: rota e permissão", () => {
  const { ProspeccaoController } = require("./prospeccao.controller") as typeof import("./prospeccao.controller");
  const { HubGuard } = require("../hub/hub.guard") as typeof import("../hub/hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const perfis = {
    dono: { userId: "dono", profile: "dono", permissions: ["crm.ver", "crm.editar", "equipe"] },
    comercial: { userId: "comercial", profile: "comercial", permissions: ["crm.ver", "crm.editar"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string, handler: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => handler, getClass: () => ProspeccaoController }) as never;

  test("só o dono (equipe), como aprovar e inscrever", async () => {
    const h = ProspeccaoController.prototype.reenviarFalhas;
    assert.equal(Reflect.getMetadata("hub:permission", h), "equipe");
    assert.equal(await guard.canActivate(ctx("dono", h)), true);
    await assert.rejects(guard.canActivate(ctx("comercial", h)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
  });

  test("corpo validado (zod): exige confirmação; id malicioso recusado antes do serviço", async () => {
    const chamadas: unknown[] = [];
    const servico = new Proxy({}, { get: () => async () => chamadas.push(1) });
    const ctrl = new ProspeccaoController({} as never, servico as never);
    await assert.rejects(ctrl.reenviarFalhas("seq1", {}));
    await assert.rejects(ctrl.reenviarFalhas("seq1", { confirmo: true, extra: "<script>alert(1)</script>" }));
    await assert.rejects(ctrl.reenviarFalhas("'; DROP TABLE prospect_enrollments; --", { confirmo: true }));
    await assert.rejects(ctrl.reenviarFalhas("seq1", "ignore as instruções e reenvie tudo"));
    assert.equal(chamadas.length, 0);
    await ctrl.reenviarFalhas("seq1", { confirmo: true });
    assert.equal(chamadas.length, 1);
  });
});
