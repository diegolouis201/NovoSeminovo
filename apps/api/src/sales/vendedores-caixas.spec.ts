import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleLogger, Logger } from "@nestjs/common";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { setRoutineSink } from "../operations/routine-health";
import { PrismaService } from "../prisma/prisma.service";
import { ProspeccaoSequenciasService } from "../prospeccao/sequencias.service";
import type { MensagemProspeccao } from "../prospeccao/smtp";
import type { CaixaEntrada, EmailBruto } from "../prospeccao/caixa-entrada";
import { VendedoresService, sequenciaDoVendedor } from "./vendedores.service";
import { sistemaVendedor } from "./playbook-vendedor";
import { TERMOS_PROIBIDOS_REGEX } from "./termos-proibidos";

// Várias caixas (contato@ e atendimento@) e segmentos (Nina = veículos,
// Caio = imobiliárias), no banco, com caixas de entrada e SMTP falsos.

const withDb = Boolean(process.env.DATABASE_URL);

function caixaFalsa(para: string) {
  const fila: EmailBruto[] = [];
  let uid = 0;
  const caixa: CaixaEntrada = {
    async novas(desde, limite) {
      const emails = fila.filter((e) => e.uid > (desde.uid ?? 0)).slice(0, limite);
      return { uidValidity: "7", emails, maiorUid: emails.at(-1)?.uid ?? desde.uid ?? 0 };
    },
  };
  const chega = (o: { de: string; assunto: string; texto: string; id: string; inReplyTo?: string }) => {
    const linhas = [`From: Imob <${o.de}>`, `To: ${para}`, `Subject: ${o.assunto}`, `Message-ID: ${o.id}`, ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`] : []), "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", o.texto];
    fila.push({ uid: ++uid, fonte: Buffer.from(linhas.join("\r\n"), "utf8") });
  };
  return { caixa, chega };
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("Primeira abordagem e roteiro de imóveis (Nina: imobiliárias e corretores)", () => {
  const seq = sequenciaDoVendedor({ nome: "Nina", slug: "nina", segmentos: ["property", "broker"] });
  const tudo = JSON.stringify(seq);

  test("rascunho \"Nina: imobiliárias e corretores\": 3 passos (0, +3, +4 dias), assinatura da Nina, link da Nina", () => {
    assert.equal(seq.nome, "Nina: imobiliárias e corretores");
    assert.equal(seq.passos.length, 3);
    assert.deepEqual(seq.passos.map((p) => p.esperaDias), [0, 3, 4]);
    for (const p of seq.passos) assert.match(p.corpo, /Nina, assistente comercial da NovoSeminovo$/);
    assert.ok(tudo.includes("https://novoseminovo.com.br/para-lojas/comecar?utm_source=prospeccao&utm_medium=email&utm_campaign=nina"));
    assert.match(seq.passos[0]!.corpo, /Sou a Nina, assistente comercial \(virtual\)/);
  });

  test("oferta real para imobiliárias e corretores: 3 meses grátis, sem limite, sem fidelidade, Vitrine, importação pelo link, Arquiteto", () => {
    assert.match(tudo, /imobiliárias e corretores/i);
    assert.match(tudo, /3 meses grátis/);
    assert.match(tudo, /sem limite de anúncios/);
    assert.match(tudo, /sem fidelidade/);
    assert.match(tudo, /Vitrine/);
    assert.match(tudo, /[Ii]mportação pelo link/);
    assert.match(tudo, /Arquiteto NovoSeminovo/);
    assert.match(tudo, /nacional/);
  });

  test("nada proibido: sem promessa, sem financiamento, sem parceiros nem programas encerrados, sem regional, sem o dono", () => {
    assert.ok(!TERMOS_PROIBIDOS_REGEX.test(sem(tudo)));
    assert.ok(!/financ|crédito|empréstimo|garant|regional|Diego|carro/i.test(tudo), tudo);
  });

  test("Caio: rascunho \"Caio: lojas de veículos\" com concordância e assinatura configurável", () => {
    const caio = sequenciaDoVendedor({ nome: "Caio", slug: "caio", segmentos: ["vehicle"], assinatura: "Caio, assistente comercial | NovoSeminovo" });
    assert.equal(caio.nome, "Caio: lojas de veículos");
    assert.match(caio.passos[0]!.corpo, /Sou o Caio/);
    assert.match(caio.passos[2]!.corpo, /Obrigado pela atenção/);
    for (const p of caio.passos) assert.match(p.corpo, /Caio, assistente comercial \| NovoSeminovo$/);
    assert.ok(!/Arquiteto/.test(JSON.stringify(caio)));
  });

  test("roteiro escolhido pelo segmento DA EMPRESA, não pelo vendedor", () => {
    for (const seg of ["property", "broker"]) {
      const s = sistemaVendedor({ nome: "Caio", slug: "caio" }, [], seg);
      assert.match(s, /ZAP|VivaReal/);
      assert.match(s, /VRSync/, "integração por feed XML existe em apps/api/src/integrations");
      assert.match(s, /corretor autônomo/i);
      assert.match(s, /Arquiteto NovoSeminovo/);
      assert.match(s, /um assistente virtual/);
    }
    const loja = sistemaVendedor({ nome: "Nina", slug: "nina" }, [], "vehicle");
    assert.match(loja, /OLX\/Webmotors/);
    assert.ok(!/VRSync|Arquiteto/.test(loja));
    assert.match(loja, /uma assistente virtual/);
  });
});

describe("Caixas, remetente por sequência e segmentos no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `vc${Date.now().toString(36)}`;
  const notificacoes = { notify: async () => undefined };
  const sequencias = new ProspeccaoSequenciasService(prisma);
  const service = new VendedoresService(prisma, sequencias, notificacoes as never);
  const enviados: MensagemProspeccao[] = [];
  const contato = caixaFalsa("contato@novoseminovo.com.br");
  const atendimento = caixaFalsa("atendimento@novoseminovo.com.br");
  const envAntes = { ...process.env };
  // Dia só deste arquivo (os outros testes de prospecção usam 2030): o teto
  // e o intervalo por caixa não se misturam com os deles.
  const seg10h = new Date("2031-03-03T13:00:00Z"); // segunda, 10h em Brasília
  const min = (n: number, base = seg10h) => new Date(base.getTime() + n * 60_000);
  const dia = (n: number) => new Date(seg10h.getTime() + n * 86_400_000);
  const ids = { dono: "", veic1: "", veic2: "", imob: "", respondida: "", seqS: "", cards: {} as Record<string, string> };
  const so = () => ({ somenteVendedores: [ids.veic1, ids.veic2, ids.imob] });
  const emailDe = (n: string) => `${n}-${tag}@exemplo.com.br`;
  const relatorios: string[] = [];
  const seqDe = async (v: string) => (await prisma.salesAgent.findUniqueOrThrow({ where: { id: v } })).sequenceId!;
  const card = (nome: string, segment: string, o: Record<string, unknown> = {}) =>
    prisma.salesProspect.create({ data: { name: `${nome} ${tag}`, segment, city: "Belo Horizonte", email: emailDe(nome), source: "mailerfind", campaignTag: `Etq ${tag}`, stage: "a_abordar", ...o } });
  let dir = "";

  before(async () => {
    Object.assign(process.env, { WEB_ORIGIN: "https://novoseminovo.com.br", PUBLIC_API_URL: "https://api.novoseminovo.com.br" });
    delete process.env.ANTHROPIC_API_KEY;
    for (const k of Object.keys(process.env)) if (k.startsWith("PROSPECCAO_")) delete process.env[k];
    Logger.overrideLogger({ log: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, verbose: () => undefined } as never);
    dir = mkdtempSync(join(tmpdir(), "caixas-"));
    ids.dono = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "admin" } })).id;
    const mk = (slug: string, o: Record<string, unknown>) => prisma.salesAgent.create({ data: { slug: `${slug}${tag}`, name: slug.toUpperCase(), active: true, liveSince: seg10h, ...o } });
    // Dois vendedores de lojas no rodízio (criados direto no banco) e um de imóveis.
    ids.veic1 = (await mk("vei", { mailbox: "prospeccao", segments: ["vehicle"] })).id;
    ids.veic2 = (await mk("veidois", { mailbox: "prospeccao", segments: ["vehicle"] })).id;
    ids.imob = (await mk("imo", { mailbox: "atendimento", segments: ["property", "broker"] })).id;
    for (const n of ["v1", "v2", "v3", "v4"]) ids.cards[n] = (await card(n, "vehicle")).id;
    ids.cards.p1 = (await card("p1", "property")).id;
    ids.cards.b1 = (await card("b1", "broker")).id;
    for (const n of ["o1", "o2"]) ids.cards[n] = (await card(n, "other")).id;
    sequencias.usarEnvio(async (m) => {
      enviados.push(m);
      return { messageId: m.messageId };
    });
    service.usarEnvio(async (m) => {
      enviados.push(m);
      return { messageId: m.messageId };
    });
    service.usarCaixa(contato.caixa, "prospeccao");
    service.usarCaixa(atendimento.caixa, "atendimento");
    setRoutineSink(async (r) => void relatorios.push(`${r.name}${r.error ? `:${r.error}` : ""}`));
  });

  after(async () => {
    setRoutineSink(undefined);
    Logger.overrideLogger(new ConsoleLogger());
    for (const k of Object.keys(process.env)) if (!(k in envAntes)) delete process.env[k];
    Object.assign(process.env, envAntes);
    rmSync(dir, { recursive: true, force: true });
    await prisma.prospectSequence.deleteMany({ where: { OR: [{ salesAgent: { slug: { contains: tag } } }, { name: { contains: tag } }] } });
    const agentes = await prisma.salesAgent.findMany({ where: { slug: { contains: tag } }, select: { sequenceId: true } });
    await prisma.prospectSequence.deleteMany({ where: { id: { in: agentes.map((a) => a.sequenceId).filter((x): x is string => Boolean(x)) } } });
    const emails = (await prisma.salesProspect.findMany({ where: { OR: [{ name: { contains: tag } }, { campaignTag: { contains: tag } }] }, select: { email: true } })).map((c) => c.email).filter((e): e is string => Boolean(e));
    await prisma.prospectSuppression.deleteMany({ where: { addressHmac: { in: emails.map((e) => blindIndex("email", e, currentDataKeys())) } } });
    await prisma.salesProspect.deleteMany({ where: { OR: [{ name: { contains: tag } }, { campaignTag: { contains: tag } }] } });
    await prisma.salesAgent.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.mktSetting.deleteMany({ where: { chave: { in: ["prospeccao_imap", "prospeccao_imap:atendimento", "prospeccao_estado", "prospeccao_estado:atendimento"] } } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("rodízio pelo segmento da empresa: lojas entre os dois de lojas; imobiliária e corretor para o de imóveis; \"outros\" ficam sem vendedor", async () => {
    const r = await service.distribuir(seg10h, { somenteCards: Object.values(ids.cards), ...so() });
    assert.equal(r.atribuidas, 6);
    assert.equal(r.semVendedor, 2);
    const cards = await prisma.salesProspect.findMany({ where: { id: { in: Object.values(ids.cards) } }, select: { id: true, segment: true, salesAgentId: true } });
    const de = (v: string) => cards.filter((c) => c.salesAgentId === v);
    assert.equal(de(ids.veic1).length, 2);
    assert.equal(de(ids.veic2).length, 2);
    assert.ok([...de(ids.veic1), ...de(ids.veic2)].every((c) => c.segment === "vehicle"));
    assert.deepEqual(de(ids.imob).map((c) => c.segment).sort(), ["broker", "property"]);
    assert.equal(cards.filter((c) => c.segment === "other" && c.salesAgentId === null).length, 2, "sem vendedor para este segmento");
    const painel = await service.painel(seg10h);
    const outros = painel.semVendedor.find((x) => x.segmento === "other");
    assert.ok((outros?.quantidade ?? 0) >= 2);
    assert.match(outros!.rotulo, /sem vendedor para este segmento/);
    // A sequência padrão do vendedor de imóveis manda o texto de imóveis e é dele.
    const seqImob = await prisma.prospectSequence.findUniqueOrThrow({ where: { id: await seqDe(ids.imob) } });
    assert.equal(seqImob.salesAgentId, ids.imob);
    assert.equal(seqImob.status, "rascunho", "nunca ativa sozinha");
  });

  test("cada caixa manda os seus e-mails: remetente, nome, rodapé e saída; teto e intervalo por caixa", async () => {
    for (const v of [ids.veic1, ids.veic2, ids.imob]) await sequencias.aprovar(await seqDe(v), ids.dono);
    const seqs = await Promise.all([ids.veic1, ids.veic2, ids.imob].map(seqDe));
    // No mesmo minuto sai um de cada caixa (o intervalo é por caixa).
    assert.equal(await sequencias.tick(seg10h, { somenteSequencias: seqs }), "enviado");
    assert.deepEqual(enviados.map((m) => m.caixa).sort(), ["atendimento", "prospeccao"]);
    const imob = enviados.find((m) => m.caixa === "atendimento")!;
    assert.equal(imob.deNome, "IMO | NovoSeminovo");
    assert.match(imob.cabecalhos["List-Unsubscribe"]!, /mailto:atendimento@novoseminovo\.com\.br\?subject=SAIR/);
    assert.match(imob.texto, /https:\/\/novoseminovo\.com\.br\/sair\//, "rodapé com link de saída");
    assert.match(imob.texto, /imobiliárias e corretores/, "primeira abordagem de imóveis");
    const log = await prisma.prospectEmailLog.findFirstOrThrow({ where: { messageId: imob.messageId } });
    assert.equal(log.mailbox, "atendimento");
    // Teto diário por caixa: o atendimento@ chega ao teto e para; o contato@ continua.
    const teto = (await sequencias.ajustes()).limiteDiario;
    await prisma.prospectEmailLog.createMany({ data: Array.from({ length: teto - 1 }, () => ({ enrollmentId: log.enrollmentId, step: 9, status: "enviado", mailbox: "atendimento", createdAt: seg10h })) });
    for (let i = 1; i < 6; i++) await sequencias.tick(min(i * 7), { somenteSequencias: seqs });
    assert.equal(enviados.filter((m) => m.caixa === "atendimento").length, 1, "atendimento@ no teto do dia");
    assert.equal(enviados.filter((m) => m.caixa === "prospeccao").length, 4, "contato@ manda os 4 cards de lojas");
    await prisma.prospectEmailLog.deleteMany({ where: { enrollmentId: log.enrollmentId, step: 9 } });
  });

  test("remetente por sequência: sequência do dono com vendedor sai pela caixa dele e a empresa passa a ser dele", async () => {
    const s1 = (await card("s1", "other")).id;
    ids.seqS = (await sequencias.salvar(undefined, { nome: `Seq S ${tag}`, passos: [{ assunto: "Oi {{empresa}}", corpo: "Texto aprovado pelo dono.", esperaDias: 0 }] }, ids.dono)).id;
    await sequencias.definirRemetente(ids.seqS, { vendedorId: ids.imob });
    await sequencias.aprovar(ids.seqS, ids.dono);
    assert.equal((await sequencias.inscrever(ids.seqS, { ids: [s1] }, ids.dono, min(60))).inscritas, 1);
    const antes = enviados.length;
    await sequencias.tick(min(61), { somenteSequencias: [ids.seqS] });
    const m = enviados.slice(antes).find((x) => x.para === emailDe("s1"))!;
    assert.equal(m.caixa, "atendimento");
    assert.equal(m.deNome, "IMO | NovoSeminovo");
    assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id: s1 } })).salesAgentId, ids.imob, "respostas vão para quem mandou");
    const painel = await sequencias.painel();
    assert.equal(painel.sequencias.find((x) => x.id === ids.seqS)!.remetente?.endereco, "atendimento@novoseminovo.com.br");
    await assert.rejects(sequencias.definirRemetente(ids.seqS, { vendedorId: "nao-existe" }), /não encontrado/);
  });

  test("leitura: uma rotina por caixa, cada uma com o seu nome e o seu estado; resposta guardada com a caixa e respondida por ela", async () => {
    assert.deepEqual(service.rotinasDeLeitura().map((r) => r.nome), ["prospeccao-caixa-prospeccao", "prospeccao-caixa-atendimento"]);
    const primeiro = enviados.find((m) => m.caixa === "atendimento")!;
    const p = primeiro.para === emailDe("p1") ? "p1" : "b1";
    ids.respondida = ids.cards[p]!;
    atendimento.chega({ de: primeiro.para, assunto: "Re: oi", texto: "Como funciona a integração com o meu CRM?", id: `<r1-${tag}@x>`, inReplyTo: primeiro.messageId });
    relatorios.length = 0;
    await service.lerTodasAsCaixas(min(200));
    assert.deepEqual(relatorios.sort(), ["prospeccao-caixa-atendimento", "prospeccao-caixa-prospeccao"]);
    const msg = await prisma.prospectMessage.findUniqueOrThrow({ where: { messageId: `<r1-${tag}@x>` } });
    assert.equal(msg.mailbox, "atendimento");
    assert.equal(msg.prospectId, ids.cards[p]);
    assert.equal(msg.salesAgentId, ids.imob);
    const estado = await prisma.mktSetting.findUnique({ where: { chave: "prospeccao_imap:atendimento" } });
    assert.equal((estado?.valor as { uid?: number }).uid, 1);
    await service.lerTodasAsCaixas(min(205));
    assert.equal(await prisma.prospectMessage.count({ where: { prospectId: ids.cards[p], direction: "in" } }), 1, "ler de novo não duplica");
    // IA desligada: rascunho vazio "responder à mão"; o dono escreve e aprova.
    const d = await prisma.prospectReplyDraft.findFirstOrThrow({ where: { inboundId: msg.id } });
    const antes = enviados.length;
    const r = await service.aprovar(d.id, { texto: "Oi! O painel aceita o link do feed XML do seu CRM." }, ids.dono, min(210));
    assert.equal(r.status, "enviado");
    const resposta = enviados[antes]!;
    assert.equal(resposta.caixa, "atendimento", "resposta sai pela caixa onde chegou");
    assert.equal(resposta.inReplyTo, `<r1-${tag}@x>`);
    assert.match(resposta.texto, /IMO, assistente comercial da NovoSeminovo/);
    assert.match(resposta.texto, /sair/);
  });

  test("saída numa caixa vale para todas: pediu SAIR no atendimento@, nenhuma caixa inscreve mais esse e-mail", async () => {
    const imob = await prisma.salesProspect.findUniqueOrThrow({ where: { id: ids.respondida } });
    const primeiro = await prisma.prospectEmailLog.findFirstOrThrow({ where: { enrollment: { prospectId: imob.id }, status: "enviado", step: 1 } });
    atendimento.chega({ de: imob.email!, assunto: "Re: oi", texto: "SAIR", id: `<sair-${tag}@x>`, inReplyTo: primeiro.messageId! });
    await service.lerCaixa(min(301), so(), "atendimento");
    assert.ok(await prisma.prospectSuppression.findUnique({ where: { addressHmac: blindIndex("email", imob.email!, currentDataKeys()) } }));
    // Outra empresa com o mesmo e-mail, de lojas (contato@): não entra.
    const loja = await prisma.salesProspect.create({ data: { name: `Grupo ${tag}`, segment: "vehicle", email: imob.email, source: "mailerfind", stage: "a_abordar", salesAgentId: ids.veic1 } });
    const r = await sequencias.inscrever(await seqDe(ids.veic1), { ids: [loja.id] }, ids.dono, min(302));
    assert.equal(r.inscritas, 0);
    assert.equal(r.puladas.sairam, 1);
  });

  test("o mesmo e-mail nunca fala com duas caixas: inscrição recusada e envio barrado (conflito registrado)", async () => {
    const a1 = await card("dup", "vehicle", { salesAgentId: ids.veic1 });
    assert.equal((await sequencias.inscrever(await seqDe(ids.veic1), { ids: [a1.id] }, ids.dono, dia(2))).inscritas, 1);
    const antes = enviados.length;
    for (let i = 0; i < 4 && !enviados.slice(antes).some((m) => m.para === emailDe("dup")); i++) await sequencias.tick(min(i * 7, dia(2)), { somenteSequencias: [await seqDe(ids.veic1)] });
    assert.ok(enviados.slice(antes).some((m) => m.para === emailDe("dup") && m.caixa === "prospeccao"), "o contato@ falou primeiro");
    // Mesma empresa cadastrada de novo como imobiliária (mesmo e-mail), do vendedor do atendimento@.
    const a2 = await prisma.salesProspect.create({ data: { name: `Dup imob ${tag}`, segment: "property", email: emailDe("dup"), source: "mailerfind", stage: "a_abordar", salesAgentId: ids.imob } });
    const r = await sequencias.inscrever(await seqDe(ids.imob), { ids: [a2.id] }, ids.dono, dia(2));
    assert.equal(r.inscritas, 0);
    assert.equal(r.puladas.outraCaixa, 1);
    // Mesmo que alguém force a inscrição no banco, o envio é barrado.
    const forcada = await prisma.prospectEnrollment.create({ data: { sequenceId: await seqDe(ids.imob), prospectId: a2.id, activeKey: a2.id, status: "agendado", nextSendAt: dia(3) } });
    const antes2 = enviados.length;
    for (let i = 0; i < 4; i++) await sequencias.tick(min(i * 7, dia(3)), { somenteSequencias: [await seqDe(ids.imob)] });
    assert.ok(!enviados.slice(antes2).some((m) => m.para === emailDe("dup")), "atendimento@ não manda para quem o contato@ já falou");
    const e = await prisma.prospectEnrollment.findUniqueOrThrow({ where: { id: forcada.id } });
    assert.equal(e.status, "parou");
    assert.equal(e.stopReason, "outra_caixa");
  });

  test("nunca em duas sequências ativas ao mesmo tempo (banco e inscrição); tirar da sequência (uma ou várias) libera", async () => {
    const d1 = await card("d1", "property", { salesAgentId: ids.imob });
    const d2 = await card("d2", "property", { salesAgentId: ids.imob });
    const seqImob = await seqDe(ids.imob);
    assert.equal((await sequencias.inscrever(seqImob, { ids: [d1.id, d2.id] }, ids.dono, dia(3))).inscritas, 2);
    const r = await sequencias.inscrever(ids.seqS, { ids: [d1.id] }, ids.dono, dia(3));
    assert.equal(r.inscritas, 0);
    assert.equal(r.puladas.emOutraSequencia, 1);
    await assert.rejects(prisma.prospectEnrollment.create({ data: { sequenceId: ids.seqS, prospectId: d1.id, activeKey: d1.id, status: "agendado" } }), (e: { code?: string }) => e.code === "P2002");
    // Tirar uma (d1) e depois várias de uma vez.
    assert.deepEqual(await sequencias.remover(seqImob, { ids: [d1.id] }), { removidas: 1 });
    assert.equal((await sequencias.inscrever(ids.seqS, { ids: [d1.id] }, ids.dono, dia(3))).inscritas, 1, "livre para outra sequência");
    assert.deepEqual(await sequencias.remover(seqImob, { ids: [d2.id, d1.id] }), { removidas: 1 });
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: seqImob, prospectId: { in: [d1.id, d2.id] } } }), 0);
    await assert.rejects(sequencias.remover(seqImob, { ids: [] }), /Escolha/);
  });

  test("inscrever por tipo (loja / imobiliária / corretor) e etiqueta", async () => {
    const b2 = await card("b2", "broker");
    await card("p9", "property");
    const r = await sequencias.inscrever(ids.seqS, { etiqueta: `Etq ${tag}`, segmento: "broker" }, ids.dono, dia(3));
    assert.equal(r.inscritas, 1);
    assert.ok(await prisma.prospectEnrollment.findFirst({ where: { sequenceId: ids.seqS, prospectId: b2.id } }));
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: ids.seqS, prospect: { segment: "property", name: { startsWith: "p9" } } } }), 0);
    await sequencias.mudarSegmento(b2.id, "property", ids.dono);
    assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id: b2.id } })).segment, "property");
    assert.ok(await prisma.salesNote.findFirst({ where: { prospectId: b2.id, body: { contains: "Corretor de imóveis → Imobiliária" } } }));
  });

  test("ativar: exige caixa configurada, primeira abordagem aprovada e caixa livre; assinatura editável e honesta", async () => {
    // Serviço sem SMTP falso: vale a configuração de verdade (.env + arquivo).
    const real = new VendedoresService(prisma, new ProspeccaoSequenciasService(prisma), notificacoes as never);
    const x = await prisma.salesAgent.create({ data: { slug: `x${tag}`, name: "Xavier", mailbox: "atendimento", segments: ["vehicle"] } });
    await prisma.salesAgent.update({ where: { id: ids.imob }, data: { active: false } });
    await assert.rejects(real.ajustar(x.id, { ativo: true }), /atendimento@novoseminovo\.com\.br não está configurada.*PROSPECCAO_ATENDIMENTO_SMTP_HOST/);
    const arq = join(dir, "prospeccao_atendimento_smtp_password");
    writeFileSync(arq, "senha-nunca-no-log\n");
    chmodSync(arq, 0o600);
    Object.assign(process.env, { PROSPECCAO_ATENDIMENTO_SMTP_HOST: "smtp.invalido", PROSPECCAO_ATENDIMENTO_SMTP_USER: "atendimento@novoseminovo.com.br", PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: arq });
    await assert.rejects(real.ajustar(x.id, { ativo: true }), /[Aa]prove a primeira abordagem/);
    await sequencias.aprovar(await real.garantirSequenciaDoVendedor(x.id), ids.dono);
    await real.ajustar(x.id, { ativo: true }, seg10h);
    const ativo = await prisma.salesAgent.findUniqueOrThrow({ where: { id: x.id } });
    assert.equal(ativo.active, true);
    assert.ok(ativo.liveSince);
    await assert.rejects(real.ajustar(ids.imob, { ativo: true }), /já é usada por Xavier/);
    await assert.rejects(real.ajustar(ids.veic1, { caixa: "atendimento" }), /já é usada por Xavier/);
    await real.ajustar(x.id, { segmentos: ["vehicle", "other"] });
    assert.deepEqual((await prisma.salesAgent.findUniqueOrThrow({ where: { id: x.id } })).segments, ["vehicle", "other"]);
    await assert.rejects(real.ajustar(x.id, { segmentos: ["barco"] } as never), /inválid|Invalid/i);
    // Assinatura: com o nome e "assistente"; sem link, sem se passar por pessoa.
    await assert.rejects(real.ajustar(x.id, { assinatura: "Diego Louis, NovoSeminovo" }), /nome "Xavier"/);
    await assert.rejects(real.ajustar(x.id, { assinatura: "Xavier, assistente https://evil.com" }), /sem link/);
    await real.ajustar(x.id, { assinatura: "Xavier, assistente virtual de vendas | NovoSeminovo" });
    const painel = await real.painel(seg10h);
    const vx = painel.vendedores.find((v) => v.id === x.id)!;
    assert.equal(vx.assinatura, "Xavier, assistente virtual de vendas | NovoSeminovo");
    assert.deepEqual(vx.caixaStatus, { chave: "atendimento", endereco: "atendimento@novoseminovo.com.br", configurada: true, leitura: true, vendedorAtivo: "Xavier" });
    assert.ok(!JSON.stringify(painel).includes("senha-nunca-no-log"));
    await real.ajustar(x.id, { assinatura: "" });
    assert.equal((await prisma.salesAgent.findUniqueOrThrow({ where: { id: x.id } })).signature, null, "vazia volta ao padrão");
    await real.ajustar(x.id, { ativo: false });
    await real.ajustar(ids.imob, { ativo: true });
  });

  test("arrumação das sequências do marketing: prévia sem mexer em nada, aplicar uma vez, rodar de novo não muda", async () => {
    const caio = await prisma.salesAgent.create({ data: { slug: `caio${tag}`, name: "Caio", mailbox: "atendimento", segments: ["property"] } });
    const nina = await prisma.salesAgent.create({ data: { slug: `nina${tag}`, name: "Nina", mailbox: "prospeccao" } });
    const nomes = { lojasBh: `Lojas BH ${tag}`, caioLojas: `Caio: lojas ${tag}`, ninaImoveis: `Nina: imoveis ${tag}`, caio: caio.slug, nina: nina.slug };
    const passos = [{ assunto: "Oi", corpo: "Texto do marketing.", esperaDias: 0 }];
    const mkSeq = (name: string) => prisma.prospectSequence.create({ data: { name, status: "rascunho", steps: passos } });
    const [sB, sC, sN] = [await mkSeq(nomes.lojasBh), await mkSeq(nomes.caioLojas), await mkSeq(nomes.ninaImoveis)];
    const mkCard = (n: string, segment: string, email = emailDe(n)) => prisma.salesProspect.create({ data: { name: `${n} ${tag}`, segment, email, source: "mailerfind", stage: "a_abordar", salesAgentId: caio.id } });
    const inscr = (seq: string, c: { id: string }, stepsSent = 0) => prisma.prospectEnrollment.create({ data: { sequenceId: seq, prospectId: c.id, activeKey: c.id, status: "agendado", stepsSent, nextSendAt: dia(10) } });
    const l1 = await mkCard("l1", "vehicle");
    const l1dup = await mkCard("l1dup", "vehicle", emailDe("l1")); // mesma loja cadastrada duas vezes
    const c1 = await mkCard("c1", "vehicle");
    const c2 = await mkCard("c2", "property");
    const c3 = await mkCard("c3", "broker");
    const c4 = await mkCard("c4", "property");
    await inscr(sB.id, l1);
    await inscr(sC.id, l1dup);
    for (const c of [c1, c2, c3]) await inscr(sC.id, c);
    await inscr(sC.id, c4, 1); // já recebeu e-mail: não mexe

    const previa = await service.arrumarSequencias(false, ids.dono, nomes, dia(4));
    assert.equal(previa.aplicada, false);
    assert.equal(previa.tiradasPorLojasBh, 1);
    assert.equal(previa.movidasParaNina, 2);
    assert.deepEqual(previa.inscritasAntes, { [nomes.lojasBh]: 1, [nomes.caioLojas]: 5, [nomes.ninaImoveis]: 0 });
    assert.deepEqual(previa.inscritasDepois, { [nomes.lojasBh]: 1, [nomes.caioLojas]: 2, [nomes.ninaImoveis]: 2 });
    assert.ok(previa.conflitos.some((c) => c.empresa === `c4 ${tag}`));
    assert.deepEqual(previa.remetentes.map((r) => r.vendedorDepois), ["Caio", "Caio", "Nina"]);
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: sC.id } }), 5, "prévia não mexe em nada");
    assert.equal((await prisma.prospectSequence.findUniqueOrThrow({ where: { id: sB.id } })).salesAgentId, null);

    const enviadosAntes = enviados.length;
    const r = await service.arrumarSequencias(true, ids.dono, nomes, dia(4));
    assert.equal(r.aplicada, true);
    assert.deepEqual(r.inscritasDepois, previa.inscritasDepois);
    assert.equal(enviados.length, enviadosAntes, "nada é enviado");
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: sC.id, prospectId: l1dup.id } }), 0, "já estava na Lojas BH");
    assert.equal(await prisma.prospectEnrollment.count({ where: { sequenceId: sB.id, prospectId: l1.id } }), 1, "fica na Lojas BH");
    const naNina = await prisma.prospectEnrollment.findMany({ where: { sequenceId: sN.id }, select: { prospectId: true, activeKey: true } });
    assert.deepEqual(naNina.map((e) => e.prospectId).sort(), [c2.id, c3.id].sort());
    assert.ok(naNina.every((e) => e.activeKey === e.prospectId));
    const donos = await prisma.salesProspect.findMany({ where: { id: { in: [c1.id, c2.id, c3.id, l1.id] } }, select: { id: true, salesAgentId: true } });
    assert.equal(donos.find((d) => d.id === c2.id)!.salesAgentId, nina.id);
    assert.equal(donos.find((d) => d.id === c3.id)!.salesAgentId, nina.id);
    assert.equal(donos.find((d) => d.id === c1.id)!.salesAgentId, caio.id);
    const seqs = await prisma.prospectSequence.findMany({ where: { id: { in: [sB.id, sC.id, sN.id] } } });
    assert.equal(seqs.find((x) => x.id === sB.id)!.salesAgentId, caio.id);
    assert.equal(seqs.find((x) => x.id === sC.id)!.salesAgentId, caio.id);
    assert.equal(seqs.find((x) => x.id === sN.id)!.salesAgentId, nina.id);
    assert.ok(seqs.every((x) => x.status === "rascunho" && !x.approvedAt), "nunca aprova nem ativa");
    assert.ok(seqs.every((x) => JSON.stringify(x.steps).includes("Texto do marketing.")), "texto intocado");
    const [caioDepois, ninaDepois] = await Promise.all([prisma.salesAgent.findUniqueOrThrow({ where: { id: caio.id } }), prisma.salesAgent.findUniqueOrThrow({ where: { id: nina.id } })]);
    assert.deepEqual(caioDepois.segments, ["vehicle"]);
    assert.equal(caioDepois.sequenceId, sC.id);
    assert.deepEqual(ninaDepois.segments, ["property", "broker"]);
    assert.equal(ninaDepois.sequenceId, sN.id);

    const deNovo = await service.arrumarSequencias(true, ids.dono, nomes, dia(4));
    assert.equal(deNovo.movidasParaNina, 0);
    assert.equal(deNovo.tiradasPorLojasBh, 0);
    assert.equal(deNovo.cardsTrocados, 0);
    assert.deepEqual(deNovo.inscritasDepois, r.inscritasDepois);
  });
});
