import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { NpsEmailFollowUpSchema, NpsEmailTokenSchema } from "@novoseminovo/shared-types";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NpsService } from "./nps.service";
import { addBusinessDays, computeNps, firstName, isSendWindow, renderNpsEmail, signNpsToken, verifyNpsToken } from "./nps-email";
import { type NpsEmailMessage, NpsEmailService } from "./nps-email.service";

// Pesquisa NPS por e-mail (a cada 6 meses): tokens assinados, horário e
// limite de envio, quem recebe, lembrete único, clique idempotente,
// pergunta de acompanhamento, tarefa para o Comercial, descadastro (LGPD),
// e-mail de teste e trava até o dono aprovar.

const DAY = 86_400_000;
// Segunda-feira, 10h em Brasília (13h UTC).
const SEG_10H = new Date("2026-11-16T13:00:00Z");

describe("NPS por e-mail: regras puras", () => {
  test("token assinado: confere nota, assinatura e validade", () => {
    const exp = new Date(SEG_10H.getTime() + 30 * DAY);
    const t = signNpsToken("pesq1", 9, exp);
    assert.ok(NpsEmailTokenSchema.safeParse({ token: t }).success, "formato aceito pelo zod");
    assert.deepEqual(verifyNpsToken(t, SEG_10H), { surveyId: "pesq1", kind: "nota", score: 9 });
    // Trocar a nota na URL invalida a assinatura.
    const [id, , e, sig] = t.split(".");
    assert.equal(verifyNpsToken(`${id}.10.${e}.${sig}`, SEG_10H), null);
    assert.equal(verifyNpsToken(`${id}.9.${e}.${sig!.slice(0, -1)}${sig!.endsWith("A") ? "B" : "A"}`, SEG_10H), null);
    // Esticar a validade também.
    assert.equal(verifyNpsToken(`${id}.9.${(Number.parseInt(e!, 36) + 999).toString(36)}.${sig}`, SEG_10H), null);
    assert.equal(verifyNpsToken(t, new Date(exp.getTime() + 1000)), "expirado");
    assert.equal(verifyNpsToken("lixo", SEG_10H), null);
    assert.equal(verifyNpsToken("x'; drop table users;--.9.abc.aaaaaaaaaaaaaaaaaaaaaa", SEG_10H), null);
    const c = signNpsToken("pesq1", "c", exp);
    assert.deepEqual(verifyNpsToken(c, SEG_10H), { surveyId: "pesq1", kind: "acompanhamento" });
    const s = signNpsToken("pesq1", "s", exp);
    assert.deepEqual(verifyNpsToken(s, SEG_10H), { surveyId: "pesq1", kind: "sair" });
    // Token de acompanhamento não serve para descadastrar e vice-versa.
    const [cid, , ce, csig] = c.split(".");
    assert.equal(verifyNpsToken(`${cid}.s.${ce}.${csig}`, SEG_10H), null);
  });

  test("só envia de segunda a sexta, das 9h às 18h de Brasília", () => {
    assert.equal(isSendWindow(SEG_10H), true);
    assert.equal(isSendWindow(new Date("2026-11-16T11:59:00Z")), false, "8h59 em Brasília");
    assert.equal(isSendWindow(new Date("2026-11-16T12:00:00Z")), true, "9h em Brasília");
    assert.equal(isSendWindow(new Date("2026-11-20T20:59:00Z")), true, "sexta 17h59");
    assert.equal(isSendWindow(new Date("2026-11-20T21:00:00Z")), false, "sexta 18h");
    assert.equal(isSendWindow(new Date("2026-11-21T14:00:00Z")), false, "sábado");
    assert.equal(isSendWindow(new Date("2026-11-22T14:00:00Z")), false, "domingo");
  });

  test("dias úteis: quinta + 2 = segunda; sexta + 2 = terça", () => {
    assert.equal(addBusinessDays(new Date("2026-11-19T15:00:00Z"), 2).toISOString(), "2026-11-23T15:00:00.000Z");
    assert.equal(addBusinessDays(new Date("2026-11-20T15:00:00Z"), 2).toISOString(), "2026-11-24T15:00:00.000Z");
  });

  test("conta do NPS: % promotores − % detratores, sem divisão por zero", () => {
    assert.deepEqual(computeNps([]), { respostas: 0, promotores: 0, neutros: 0, detratores: 0, nps: null });
    assert.deepEqual(computeNps([10, 9, 8, 7, 6, 0]), { respostas: 6, promotores: 2, neutros: 2, detratores: 2, nps: 0 });
    assert.equal(computeNps([10, 10, 10]).nps, 100);
    assert.equal(computeNps([0, 3, 6]).nps, -100);
    assert.equal(computeNps([10, 9, 7]).nps, 67, "arredonda");
  });

  test("primeiro nome: sem nome, sem nome", () => {
    assert.equal(firstName("  Mariana de Souza "), "Mariana");
    assert.equal(firstName(""), undefined);
    assert.equal(firstName(undefined), undefined);
  });

  test("e-mail: assunto, texto exato, 11 botões assinados, rodapé com descadastro e CNPJ", () => {
    const links = Array.from({ length: 11 }, (_, n) => `http://localhost:3000/nps/r/tok${n}`);
    const m = renderNpsEmail({ nome: "Mariana", empresa: "Loja Exemplo", notas: links, sair: "http://localhost:3000/nps/sair/toks" });
    assert.equal(m.subject, "Loja Exemplo, 1 minuto para nos ajudar?");
    for (const trecho of [
      "Olá, Mariana! Tudo bem?",
      "A cada 6 meses a gente pergunta aos parceiros como está a experiência com o NovoSeminovo, para melhorar o que importa para você.",
      "De 0 a 10, quanto você recomendaria o NovoSeminovo a outra loja, imobiliária ou corretor?",
      "É só clicar na nota. Leva menos de 1 minuto.",
      "Obrigado por anunciar com a gente!",
      "Equipe NovoSeminovo · Carros e imóveis, sem enrolação.",
      "DLRLVM Soluções Ltda.",
      "60.327.011/0001-02",
    ]) {
      assert.ok(m.html.includes(trecho), `HTML tem: ${trecho}`);
      assert.ok(m.text.includes(trecho), `texto tem: ${trecho}`);
    }
    for (let n = 0; n <= 10; n++) {
      assert.ok(m.html.includes(`href="${links[n]}"`), `botão ${n}`);
      assert.ok(m.text.includes(`${n}: ${links[n]}`), `texto lista o link ${n}`);
    }
    assert.ok(m.html.includes('href="http://localhost:3000/nps/sair/toks"'));
    assert.ok(m.text.includes("http://localhost:3000/nps/sair/toks"));
    assert.match(m.html, /<table[^>]*role="presentation"/, "botões em tabela (Outlook/Gmail)");
    assert.doesNotMatch(m.html, /<style|<script|class=/, "só estilo inline");
    // Sem nome: cumprimento sem vírgula.
    const semNome = renderNpsEmail({ empresa: "Loja Exemplo", notas: links, sair: "http://localhost:3000/nps/sair/toks" });
    assert.ok(semNome.html.includes("Olá! Tudo bem?"));
    assert.ok(semNome.text.includes("Olá! Tudo bem?"));
  });

  test("e-mail escapa nome e empresa (sem HTML vindo do cadastro)", () => {
    const links = Array.from({ length: 11 }, (_, n) => `http://localhost:3000/nps/r/t${n}`);
    const m = renderNpsEmail({ nome: '<img src=x onerror="alert(1)">', empresa: 'Loja <script>alert("x")</script> & Cia', notas: links, sair: "http://localhost:3000/nps/sair/s" });
    assert.ok(!m.html.includes("<script>alert"));
    assert.ok(!m.html.includes("<img src=x"));
    assert.ok(m.html.includes("Loja &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cia"));
    // Assunto é texto puro, sem quebra de linha (cabeçalho).
    const quebra = renderNpsEmail({ empresa: "Loja\r\nBcc: x@y.z", notas: links, sair: "http://localhost:3000/nps/sair/s" });
    assert.doesNotMatch(quebra.subject, /[\r\n]/);
  });

  test("e-mail recusa link fora do site (só http(s) do nosso domínio)", () => {
    const ruins = Array.from({ length: 11 }, () => "javascript:alert(1)");
    assert.throws(() => renderNpsEmail({ empresa: "X", notas: ruins, sair: "http://localhost:3000/nps/sair/s" }));
    const fora = Array.from({ length: 11 }, () => "https://golpe.example/nps");
    assert.throws(() => renderNpsEmail({ empresa: "X", notas: fora, sair: "http://localhost:3000/nps/sair/s" }));
  });

  test("comentário: até 1000 caracteres, sem caracteres de controle", () => {
    const t = signNpsToken("p", "c", new Date(Date.now() + DAY));
    assert.equal(NpsEmailFollowUpSchema.safeParse({ token: t, comment: "a".repeat(1001) }).success, false);
    const ok = NpsEmailFollowUpSchema.parse({ token: t, comment: "  Bom\u0000 demais  " });
    assert.equal(ok.comment, "Bom demais");
    assert.equal(NpsEmailFollowUpSchema.safeParse({ token: "<script>", comment: "x" }).success, false);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("NPS por e-mail (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const email = new EmailService();
  const svc = new NpsEmailService(prisma, email);
  const painel = new NpsService(prisma);
  const enviados: NpsEmailMessage[] = [];
  const tag = `npsm-${Date.now()}`;
  const ids: Record<string, string> = {};
  const users: string[] = [];
  const partners: string[] = [];
  let scope: string[] = [];

  async function parceiro(chave: string, opts: { tipo?: "dealership" | "real_estate_agency" | "broker" | "workshop"; dias: number; nome?: string; user?: Record<string, unknown> }) {
    const u = await prisma.user.create({ data: { name: opts.nome ?? `Dono ${chave}`, email: `${chave}-${tag}@teste.local`, role: "partner_owner", ...(opts.user ?? {}) } });
    users.push(u.id);
    const p = await prisma.partner.create({
      data: { ownerUserId: u.id, type: opts.tipo ?? "dealership", legalName: `Empresa ${chave} ${tag}`, document: "11222333000181", slug: `${tag}-${chave}`, createdAt: new Date(SEG_10H.getTime() - opts.dias * DAY) },
    });
    partners.push(p.id);
    ids[chave] = p.id;
    ids[`${chave}User`] = u.id;
    return p.id;
  }

  before(async () => {
    svc.usarEnvio(async (m) => {
      enviados.push(m);
      return { id: `fake-${enviados.length}` };
    });
    await prisma.npsEmailSettings.deleteMany({});
    await parceiro("A", { dias: 200, nome: "Mariana Souza" });
    await prisma.salesProspect.create({ data: { name: `Empresa A ${tag}`, segment: "veiculos", partnerId: ids.A } });
    await parceiro("B", { tipo: "real_estate_agency", dias: 100 });
    await parceiro("C", { tipo: "broker", dias: 200 });
    await prisma.npsResponse.create({ data: { partnerId: ids.C!, userId: ids.CUser!, score: 8, createdAt: new Date(SEG_10H.getTime() - 30 * DAY) } });
    await parceiro("D", { tipo: "workshop", dias: 200 });
    await parceiro("E", { dias: 200, user: { status: "suspended" } });
    await parceiro("F", { dias: 200, user: { npsEmailOptOutAt: new Date() } });
    await parceiro("G", { dias: 200 });
    await prisma.prospectSuppression.create({ data: { addressHmac: blindIndex("email", `G-${tag}@teste.local`, currentDataKeys()), reason: "link" } });
    await parceiro("H", { dias: 200 });
    await prisma.marketingContact.create({ data: { email: `H-${tag}@teste.local`, userId: ids.HUser, source: "teste", status: "unsubscribed", unsubscribedAt: new Date() } });
    await parceiro("I", { dias: 200 });
    await prisma.hubMark.create({ data: { key: ids.I!, naoContatar: true, motivoNaoContatar: "Pediu por telefone" } });
    await parceiro("J", { tipo: "real_estate_agency", dias: 400 });
    await prisma.npsResponse.create({ data: { partnerId: ids.J!, userId: ids.JUser!, score: 10, createdAt: new Date(SEG_10H.getTime() - 200 * DAY) } });
    await parceiro("K", { tipo: "broker", dias: 200, user: { blockedAt: new Date() } });
    // Empresa só da prospecção (sem conta no site): nunca recebe.
    ids.prospect = (await prisma.salesProspect.create({ data: { name: `Prospect ${tag}`, segment: "veiculos", email: `prospect-${tag}@teste.local` } })).id;
    scope = [...partners];
  });

  after(async () => {
    await prisma.hubTask.deleteMany({ where: { title: { contains: tag } } });
    await prisma.npsResponse.deleteMany({ where: { partnerId: { in: partners } } });
    await prisma.npsEmailSurvey.deleteMany({ where: { OR: [{ partnerId: { in: partners } }, { userId: { in: users } }] } });
    await prisma.hubMark.deleteMany({ where: { key: { in: partners } } });
    await prisma.marketingContact.deleteMany({ where: { userId: { in: users } } });
    await prisma.prospectSuppression.deleteMany({ where: { addressHmac: blindIndex("email", `G-${tag}@teste.local`, currentDataKeys()) } });
    await prisma.salesNote.deleteMany({ where: { prospect: { OR: [{ partnerId: { in: partners } }, { id: ids.prospect }] } } });
    await prisma.salesProspect.deleteMany({ where: { OR: [{ partnerId: { in: partners } }, { id: ids.prospect }] } });
    await prisma.partner.deleteMany({ where: { id: { in: partners } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.npsEmailSettings.deleteMany({});
    await prisma.$disconnect();
  });

  test("quem recebe: só parceiros ativos (loja, imobiliária, corretor) com 6 meses, sem resposta recente e sem descadastro", async () => {
    const lista = (await svc.candidates(SEG_10H, scope)).map((c) => c.partnerId);
    assert.ok(lista.includes(ids.A!), "loja com 200 dias");
    assert.ok(lista.includes(ids.J!), "respondeu há mais de 6 meses");
    for (const fora of ["B", "C", "D", "E", "F", "G", "H", "I", "K"]) assert.ok(!lista.includes(ids[fora]!), `${fora} fica de fora`);
    const todos = await svc.candidates(SEG_10H);
    assert.ok(todos.every((c) => c.partnerId), "prospect sem cadastro nunca entra");
    assert.ok(!todos.some((c) => c.email === `prospect-${tag}@teste.local`));
  });

  test("trava: nada sai antes do dono aprovar, nem com pausa", async () => {
    let r = await svc.tick(SEG_10H, { scope });
    assert.equal(r.enviados, 0);
    assert.match(r.motivo ?? "", /aprova/i);
    await svc.approve(ids.AUser!);
    await svc.setPaused(ids.AUser!, true);
    r = await svc.tick(SEG_10H, { scope });
    assert.equal(r.enviados, 0);
    assert.match(r.motivo ?? "", /pausad/i);
    await svc.setPaused(ids.AUser!, false);
    assert.equal(enviados.length, 0);
  });

  test("fora do horário comercial não envia", async () => {
    const r = await svc.tick(new Date("2026-11-21T14:00:00Z"), { scope });
    assert.equal(r.enviados, 0);
    assert.equal(enviados.length, 0);
  });

  test("limite diário: espalha os envios", async () => {
    // Outros envios do mesmo dia no banco (outros testes) contam no limite.
    const inicioDia = new Date("2026-11-16T03:00:00Z");
    const fimDia = new Date("2026-11-17T03:00:00Z");
    const jaHoje =
      (await prisma.npsEmailSurvey.count({ where: { test: false, sentAt: { gte: inicioDia, lt: fimDia } } })) +
      (await prisma.npsEmailSurvey.count({ where: { test: false, reminderSentAt: { gte: inicioDia, lt: fimDia } } }));
    await prisma.npsEmailSettings.update({ where: { id: "geral" }, data: { dailyCap: jaHoje + 1 } });
    let r = await svc.tick(SEG_10H, { scope, budget: 10 });
    assert.equal(r.enviados, 1, JSON.stringify(r));
    r = await svc.tick(new Date(SEG_10H.getTime() + 3600_000), { scope, budget: 10 });
    assert.equal(r.enviados, 0, "limite do dia já usado");
    await prisma.npsEmailSettings.update({ where: { id: "geral" }, data: { dailyCap: jaHoje + 50 } });
    r = await svc.tick(new Date(SEG_10H.getTime() + 2 * 3600_000), { scope, budget: 10 });
    assert.equal(r.enviados, 1, "a outra empresa sai depois");
    assert.equal(enviados.length, 2);
    r = await svc.tick(new Date(SEG_10H.getTime() + 3 * 3600_000), { scope, budget: 10 });
    assert.equal(r.enviados, 0, "não repete dentro de 6 meses");
  });

  test("e-mail enviado: remetente do site, assunto, nome e links assinados do nosso domínio", () => {
    const a = enviados.find((m) => m.to === `A-${tag}@teste.local`)!;
    assert.ok(a, "foi para o dono da loja A");
    assert.equal(a.subject, `Empresa A ${tag}, 1 minuto para nos ajudar?`);
    assert.ok(a.html.includes("Olá, Mariana! Tudo bem?"));
    const links = [...a.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]!);
    assert.ok(links.length >= 12);
    assert.ok(links.every((l) => l.startsWith("http://localhost:3000/")), "só links do site");
    assert.match(a.headers["List-Unsubscribe"] ?? "", /^<http:\/\/localhost:4000\/nps\/sair\//);
    assert.equal(a.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  test("lembrete: um só, 5 dias depois, para quem não respondeu", async () => {
    const quatroDias = new Date(SEG_10H.getTime() + 4 * DAY); // sexta
    let r = await svc.tick(quatroDias, { scope, budget: 10 });
    assert.equal(r.lembretes, 0, "ainda não deu 5 dias");
    // A loja A responde no painel; J não responde.
    await prisma.npsResponse.create({ data: { partnerId: ids.A!, userId: ids.AUser!, score: 7, createdAt: new Date(SEG_10H.getTime() + DAY) } });
    const seteDias = new Date(SEG_10H.getTime() + 7 * DAY); // segunda seguinte
    r = await svc.tick(seteDias, { scope, budget: 10 });
    assert.equal(r.lembretes, 1);
    const lembrete = enviados.at(-1)!;
    assert.equal(lembrete.to, `J-${tag}@teste.local`);
    r = await svc.tick(new Date(seteDias.getTime() + 3600_000), { scope, budget: 10 });
    assert.equal(r.lembretes, 0, "nunca um segundo lembrete");
    await prisma.npsResponse.deleteMany({ where: { partnerId: ids.A!, source: "painel" } });
  });

  async function linkDe(para: string, nota: number) {
    const m = enviados.filter((x) => x.to === para).at(-1)!;
    const url = m.text.split("\n").find((l) => l.startsWith(`${nota}: `))!.slice(`${nota}: `.length);
    return url.split("/nps/r/")[1]!;
  }

  test("clique na nota grava na hora; clicar de novo em até 7 dias troca a nota, sem duplicar", async () => {
    const j = `J-${tag}@teste.local`;
    const t9 = await linkDe(j, 9);
    const agora = new Date(SEG_10H.getTime() + 8 * DAY);
    const r = await svc.click(t9, agora);
    assert.equal(r.status, "ok");
    assert.equal(r.status === "ok" && r.faixa, "promotor");
    const t4 = await linkDe(j, 4);
    const r2 = await svc.click(t4, new Date(agora.getTime() + 2 * DAY));
    assert.equal(r2.status === "ok" && r2.score, 4);
    const rows = await prisma.npsResponse.findMany({ where: { partnerId: ids.J!, source: "email" } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.score, 4);
    // Depois de 7 dias a nota fica.
    const r3 = await svc.click(t9, new Date(agora.getTime() + 8 * DAY));
    assert.equal(r3.status, "ja_respondida");
    assert.equal((await prisma.npsResponse.findFirstOrThrow({ where: { partnerId: ids.J!, source: "email" } })).score, 4);
    // Mesma tabela do painel: o painel não pergunta de novo.
    assert.equal((await painel.status(ids.JUser!)).ask, false);
  });

  test("link adulterado ou vencido não grava nada", async () => {
    const j = `J-${tag}@teste.local`;
    const t = await linkDe(j, 3);
    const [id, , e, sig] = t.split(".");
    assert.equal((await svc.click(`${id}.10.${e}.${sig}`, SEG_10H)).status, "invalido");
    assert.equal((await svc.click(t, new Date(SEG_10H.getTime() + 60 * DAY))).status, "expirado");
    assert.equal((await svc.click(signNpsToken("naoexiste", 5, new Date(SEG_10H.getTime() + DAY)), SEG_10H)).status, "invalido");
  });

  test("acompanhamento: nota 0–6 com 'Sim' cria tarefa do Comercial em 2 dias úteis (uma só)", async () => {
    // Loja A clica 4 no e-mail.
    const a = `A-${tag}@teste.local`;
    const agora = new Date("2026-11-19T15:00:00Z"); // quinta
    const r = await svc.click(await linkDe(a, 4), agora);
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.faixa, "detrator");
    await svc.followUp({ token: r.followToken, comment: "  Poucos contatos <b>este mês</b>  ", wantsContact: true }, agora);
    const resp = await prisma.npsResponse.findFirstOrThrow({ where: { partnerId: ids.A!, source: "email" } });
    assert.equal(resp.comment, "Poucos contatos <b>este mês</b>", "guardado como texto puro");
    assert.equal(resp.wantsContact, true);
    const tarefas = await prisma.hubTask.findMany({ where: { title: `Ligar para Empresa A ${tag} (NPS 4)` } });
    assert.equal(tarefas.length, 1);
    assert.equal(tarefas[0]!.kind, "ligacao");
    assert.equal(tarefas[0]!.dueAt.toISOString(), "2026-11-23T15:00:00.000Z", "quinta + 2 dias úteis = segunda");
    await svc.followUp({ token: r.followToken, comment: "Mudei de ideia no texto", wantsContact: true }, agora);
    assert.equal(await prisma.hubTask.count({ where: { title: { contains: `Empresa A ${tag}` } } }), 1, "sem tarefa repetida");
    // A ficha da empresa (linha do tempo do Comercial) recebe a nota.
    const card = await prisma.salesProspect.findUnique({ where: { partnerId: ids.A! }, include: { notes: true } });
    assert.ok(card?.notes.some((n) => n.body.includes("NPS por e-mail: nota 4")));
  });

  test("acompanhamento: promotor com 'Sim' não vira tarefa; token inválido é recusado", async () => {
    const j = `J-${tag}@teste.local`;
    const agora = new Date(SEG_10H.getTime() + 9 * DAY);
    const r = await svc.click(await linkDe(j, 10), agora);
    // J já respondeu há mais de 7 dias? Não: primeira resposta foi em +8d, então ainda troca.
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    await svc.followUp({ token: r.followToken, comment: "Atendimento rápido", wantsContact: true }, agora);
    assert.equal(await prisma.hubTask.count({ where: { title: { contains: `Empresa J ${tag}` } } }), 0);
    await assert.rejects(svc.followUp({ token: signNpsToken("naoexiste", "c", new Date(agora.getTime() + DAY)), comment: "x" }, agora), /inválido|expirado/i);
  });

  test("feed do CRM (Hub): última nota com origem e pedido de contato", async () => {
    const { CrmService } = require("./crm.service") as typeof import("./crm.service");
    const { SalesService } = require("../sales/sales.service") as typeof import("../sales/sales.service");
    const crm = new CrmService(prisma, new SalesService(prisma));
    const a = (await crm.clientes()).empresas.find((e) => e.id === ids.A)!;
    assert.equal(a.nps?.nota, 4);
    assert.equal(a.nps?.origem, "email");
    assert.equal(a.nps?.querContato, true);
    assert.equal(a.nps?.comentario, "Mudei de ideia no texto", "o último texto enviado vale");
  });

  test("descadastro em um clique: bloqueia os próximos envios e o lembrete", async () => {
    const a = enviados.find((m) => m.to === `A-${tag}@teste.local`)!;
    const sair = a.headers["List-Unsubscribe"]!.replace(/^<.*\/nps\/sair\//, "").replace(/>$/, "");
    assert.equal(await svc.unsubscribe(sair), true);
    assert.equal(await svc.unsubscribe(sair), true, "idempotente");
    assert.equal(await svc.unsubscribe("x.s.zz.aaaaaaaaaaaaaaaaaaaaaa"), false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.AUser! } });
    assert.ok(user.npsEmailOptOutAt);
    const daquiUmAno = new Date(SEG_10H.getTime() + 371 * DAY);
    const lista = (await svc.candidates(daquiUmAno, scope)).map((c) => c.partnerId);
    assert.ok(!lista.includes(ids.A!));
  });

  test("e-mail de teste do dono: modelo real, não conta no NPS", async () => {
    const antes = await prisma.npsResponse.count();
    const r = await svc.sendTest(ids.CUser!, SEG_10H);
    assert.equal(r.para, `C-${tag}@teste.local`);
    const m = enviados.at(-1)!;
    assert.equal(m.to, `C-${tag}@teste.local`);
    assert.match(m.subject, /1 minuto para nos ajudar\?$/);
    const t = m.text.split("\n").find((l) => l.startsWith("2: "))!.split("/nps/r/")[1]!;
    const c = await svc.click(t, SEG_10H);
    assert.equal(c.status === "ok" && c.teste, true);
    if (c.status === "ok") await svc.followUp({ token: c.followToken, comment: "teste", wantsContact: true }, SEG_10H);
    assert.equal(await prisma.npsResponse.count(), antes, "nenhuma resposta nova no NPS");
    assert.equal(await prisma.hubTask.count({ where: { title: { contains: "(NPS 2)" }, createdAt: { gte: new Date(Date.now() - 60_000) } } }), 0);
    const pesquisa = await prisma.npsEmailSurvey.findFirstOrThrow({ where: { test: true, userId: ids.CUser! } });
    assert.equal(pesquisa.testScore, 2, "a nota de teste fica só na pesquisa de teste");
    assert.equal(pesquisa.partnerId, null);
    const conf = await svc.config(SEG_10H);
    assert.ok(conf.testes.some((t) => t.enviadoEm === SEG_10H.toISOString() && t.nota === 2) || conf.testes.length === 5);
  });

  test("painel do Hub: NPS por tipo e comentários com o rótulo de origem", async () => {
    const d = await svc.dashboard({ periodo: "tudo", tipo: "todos" }, new Date(SEG_10H.getTime() + 10 * DAY));
    const meu = d.comentarios.find((c) => c.empresaId === ids.A);
    assert.equal(meu?.origem, "email");
    assert.equal(meu?.querContato, true);
    assert.ok(d.porTipo.some((t) => t.tipo === "imobiliaria"));
    assert.ok(d.email.enviados >= 2);
    const soLojas = await svc.dashboard({ periodo: "tudo", tipo: "loja" }, new Date(SEG_10H.getTime() + 10 * DAY));
    assert.ok(soLojas.comentarios.every((c) => c.tipo === "Loja de veículos" || c.tipo === "Loja"), JSON.stringify(soLojas.comentarios.map((c) => c.tipo)));
  });
});

describe("NPS por e-mail: rotas", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NpsHubController } = require("../hub/nps-hub.controller") as typeof import("../hub/nps-hub.controller");
  const { NpsEmailPublicController } = require("./nps-email.controller") as typeof import("./nps-email.controller");
  const { HubGuard } = require("../hub/hub.guard") as typeof import("../hub/hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const perfis = {
    dono: { userId: "dono", profile: "dono", permissions: ["crm.ver", "crm.editar", "financeiro", "marketing", "equipe"] },
    comercial: { userId: "comercial", profile: "comercial", permissions: ["crm.ver", "crm.editar"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string, handler: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => handler, getClass: () => NpsHubController }) as never;

  test("aprovar, pausar e e-mail de teste: só o dono (equipe); painel: quem vê o CRM", async () => {
    const P = NpsHubController.prototype;
    for (const h of [P.aprovar, P.pausa, P.teste]) {
      assert.equal(Reflect.getMetadata("hub:permission", h), "equipe");
      assert.equal(await guard.canActivate(ctx("dono", h)), true);
      await assert.rejects(guard.canActivate(ctx("comercial", h)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
    }
    for (const h of [P.painel, P.config]) assert.equal(Reflect.getMetadata("hub:permission", h), "crm.ver");
  });

  test("rotas públicas validam o corpo (zod) antes do serviço", async () => {
    const chamadas: string[] = [];
    const fake = { click: async () => chamadas.push("click"), followUp: async () => chamadas.push("follow"), unsubscribe: async () => (chamadas.push("sair"), true) };
    const c = new NpsEmailPublicController(fake as never);
    await assert.rejects(async () => c.clique({ token: "<script>alert(1)</script>" }), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
    await assert.rejects(async () => c.acompanhamento({ token: "a.c.b.cccccccccccccccccccccc", comment: "x".repeat(1001) }), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
    await assert.rejects(async () => c.sair("'; drop table users;--"), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
    assert.deepEqual(chamadas, []);
  });
});
