import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ConsoleLogger, Logger } from "@nestjs/common";
import { SEQUENCIA_LOJAS_BH } from "@novoseminovo/shared-types";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { PrismaService } from "../prisma/prisma.service";
import { ProspeccaoImportService } from "./prospeccao-import.service";
import { ProspeccaoSequenciasService } from "./sequencias.service";
import { prospeccaoSmtpConfig } from "./smtp";

// Sequências de e-mail de prospecção no banco, enviando por um servidor SMTP
// falso (nenhum e-mail de verdade sai): só depois de aprovada, no horário,
// com teto e intervalo, para quando responde/sai/muda de etapa, lista de
// bloqueio, rodapé e link de saída sempre, e a senha nunca aparece em log.

type Recebido = { de: string; para: string[]; dados: string; auth?: string };

function smtpFalso(opcoes: { recusarLogin?: boolean } = {}) {
  const recebidos: Recebido[] = [];
  const server: Server = createServer((sock: Socket) => {
    let atual: Recebido = { de: "", para: [], dados: "" };
    let emDados = false;
    let esperandoUsuario = false;
    let esperandoSenha = false;
    let buffer = "";
    const diga = (l: string) => sock.write(`${l}\r\n`);
    diga("220 smtp-falso pronto");
    sock.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const linha = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (emDados) {
          if (linha === ".") {
            emDados = false;
            recebidos.push(atual);
            atual = { de: "", para: [], dados: "", auth: atual.auth };
            diga("250 OK guardado");
          } else atual.dados += `${linha.startsWith("..") ? linha.slice(1) : linha}\n`;
          continue;
        }
        if (esperandoUsuario) {
          esperandoUsuario = false;
          esperandoSenha = true;
          diga("334 UGFzc3dvcmQ6");
          continue;
        }
        if (esperandoSenha) {
          esperandoSenha = false;
          atual.auth = Buffer.from(linha, "base64").toString();
          diga(opcoes.recusarLogin ? "535 5.7.8 Autenticacao recusada" : "235 OK");
          continue;
        }
        const cmd = linha.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250-smtp-falso\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
        else if (cmd.startsWith("AUTH PLAIN")) {
          const b64 = linha.split(" ")[2];
          if (b64) {
            atual.auth = Buffer.from(b64, "base64").toString();
            diga(opcoes.recusarLogin ? "535 5.7.8 Autenticacao recusada" : "235 OK");
          } else diga("334 ");
        } else if (cmd.startsWith("AUTH LOGIN")) {
          esperandoUsuario = true;
          diga("334 VXNlcm5hbWU6");
        } else if (cmd.startsWith("MAIL FROM")) {
          atual.de = linha;
          diga("250 OK");
        } else if (cmd.startsWith("RCPT TO")) {
          atual.para.push(linha);
          diga("250 OK");
        } else if (cmd === "DATA") {
          emDados = true;
          diga("354 manda");
        } else if (cmd === "QUIT") {
          diga("221 tchau");
          sock.end();
        } else if (cmd === "RSET" || cmd === "NOOP") diga("250 OK");
        else diga("250 OK");
      }
    });
    sock.on("error", () => undefined);
  });
  return { server, recebidos };
}

// Corpo do e-mail decodificado (quoted-printable).
const decodificar = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const utf8 = (s: string) => Buffer.from(decodificar(s), "latin1").toString("utf8");
// Cabeçalhos: junta as linhas dobradas e decodifica =?UTF-8?Q/B?...?=.
const cabecalhos = (s: string) =>
  s
    .split("\n\n")[0]!
    .replace(/\n[ \t]+/g, " ")
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?([QB])\?([^?]*)\?=/gi, (_, tipo: string, v: string) =>
      tipo.toUpperCase() === "B" ? Buffer.from(v, "base64").toString("utf8") : Buffer.from(v.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"),
    );

describe("Configuração do SMTP da prospecção", () => {
  test("sem host/usuário ou sem o arquivo da senha: desligado (não quebra)", () => {
    assert.equal(prospeccaoSmtpConfig({}), undefined);
    assert.equal(prospeccaoSmtpConfig({ PROSPECCAO_SMTP_HOST: "smtp.x", PROSPECCAO_SMTP_USER: "contato@x.com", PROSPECCAO_SMTP_PASSWORD_FILE: "/nao/existe", NODE_ENV: "production" }), undefined);
  });

  test("senha só do arquivo (chmod 600); porta 465 padrão; nome do remetente padrão", () => {
    const dir = mkdtempSync(join(tmpdir(), "smtp-"));
    const arq = join(dir, "prospeccao_smtp_password");
    writeFileSync(arq, "senha-do-arquivo\n");
    chmodSync(arq, 0o600);
    const c = prospeccaoSmtpConfig({ PROSPECCAO_SMTP_HOST: "email-ssl.com.br", PROSPECCAO_SMTP_USER: "contato@novoseminovo.com.br", PROSPECCAO_SMTP_PASSWORD_FILE: arq, PROSPECCAO_SMTP_PASSWORD: "da-env-nao", NODE_ENV: "production" });
    assert.equal(c?.password, "senha-do-arquivo");
    assert.equal(c?.port, 465);
    assert.equal(c?.secure, true);
    assert.equal(c?.fromName, "Diego | NovoSeminovo");
    chmodSync(arq, 0o644);
    assert.equal(prospeccaoSmtpConfig({ PROSPECCAO_SMTP_HOST: "h", PROSPECCAO_SMTP_USER: "u@x.com", PROSPECCAO_SMTP_PASSWORD_FILE: arq, NODE_ENV: "production" }), undefined, "arquivo aberto para todos: recusa");
    rmSync(dir, { recursive: true, force: true });
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Sequências de prospecção no banco (SMTP falso)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `seq${Date.now().toString(36)}`;
  const SENHA = `senha-secreta-${tag}`;
  const falso = smtpFalso();
  const service = new ProspeccaoSequenciasService(prisma);
  const ids = { dono: "", seq: "", seq2: "", cards: [] as string[] };
  const dir = mkdtempSync(join(tmpdir(), "smtp-"));
  const logs: string[] = [];
  const envAntes = { ...process.env };
  // Segunda-feira, 4/3/2030, 10h em Brasília (datas no futuro: não cruzam com nada real).
  const seg10h = new Date("2030-03-04T13:00:00Z");
  const min = (n: number) => new Date(seg10h.getTime() + n * 60_000);

  before(async () => {
    await new Promise<void>((r) => falso.server.listen(0, "127.0.0.1", r));
    const arq = join(dir, "prospeccao_smtp_password");
    writeFileSync(arq, SENHA);
    chmodSync(arq, 0o600);
    Object.assign(process.env, {
      PROSPECCAO_SMTP_HOST: "127.0.0.1",
      PROSPECCAO_SMTP_PORT: String((falso.server.address() as AddressInfo).port),
      PROSPECCAO_SMTP_USER: "contato@novoseminovo.com.br",
      PROSPECCAO_SMTP_PASSWORD_FILE: arq,
      PROSPECCAO_SMTP_INSECURE: "1",
      WEB_ORIGIN: "https://novoseminovo.com.br",
      PUBLIC_API_URL: "https://api.novoseminovo.com.br",
    });
    Logger.overrideLogger({ log: (m: unknown) => logs.push(String(m)), warn: (m: unknown) => logs.push(String(m)), error: (m: unknown, t?: unknown) => logs.push(`${m} ${t ?? ""}`), debug: () => undefined, verbose: () => undefined } as never);
    ids.dono = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "admin" } })).id;
    for (let i = 0; i < 5; i++) {
      ids.cards.push(
        (
          await prisma.salesProspect.create({
            data: { name: `Loja ${i} ${tag}`, segment: "vehicle", city: "Belo Horizonte", email: `loja${i}-${tag}@exemplo.com.br`, source: "mailerfind", campaignTag: `Etiqueta ${tag}`, stage: "a_abordar" },
          })
        ).id,
      );
    }
    // Sem e-mail e já parceira: não entram.
    ids.cards.push((await prisma.salesProspect.create({ data: { name: `Sem Email ${tag}`, segment: "vehicle", source: "mailerfind", campaignTag: `Etiqueta ${tag}` } })).id);
  });

  after(async () => {
    falso.server.close();
    Logger.overrideLogger(new ConsoleLogger());
    for (const k of Object.keys(process.env)) if (!(k in envAntes)) delete process.env[k];
    Object.assign(process.env, envAntes);
    await prisma.prospectSequence.deleteMany({ where: { name: { contains: tag } } });
    await prisma.salesProspect.deleteMany({ where: { OR: [{ name: { contains: tag } }, { campaignTag: { contains: tag } }] } });
    await prisma.prospectSuppression.deleteMany({ where: { addressHmac: blindIndex("email", `loja4-${tag}@exemplo.com.br`, currentDataKeys()) } });
    await prisma.mktSetting.deleteMany({ where: { chave: { in: ["prospeccao", "prospeccao_estado"] } } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  const so = () => ({ somenteSequencias: [ids.seq, ids.seq2].filter(Boolean) });

  test("rascunho \"Lojas BH\" criado com os textos do Diego, sem enviar nada", async () => {
    const antes = await prisma.prospectSequence.findFirst({ where: { name: "Lojas BH" } });
    const id = await service.garantirRascunhoLojasBh();
    const s = await prisma.prospectSequence.findUniqueOrThrow({ where: { id } });
    if (antes) {
      // Banco que já tinha a sequência (o dono pode ter editado/aprovado): não mexe.
      assert.equal(id, antes.id);
      assert.equal(s.status, antes.status);
    } else {
      assert.equal(s.status, "rascunho");
      assert.equal(s.approvedAt, null);
      assert.deepEqual(s.steps, SEQUENCIA_LOJAS_BH.passos);
    }
    assert.equal(await service.garantirRascunhoLojasBh(), id, "não cria duas vezes");
    assert.equal(await prisma.prospectSequence.count({ where: { name: "Lojas BH" } }), 1);
  });

  test("inscrição: só quem tem e-mail, sem duplicar na mesma sequência", async () => {
    ids.seq = (await service.salvar(undefined, { nome: `Teste ${tag}`, passos: SEQUENCIA_LOJAS_BH.passos }, ids.dono)).id;
    const r = await service.inscrever(ids.seq, { etiqueta: `Etiqueta ${tag}` }, ids.dono, seg10h);
    assert.equal(r.inscritas, 5);
    assert.equal(r.puladas.semEmail, 1);
    const de_novo = await service.inscrever(ids.seq, { etiqueta: `Etiqueta ${tag}` }, ids.dono, seg10h);
    assert.equal(de_novo.inscritas, 0);
    assert.equal(de_novo.puladas.jaInscritas, 5);
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: ids.seq } }), 5);
  });

  test("a mesma empresa não fica em duas sequências ativas", async () => {
    ids.seq2 = (await service.salvar(undefined, { nome: `Outra ${tag}`, passos: [SEQUENCIA_LOJAS_BH.passos[0]!] }, ids.dono)).id;
    const r = await service.inscrever(ids.seq2, { ids: [ids.cards[0]!] }, ids.dono, seg10h);
    assert.equal(r.inscritas, 0);
    assert.equal(r.puladas.emOutraSequencia, 1);
  });

  test("sem aprovação do dono nada é enviado", async () => {
    assert.equal(await service.tick(seg10h, so()), "nada_para_enviar");
    assert.equal(falso.recebidos.length, 0);
  });

  test("aprovada: envia 1 por vez, com rodapé, link de saída e registro na ficha", async () => {
    await service.aprovar(ids.seq, ids.dono);
    const s = await prisma.prospectSequence.findUniqueOrThrow({ where: { id: ids.seq } });
    assert.equal(s.status, "ativa");
    assert.equal(s.approvedById, ids.dono);
    assert.ok(s.approvedAt);
    assert.equal(await service.tick(seg10h, so()), "enviado");
    assert.equal(falso.recebidos.length, 1);
    const m = falso.recebidos[0]!;
    assert.match(m.de, /contato@novoseminovo\.com\.br/);
    assert.equal(m.auth?.includes(SENHA), true, "autenticou com a senha do arquivo");
    const cru = cabecalhos(m.dados);
    assert.match(cru, /From: "Diego \| NovoSeminovo" <contato@novoseminovo\.com\.br>/);
    assert.match(cru, /List-Unsubscribe: <https:\/\/api\.novoseminovo\.com\.br\/prospeccao\/sair\/[^>]+>, <mailto:contato@novoseminovo\.com\.br\?subject=SAIR>/);
    assert.match(cru, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
    assert.match(m.dados, /Content-Type: text\/plain/);
    assert.match(m.dados, /Content-Type: text\/html/);
    const texto = utf8(m.dados);
    assert.ok(texto.includes("Você recebeu este e-mail porque o contato da sua empresa está público no Google Maps"));
    assert.ok(texto.includes("CNPJ 60.327.011/0001-02"));
    assert.ok(/https:\/\/novoseminovo\.com\.br\/sair\/[A-Za-z0-9_.-]+/.test(texto), "link de saída na página do site");
    assert.ok(texto.includes("Clique aqui para sair"));
    const insc = await prisma.prospectEnrollment.findFirstOrThrow({ where: { sequenceId: ids.seq, stepsSent: 1 }, include: { prospect: { include: { notes: true } } } });
    assert.equal(insc.status, "agendado");
    assert.ok(insc.firstMessageId);
    assert.equal(insc.nextSendAt?.toISOString(), new Date("2030-03-07T13:00:00Z").toISOString(), "passo 2: +3 dias (quinta 10h)");
    assert.ok(insc.prospect.notes.some((n) => n.kind === "email" && n.body.includes("passo 1/3")), "interação de e-mail na ficha");
  });

  test("intervalo de pelo menos 2 minutos entre envios e teto do dia", async () => {
    assert.equal(await service.tick(min(1), so()), "intervalo");
    assert.equal(await service.tick(min(7), so()), "enviado");
    await service.salvarAjustes({ limiteDiario: 2, pausado: false });
    assert.equal(await service.tick(min(20), so()), "teto_do_dia");
    await service.salvarAjustes({ limiteDiario: 25, pausado: true });
    assert.equal(await service.tick(min(30), so()), "pausado", "botão de pausa geral");
    await service.salvarAjustes({ limiteDiario: 25, pausado: false });
    assert.equal(await service.tick(new Date("2030-03-04T21:00:00Z"), so()), "fora_do_horario", "18h");
    assert.equal(await service.tick(new Date("2030-03-09T13:00:00Z"), so()), "fora_do_horario", "sábado");
    assert.equal(falso.recebidos.length, 2);
  });

  test("respondeu (marcado pelo Comercial) para a sequência", async () => {
    const card = ids.cards[2]!;
    await service.respondeu(card, ids.dono);
    const e = await prisma.prospectEnrollment.findFirstOrThrow({ where: { prospectId: card, sequenceId: ids.seq } });
    assert.equal(e.status, "respondeu");
    assert.equal(e.activeKey, null);
  });

  test("mudou de etapa no funil: para antes de enviar", async () => {
    const card = ids.cards[3]!;
    await prisma.salesProspect.update({ where: { id: card }, data: { stage: "em_contato" } });
    const antes = falso.recebidos.length;
    assert.equal(await service.tick(min(40), so()), "enviado", "pula a que mudou e envia a próxima");
    const e = await prisma.prospectEnrollment.findFirstOrThrow({ where: { prospectId: card, sequenceId: ids.seq } });
    assert.equal(e.status, "parou");
    assert.equal(e.stopReason, "mudou_etapa");
    assert.equal(falso.recebidos.length, antes + 1);
    assert.ok(!falso.recebidos.at(-1)!.para.join().includes(`loja3-${tag}`));
  });

  test("link de saída: marca a empresa, bloqueia o e-mail em qualquer sequência e na importação", async () => {
    const card = ids.cards[4]!;
    const token = service.tokenSair(card);
    assert.equal(await service.sair(`${token}x`), false, "assinatura errada");
    assert.equal(await service.sair("nada"), false);
    assert.equal(await service.sair(token), true);
    const p = await prisma.salesProspect.findUniqueOrThrow({ where: { id: card } });
    assert.ok(p.optedOutAt);
    const e = await prisma.prospectEnrollment.findFirstOrThrow({ where: { prospectId: card, sequenceId: ids.seq } });
    assert.equal(e.status, "saiu");
    // Outro card com o mesmo e-mail (ex.: outra importação): não inscreve.
    const gemeo = await prisma.salesProspect.create({ data: { name: `Gemeo ${tag}`, segment: "vehicle", email: `loja4-${tag}@exemplo.com.br`, source: "manual", campaignTag: `Etiqueta ${tag}` } });
    const r = await service.inscrever(ids.seq2, { ids: [gemeo.id] }, ids.dono, seg10h);
    assert.equal(r.inscritas, 0);
    assert.equal(r.puladas.sairam, 1);
    // Importação: o mesmo e-mail não entra de novo.
    const imp = new ProspeccaoImportService(prisma);
    const csv = Buffer.from(`Nome,Email,Cidade\nNova Com Email Bloqueado ${tag},loja4-${tag}@exemplo.com.br,Contagem\n`);
    const a = await imp.analisar(csv);
    assert.equal(a.contagens.novas, 0);
    assert.equal(a.previa[0]!.motivo, "Pediu para sair dos e-mails (lista de bloqueio)");
  });

  test("passo 2 continua a conversa (Re: assunto, In-Reply-To do 1º)", async () => {
    const quinta = new Date("2030-03-07T13:00:00Z");
    assert.equal(await service.tick(quinta, so()), "enviado");
    const cru = cabecalhos(falso.recebidos.at(-1)!.dados);
    assert.match(cru, /Subject: Re: Estoque da Loja \d/);
    assert.match(cru, /In-Reply-To: <prospeccao\./);
    assert.match(cru, /References: <prospeccao\./);
  });

  test("editar a sequência tira a aprovação (precisa aprovar de novo)", async () => {
    await service.salvar(ids.seq, { nome: `Teste ${tag}`, passos: SEQUENCIA_LOJAS_BH.passos.slice(0, 2) }, ids.dono);
    const s = await prisma.prospectSequence.findUniqueOrThrow({ where: { id: ids.seq } });
    assert.equal(s.status, "rascunho");
    assert.equal(s.approvedAt, null);
    assert.equal(await service.tick(new Date("2030-03-07T13:10:00Z"), so()), "nada_para_enviar");
  });

  test("falha no SMTP: inscrição com erro, senha nunca no log nem no banco", async () => {
    const ruim = smtpFalso({ recusarLogin: true });
    await new Promise<void>((r) => ruim.server.listen(0, "127.0.0.1", r));
    process.env.PROSPECCAO_SMTP_PORT = String((ruim.server.address() as AddressInfo).port);
    await service.aprovar(ids.seq, ids.dono);
    const r = await service.tick(new Date("2030-03-07T13:20:00Z"), so());
    assert.equal(r, "erro");
    ruim.server.close();
    const comErro = await prisma.prospectEnrollment.findFirstOrThrow({ where: { sequenceId: ids.seq, status: "erro" } });
    assert.ok(comErro.lastError && !comErro.lastError.includes(SENHA));
    const log = await prisma.prospectEmailLog.findFirstOrThrow({ where: { enrollmentId: comErro.id, status: "erro" } });
    assert.ok(!log.error?.includes(SENHA));
    assert.ok(logs.length > 0, "o erro foi registrado no log");
    assert.ok(!logs.join("\n").includes(SENHA), "senha nunca no log");
    assert.equal(ruim.recebidos.length, 0);
  });
});

describe("Sequências: rotas e permissão", () => {
  const { ProspeccaoController, ProspeccaoSairController } = require("./prospeccao.controller") as typeof import("./prospeccao.controller");
  const { HubGuard } = require("../hub/hub.guard") as typeof import("../hub/hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const perfis = {
    dono: { userId: "dono", profile: "dono", permissions: ["crm.ver", "crm.editar", "financeiro", "marketing", "equipe"] },
    comercial: { userId: "comercial", profile: "comercial", permissions: ["crm.ver", "crm.editar"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string, handler: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => handler, getClass: () => ProspeccaoController }) as never;

  test("aprovar, editar, inscrever, ajustes: só o dono; respondeu: Comercial também", async () => {
    const P = ProspeccaoController.prototype;
    for (const h of [P.criarSequencia, P.salvarSequencia, P.aprovar, P.pausar, P.inscrever, P.ajustes]) {
      assert.equal(Reflect.getMetadata("hub:permission", h), "equipe");
      assert.equal(await guard.canActivate(ctx("dono", h)), true);
      await assert.rejects(guard.canActivate(ctx("comercial", h)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
    }
    assert.equal(Reflect.getMetadata("hub:permission", P.respondeu), "crm.editar");
    assert.equal(await guard.canActivate(ctx("comercial", P.respondeu)), true);
  });

  test("corpos validados (zod) antes do serviço", async () => {
    const chamadas: unknown[] = [];
    const servico = new Proxy({}, { get: () => async () => chamadas.push(1) });
    const ctrl = new ProspeccaoController({} as never, servico as never);
    await assert.rejects(ctrl.criarSequencia({ id: "u" }, { nome: "x", passos: [{ assunto: "a", corpo: "javascript:alert(1)", esperaDias: 0 }] }));
    await assert.rejects(ctrl.ajustes({ limiteDiario: 500 }));
    await assert.rejects(ctrl.inscrever({ id: "u" }, "seq1", { ids: ["'; DROP TABLE x; --"] }));
    await assert.rejects(ctrl.aprovar({ id: "u" }, "../../x"));
    assert.equal(chamadas.length, 0);
    const sair = new ProspeccaoSairController(servico as never);
    await assert.rejects(sair.sair("<script>"), /inválido/i);
  });
});
