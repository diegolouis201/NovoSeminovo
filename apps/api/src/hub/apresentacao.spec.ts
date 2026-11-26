import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  APRESENTACAO_TARGET,
  CampaignVisitInputSchema,
  classifyAcquisition,
  cleanCampaignUtm,
  parseAcquisition,
  serializeAcquisition,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { CrmService } from "../crm/crm.service";
import { AuthService } from "../auth/auth.service";
import { ContactsService } from "../marketing/contacts.service";
import { ApresentacaoVisitasService, diaBrasilia, visitaRepetida } from "./apresentacao.service";
import { contagemLimitada } from "./apresentacao.controller";

// PDF de apresentação para empresas (link nos e-mails do Caio e da Nina):
// /apresentacao-empresas?utm_... conta a visita (só contagem por dia, sem dado
// pessoal) e manda para o PDF. UTM só com [a-z0-9_-]; o resto é descartado.

const params = (q: string) => {
  const s = new URLSearchParams(q);
  return (name: string) => s.get(name);
};

describe("cleanCampaignUtm: só [a-z0-9_-], até 60 caracteres", () => {
  test("link do Caio passa inteiro", () => {
    assert.deepEqual(cleanCampaignUtm(params("utm_source=prospeccao&utm_medium=email&utm_campaign=caio_veiculos&utm_content=apresentacao")), {
      source: "prospeccao",
      medium: "email",
      campaign: "caio_veiculos",
      content: "apresentacao",
    });
  });

  test("maiúsculas viram minúsculas; espaço, aspas, <script>, ../ e texto longo são descartados", () => {
    const utm = cleanCampaignUtm(
      params(`utm_source=Prospeccao&utm_medium=e%20mail&utm_campaign=${encodeURIComponent("<script>alert(1)</script>")}&utm_content=${"a".repeat(61)}&utm_term=..%2F..%2Fetc`),
    );
    assert.deepEqual(utm, { source: "prospeccao" });
  });

  test("SQL e javascript: descartados; vazio = nada", () => {
    assert.deepEqual(cleanCampaignUtm(params("utm_source=x'%20OR%201=1--&utm_campaign=javascript:alert(1)")), {});
    assert.deepEqual(cleanCampaignUtm(params("")), {});
  });
});

describe("CampaignVisitInputSchema (o que o site manda para a API)", () => {
  test("aceita o alvo fixo e UTM limpo", () => {
    assert.equal(CampaignVisitInputSchema.safeParse({ target: APRESENTACAO_TARGET, source: "prospeccao", campaign: "nina_imoveis" }).success, true);
  });
  test("recusa alvo fora da lista, campo extra e valor sujo", () => {
    assert.equal(CampaignVisitInputSchema.safeParse({ target: "../etc/passwd" }).success, false);
    assert.equal(CampaignVisitInputSchema.safeParse({ target: APRESENTACAO_TARGET, ip: "1.2.3.4" }).success, false);
    assert.equal(CampaignVisitInputSchema.safeParse({ target: APRESENTACAO_TARGET, campaign: "a b" }).success, false);
    assert.equal(CampaignVisitInputSchema.safeParse({ target: APRESENTACAO_TARGET, content: "x".repeat(61) }).success, false);
  });
});

describe("regras da contagem", () => {
  test("dia no horário de Brasília", () => {
    assert.equal(diaBrasilia(new Date("2026-11-27T02:30:00Z")), "2026-11-26");
    assert.equal(diaBrasilia(new Date("2026-11-27T03:30:00Z")), "2026-11-27");
  });
  test("mesmo visitante e mesma campanha em 30 minutos conta uma vez só", () => {
    const t = 1_000_000_000;
    assert.equal(visitaRepetida("ip-a|caio", t), false);
    assert.equal(visitaRepetida("ip-a|caio", t + 60_000), true);
    assert.equal(visitaRepetida("ip-a|nina", t + 60_000), false);
    assert.equal(visitaRepetida("ip-a|caio", t + 31 * 60_000), false);
  });
  test("contagem pública: no máximo 20 por visitante a cada 10 minutos", () => {
    const t = 2_000_000_000;
    for (let i = 0; i < 20; i++) assert.equal(contagemLimitada("ip-flood", t + i), false);
    assert.equal(contagemLimitada("ip-flood", t + 30), true);
    assert.equal(contagemLimitada("ip-outro", t + 30), false);
    assert.equal(contagemLimitada("ip-flood", t + 11 * 60_000), false);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("contagem no banco e resumo do Hub", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new ApresentacaoVisitasService(prisma);
  const tag = `apr${Date.now().toString(36)}`;
  after(async () => {
    await prisma.campaignVisitDay.deleteMany({ where: { campaign: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  test("soma por dia e por campanha; resumo traz 30 dias", async () => {
    const caio = `${tag}_caio`;
    await service.registrar({ target: APRESENTACAO_TARGET, source: "prospeccao", medium: "email", campaign: caio, content: "apresentacao" });
    await service.registrar({ target: APRESENTACAO_TARGET, source: "prospeccao", medium: "email", campaign: caio, content: "apresentacao" });
    await service.registrar({ target: APRESENTACAO_TARGET, source: "prospeccao", campaign: `${tag}_nina`, content: "apresentacao" });
    const rows = await prisma.campaignVisitDay.findMany({ where: { campaign: { startsWith: tag } } });
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.campaign === caio)?.count, 2);
    const resumo = await service.resumo();
    const linha = resumo.linhas.find((l) => l.campanha === caio);
    assert.equal(linha?.aberturas30d, 2);
    assert.equal(linha?.aberturas7d, 2);
    assert.equal(linha?.conteudo, "apresentacao");
    assert.ok(resumo.total30d >= 3);
    assert.equal(resumo.link, "/apresentacao-empresas.pdf");
  });
});

// Pergunta do marketing: o QR da última página do PDF leva a
// /para-lojas/comecar?utm_source=prospeccao&utm_medium=email&utm_content=apresentacao_parceiros.
// O utm_content chega ao card da empresa no CRM do Hub (Empresas > ficha > "Origem")?
describe("QR do PDF: utm_content chega ao CRM do Hub", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sales = new SalesService(prisma);
  const crm = new CrmService(prisma, sales);
  const tag = Date.now().toString().slice(-7);
  // Mesmo caminho do site: AttributionCapture → cookie ns_origem → cabeçalho x-ns-origem → API.
  const doQr = parseAcquisition(
    encodeURIComponent(serializeAcquisition(classifyAcquisition({ utmSource: "prospeccao", utmMedium: "email", utmContent: "apresentacao_parceiros" }))),
  );
  after(async () => {
    await prisma.$disconnect();
  });

  test("formulário de /para-lojas/comecar: card do funil com canal prospecção e conteúdo apresentacao_parceiros", async () => {
    const { id } = await sales.campaignLead(
      { name: "Ana QR", company: `Loja QR ${tag}`, businessType: "loja", city: "Goiânia", state: "GO", phone: `6298${tag}`, email: `qr-${tag}@teste.local`, consent: true },
      doQr,
    );
    const card = await prisma.salesProspect.findUniqueOrThrow({ where: { id } });
    assert.equal(card.acqSource, "prospeccao");
    assert.equal(card.acqMedium, "email");
    assert.equal(card.acqContent, "apresentacao_parceiros");
    const item = (await crm.clientes()).prospeccao.find((p) => p.cardId === id);
    assert.deepEqual(item?.origemMarketing, { canal: "prospeccao", meio: "email", anuncio: "apresentacao_parceiros" });
  });

  test("cadastro de empresa (conta PJ) com o mesmo cookie: origem do dono no CRM", async () => {
    const auth = new AuthService(prisma, { sign: () => "t" } as never, new ContactsService(prisma));
    const user = await auth.register({ name: "Dono QR", email: `dono-qr-${tag}@teste.local`, password: "senha-segura-123", cpf: `0${tag}123`.slice(0, 11) } as never, doQr);
    const dono = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(dono.acqContent, "apresentacao_parceiros");
    const partner = await prisma.partner.create({ data: { ownerUserId: user.id, type: "dealership", legalName: `QR ${tag}`, document: `9${tag}000199`.slice(0, 14), slug: `qr-${tag}` } });
    const empresa = (await crm.clientes()).empresas.find((e) => e.id === partner.id);
    assert.equal(empresa?.origemMarketing?.canal, "prospeccao");
    assert.equal(empresa?.origemMarketing?.anuncio, "apresentacao_parceiros");
  });
});
