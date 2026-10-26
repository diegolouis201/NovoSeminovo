import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { GeminiImageService } from "../architect/gemini-image.service";
import { TaskQueueService } from "../operations/task-queue.service";
import { decide } from "../operations/policy";
import { MarketingArtService, wrapText } from "./art.service";
import { ContactsService, normalizeEmail, normalizePhone } from "./contacts.service";
import { EmailMarketingService, clickUrl } from "./email-marketing.service";
import { personalize, renderMarketingEmail } from "./email-render";
import { marketingTarget, signLink, verifyLink } from "./links";
import { verifySvix } from "./marketing.controller";
import { MarketingPostsService, fullCaption, normalizeHashtags } from "./posts.service";

// Testes do marketing. Os de regra rodam sempre; os de fluxo usam o
// PostgreSQL local (DATABASE_URL) e servidores falsos da Meta e do Resend.
// Rodar: pnpm --filter @novoseminovo/api test

// links.ts não aceita mais um segredo hardcoded de fallback (ver
// require-strong-secret.ts) — os testes de assinatura de link (ambas as
// suítes abaixo) precisam de um, já que nada mais neste processo de teste
// carrega .env.
process.env.MARKETING_LINK_SECRET ??= "chave-de-teste-para-assinatura-de-links-em-marketing-spec";

describe("Marketing: regras", () => {
  test("e-mail e telefone normalizados para não duplicar contato", () => {
    assert.equal(normalizeEmail("  Maria@Exemplo.COM "), "maria@exemplo.com");
    assert.equal(normalizeEmail("sem-arroba"), undefined);
    assert.equal(normalizePhone("+55 (11) 98888-7777"), "11988887777");
    assert.equal(normalizePhone("123"), undefined);
  });

  test("hashtags: com #, sem repetição, no fim da legenda", () => {
    assert.deepEqual(normalizeHashtags(["carros", "#carros", "##SUV", " imóveis "]), ["#carros", "#SUV", "#imóveis"]);
    assert.equal(fullCaption({ caption: "Olá", hashtags: ["#a", "#b"] }), "Olá\n\n#a #b");
  });

  test("link do e-mail: só para o site, com utm de e-mail; assinatura não aceita outro destino", () => {
    assert.equal(marketingTarget("/carros", "boas-vindas"), "https://novoseminovo.com.br/carros?utm_source=email&utm_medium=email&utm_campaign=boas-vindas");
    assert.equal(marketingTarget("https://golpe.com", "x"), undefined);
    const signature = signLink("send1|https://novoseminovo.com.br/carros");
    assert.ok(verifyLink("send1|https://novoseminovo.com.br/carros", signature));
    assert.ok(!verifyLink("send1|https://golpe.com", signature));
    assert.match(clickUrl("send1", "https://novoseminovo.com.br/carros"), /\/m\/c\/send1\/.+\?u=https%3A%2F%2Fnovoseminovo/);
  });

  test("e-mail: texto escapado, {{nome}} personalizado, rodapé com motivo e descadastro", () => {
    assert.equal(personalize("Olá, {{nome}}!", "Maria Souza"), "Olá, Maria!");
    assert.equal(personalize("Olá, {{nome}}!", null), "Olá!");
    const { html, text } = renderMarketingEmail({
      subject: "Oi",
      body: "Linha <b>1</b>\n\nLinha 2",
      unsubscribeUrl: "https://api.x/m/u/tok",
      consent: "legitimate_interest",
    });
    assert.ok(html.includes("&lt;b&gt;1&lt;/b&gt;"));
    assert.ok(html.includes("https://api.x/m/u/tok"));
    assert.ok(text.includes("é cliente ou pediu contato"));
  });

  test("webhook do Resend: assinatura svix confere, adulterada ou velha não", () => {
    const secret = `whsec_${Buffer.from("segredo-de-teste").toString("base64")}`;
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.delivered"}';
    const sig = createHmac("sha256", Buffer.from("segredo-de-teste")).update(`msg1.${ts}.${body}`).digest("base64");
    assert.ok(verifySvix(secret, "msg1", ts, `v1,${sig}`, body, now));
    assert.ok(!verifySvix(secret, "msg1", ts, `v1,${sig}`, body.replace("delivered", "bounced"), now));
    assert.ok(!verifySvix(secret, "msg1", ts, `v1,${sig}`, body, now + 10 * 60 * 1000));
  });

  test("ferramentas de marketing só para o agente de marketing", () => {
    const tool = { name: "criar_post_instagram", color: "green" as const };
    assert.equal(decide("marketing", tool, tool.name).kind, "run");
    assert.equal(decide("operacoes", tool, tool.name).kind, "blocked");
    assert.equal(decide("diretor", { name: "ler_resultados_marketing", color: "green" }, "ler_resultados_marketing").kind, "run");
  });

  test("título da arte quebra em no máximo 3 linhas", () => {
    const lines = wrapText("Uma frase bem comprida que não cabe numa linha só de jeito nenhum mesmo tentando muito", 78, 952, 3);
    assert.ok(lines.length <= 3);
    assert.ok(lines[2].endsWith("…"));
  });
});

const withDb = Boolean(process.env.DATABASE_URL);
const DOMAIN = "@teste-mkt.local";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

describe("Marketing: fluxo completo (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notifications = { notify: async () => undefined } as unknown as NotificationsService;
  const gemini = { isEnabled: () => false } as unknown as GeminiImageService;
  const queue = new TaskQueueService(prisma);
  const contacts = new ContactsService(prisma);
  const art = new MarketingArtService(prisma, gemini);
  const posts = new MarketingPostsService(prisma, art, notifications, queue);
  const emails = new EmailMarketingService(prisma, new EmailService(), contacts, notifications, queue);
  const graphCalls: string[] = [];
  const resendBodies: Record<string, unknown>[] = [];
  let server: Server;
  let adminId: string;

  const cleanup = async () => {
    await prisma.marketingContact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.marketingPost.deleteMany({ where: { title: { startsWith: "[teste]" } } });
    await prisma.emailCampaign.deleteMany({ where: { name: { startsWith: "[teste]" } } });
    await prisma.emailSequence.deleteMany({ where: { key: { startsWith: "teste_" } } });
    await prisma.agentTask.deleteMany({ where: { objective: { contains: "[teste]" } } });
  };

  before(async () => {
    server = createServer(async (req, res) => {
      const url = req.url ?? "";
      const body = await readBody(req);
      res.setHeader("Content-Type", "application/json");
      if (url.startsWith("/emails")) {
        resendBodies.push(JSON.parse(body));
        return res.end(JSON.stringify({ id: `re_${resendBodies.length}` }));
      }
      graphCalls.push(`${req.method} ${url.split("?")[0]}`);
      if (url.startsWith("/v23.0/ig1/media_publish")) return res.end(JSON.stringify({ id: "midia1" }));
      if (url.startsWith("/v23.0/ig1/media")) return res.end(JSON.stringify({ id: "cont1" }));
      if (url.startsWith("/v23.0/cont1")) return res.end(JSON.stringify({ status_code: "FINISHED" }));
      if (url.startsWith("/v23.0/midia1/insights")) {
        return res.end(JSON.stringify({ data: [{ name: "reach", values: [{ value: 120 }] }, { name: "likes", values: [{ value: 9 }] }] }));
      }
      if (url.startsWith("/v23.0/midia1")) return res.end(JSON.stringify({ permalink: "https://instagram.com/p/x" }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: "não achei" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.assign(process.env, {
      INSTAGRAM_ACCESS_TOKEN: "token-teste",
      INSTAGRAM_ACCOUNT_ID: "ig1",
      INSTAGRAM_GRAPH_HOST: base,
      RESEND_API_KEY: "re_teste",
      RESEND_API_URL: base,
      EMAIL_SEND_GAP_MS: "0",
      EMAIL_DAILY_LIMIT: "1000",
      PUBLIC_API_URL: "https://api.teste",
    });
    await cleanup();
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    adminId = admin?.id ?? "admin-teste";
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
    server.close();
  });

  test("contato: sem duplicar, permissão só sobe, descadastrado não volta sem pedir", async () => {
    const first = await contacts.upsert({ email: `Ana${DOMAIN}`, source: "instagram", consent: "none" });
    const again = await contacts.upsert({ email: `ana${DOMAIN}`, phone: "11977776666", source: "google", consent: "legitimate_interest", interest: "comprar_carro" });
    assert.equal(again?.contact.id, first?.contact.id);
    assert.equal(again?.created, false);
    assert.equal(again?.contact.consent, "legitimate_interest");
    assert.equal(again?.contact.source, "instagram");
    assert.equal(again?.contact.interest, "comprar_carro");
    const down = await contacts.upsert({ email: `ana${DOMAIN}`, source: "x", consent: "none" });
    assert.equal(down?.contact.consent, "legitimate_interest");
    await contacts.unsubscribe(first!.contact.unsubscribeToken);
    const back = await contacts.upsert({ email: `ana${DOMAIN}`, source: "x", consent: "legitimate_interest" });
    assert.equal(back?.contact.status, "unsubscribed");
    const optIn = await contacts.upsert({ email: `ana${DOMAIN}`, source: "x", consent: "opt_in" });
    assert.equal(optIn?.contact.status, "active");
  });

  test("post: rascunho com arte → aprovar → publica na Meta → métricas", async () => {
    const { post } = await posts.create(
      { title: "[teste] post", caption: "Venda seu carro no NovoSeminovo", hashtags: ["carros", "#seminovos"], artSource: "brand", artHeadline: "Venda sem complicação" },
      "admin",
    );
    assert.equal(post.status, "awaiting_approval");
    assert.ok(post.imageUrl);
    // Outros posts aprovados no banco local podem ser publicados junto: confere só este.
    await posts.publishDue();
    assert.equal((await posts.find(post.id)).status, "awaiting_approval", "não publica sem aprovação");
    await posts.decide(post.id, adminId, { action: "approve" });
    await posts.publishDue();
    const published = await posts.find(post.id);
    assert.equal(published.status, "published");
    assert.equal(published.igMediaId, "midia1");
    assert.equal(published.igPermalink, "https://instagram.com/p/x");
    assert.deepEqual(graphCalls.slice(0, 3), ["POST /v23.0/ig1/media", "GET /v23.0/cont1", "POST /v23.0/ig1/media_publish"]);
    await posts.refreshMetrics(new Date(), true);
    assert.deepEqual((await posts.find(post.id)).metrics, { reach: 120, likes: 9 });
  });

  test("post: conteúdo mudado depois da aprovação não é publicado; pedir alteração cria tarefa para o agente", async () => {
    const { post } = await posts.create({ title: "[teste] post 2", caption: "Legenda original aqui", hashtags: [], artSource: "brand", artHeadline: "Título" }, "admin");
    await posts.decide(post.id, adminId, { action: "approve" });
    await prisma.marketingPost.update({ where: { id: post.id }, data: { caption: "Legenda trocada por fora" } });
    await posts.publishDue();
    const after = await posts.find(post.id);
    assert.equal(after.status, "awaiting_approval");
    assert.match(after.error ?? "", /aprove de novo/);
    await posts.decide(post.id, adminId, { action: "changes", note: "[teste] use foto de SUV" });
    const task = await prisma.agentTask.findFirst({ where: { dedupeKey: `post-revisao:${post.id}:${after.revision}` } });
    assert.equal(task?.agent, "marketing");
    const revised = await posts.update(post.id, { title: "[teste] post 2", caption: "Nova legenda do post", hashtags: [], artSource: "brand", artHeadline: "Novo" }, "agent");
    assert.equal(revised.post.status, "awaiting_approval");
    assert.equal(revised.post.revision, 2);
    // Sem novo pedido de alteração, o agente não mexe mais.
    await assert.rejects(posts.update(post.id, { title: "[teste] post 2", caption: "Outra vez aqui", hashtags: [], artSource: "brand", artHeadline: "x" }, "agent"));
  });

  test("campanha: só com aprovação, só para quem tem permissão, com descadastro e clique", async () => {
    await contacts.upsert({ email: `bia${DOMAIN}`, name: "Bia Lima", source: "instagram", consent: "opt_in", interest: "comprar_imovel" });
    await contacts.upsert({ email: `caio${DOMAIN}`, source: "instagram", consent: "none", interest: "comprar_imovel" });
    const campaign = await emails.createCampaign(
      { name: "[teste] imóveis", subject: "Olá, {{nome}}", body: "Novos imóveis no site para você conhecer.", ctaLabel: "Ver imóveis", ctaUrl: "/imoveis", interests: ["comprar_imovel"] },
      "admin",
    );
    assert.equal(await emails.audienceSize({ interests: ["comprar_imovel"] }), 1);
    await emails.prepareDueCampaigns();
    assert.equal(await prisma.emailSend.count({ where: { campaignId: campaign.id } }), 0, "nada sem aprovação");
    await emails.decideCampaign(campaign.id, adminId, { action: "approve" });
    await emails.prepareDueCampaigns();
    const before = resendBodies.length;
    assert.equal(await emails.sendQueued(), 1);
    const sent = resendBodies[before] as { to: string; subject: string; html: string; headers: Record<string, string> };
    assert.equal(sent.to, `bia${DOMAIN}`);
    assert.equal(sent.subject, "Olá, Bia");
    assert.ok(sent.headers["List-Unsubscribe-Post"]);
    assert.ok(sent.html.includes("https://api.teste/m/c/"));
    await emails.prepareDueCampaigns();
    assert.equal((await prisma.emailCampaign.findUnique({ where: { id: campaign.id } }))?.status, "sent");

    const send = await prisma.emailSend.findFirstOrThrow({ where: { campaignId: campaign.id } });
    await emails.recordClick(send.id, "https://novoseminovo.com.br/imoveis");
    await emails.handleProviderEvent({ type: "email.delivered", data: { email_id: send.providerId! } });
    const views = await emails.campaignViews();
    const view = views.find((item) => item.id === campaign.id);
    assert.equal(view?.stats.delivered, 1);
    assert.equal(view?.stats.clicked, 1);
  });

  test("sequência: aprovada, inscreve contato novo, respeita condição e para quando o e-mail volta", async () => {
    const sequence = await emails.proposeSequence({
      key: "teste_compra",
      name: "[teste] Jornada compra",
      interests: ["vender"],
      steps: [
        { delayDays: 0, subject: "Bem-vindo", body: "Primeiro e-mail da jornada de teste." },
        { delayDays: 0, subject: "Crie sua conta", body: "Só para quem ainda não tem conta.", condition: "com_conta" },
        { delayDays: 0, subject: "Terceiro", body: "Terceiro e-mail da jornada de teste." },
      ],
    });
    await emails.decideSequence(sequence.id, adminId, { action: "approve" });
    const { contact } = (await contacts.upsert({ email: `davi${DOMAIN}`, source: "google", consent: "opt_in", interest: "vender" }))!;
    assert.equal(await emails.enrollNew(), 1);
    await emails.advanceSequences();
    await emails.advanceSequences();
    const queued = await prisma.emailSend.findMany({ where: { contactId: contact.id }, orderBy: { stepIndex: "asc" } });
    assert.deepEqual(queued.map((item) => item.stepIndex), [0], "passo 2 é só para quem tem conta");
    await emails.sendQueued();
    const sent = await prisma.emailSend.findFirstOrThrow({ where: { contactId: contact.id } });
    await emails.handleProviderEvent({ type: "email.bounced", data: { email_id: sent.providerId! } });
    const enrollment = await prisma.sequenceEnrollment.findFirstOrThrow({ where: { contactId: contact.id } });
    assert.equal(enrollment.status, "stopped");
    assert.equal((await prisma.marketingContact.findUniqueOrThrow({ where: { id: contact.id } })).status, "bounced");
  });
});
