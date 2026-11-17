import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CONSENTIMENTO_CREDITO } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { CONSENT_TIMEZONE, localIsoWithOffset, recordCreditConsent } from "./credit-consent";

// Trilha de auditoria do consentimento do crédito (parecer jurídico LGPD de
// 17/11/2026, item 2.1.4 ii): quem/qual pedido, data e hora com fuso,
// modalidade, texto integral da versão aceita, manifestação positiva, IP e
// navegador.

describe("data e hora com fuso", () => {
  test("horário de Brasília com o deslocamento explícito", () => {
    assert.equal(CONSENT_TIMEZONE, "America/Sao_Paulo");
    assert.equal(localIsoWithOffset(new Date("2026-11-17T18:05:09.123Z")), "2026-11-17T15:05:09.123-03:00");
    // Virada de dia em UTC continua no dia anterior em Brasília.
    assert.equal(localIsoWithOffset(new Date("2026-11-18T01:00:00.000Z")), "2026-11-17T22:00:00.000-03:00");
  });

  test("funciona com outro fuso (inclusive com horário de verão)", () => {
    assert.equal(localIsoWithOffset(new Date("2026-07-01T12:00:00.000Z"), "Europe/Lisbon"), "2026-07-01T13:00:00.000+01:00");
    assert.equal(localIsoWithOffset(new Date("2026-01-01T12:00:00.000Z"), "UTC"), "2026-01-01T12:00:00.000+00:00");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("registro do aceite (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const ids: string[] = [];

  after(async () => {
    await prisma.financingLead.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const makeLead = async (assetType: "vehicle" | "property") => {
    const lead = await prisma.financingLead.create({ data: { channel: "web", name: "Teste Aceite", phone: "31900001111", assetType } });
    ids.push(lead.id);
    return lead.id;
  };

  test("guarda pedido, modalidade, versão, texto integral, aceite, data UTC + fuso, IP e navegador", async () => {
    const leadId = await makeLead("property");
    const now = new Date("2026-11-17T18:05:09.123Z");
    const record = await recordCreditConsent(prisma, {
      financingLeadId: leadId,
      modality: "imovel",
      version: CONSENTIMENTO_CREDITO.imovel.versao,
      origin: "site",
      ip: "200.100.50.25",
      userAgent: "Mozilla/5.0 (Teste) Navegador/1.0",
      now,
    });
    const saved = await prisma.creditConsent.findUniqueOrThrow({ where: { id: record.id } });
    assert.equal(saved.financingLeadId, leadId);
    assert.equal(saved.modality, "imovel");
    assert.equal(saved.product, "credihome");
    assert.equal(saved.origin, "site");
    assert.equal(saved.consentVersion, "2026-11-17-parecer-imovel");
    assert.equal(saved.consentText, CONSENTIMENTO_CREDITO.imovel.texto);
    assert.equal(saved.accepted, true);
    assert.equal(saved.acceptedAt.toISOString(), "2026-11-17T18:05:09.123Z");
    assert.equal(saved.timezone, "America/Sao_Paulo");
    assert.equal(saved.acceptedAtLocal, "2026-11-17T15:05:09.123-03:00");
    assert.equal(saved.ip, "200.100.50.25");
    assert.equal(saved.userAgent, "Mozilla/5.0 (Teste) Navegador/1.0");
    assert.equal(saved.bacenTermVersion, null);
  });

  test("versão que não é da modalidade, ou que não existe, não é registrada", async () => {
    const leadId = await makeLead("vehicle");
    const base = { financingLeadId: leadId, origin: "site" as const, ip: "1.1.1.1", userAgent: "x" };
    await assert.rejects(recordCreditConsent(prisma, { ...base, modality: "veiculo", version: CONSENTIMENTO_CREDITO.imovel.versao }), /versão/i);
    await assert.rejects(recordCreditConsent(prisma, { ...base, modality: "veiculo", version: "inventada" }), /versão/i);
    assert.equal(await prisma.creditConsent.count({ where: { financingLeadId: leadId } }), 0);
  });

  test("navegador gigante e caracteres de controle são cortados", async () => {
    const leadId = await makeLead("vehicle");
    const record = await recordCreditConsent(prisma, {
      financingLeadId: leadId,
      modality: "veiculo",
      version: CONSENTIMENTO_CREDITO.veiculo.versao,
      origin: "site",
      ip: "10.0.0.1\n<script>",
      userAgent: "A".repeat(3000),
      bacenTermVersion: "2026-11-13",
    });
    const saved = await prisma.creditConsent.findUniqueOrThrow({ where: { id: record.id } });
    assert.equal(saved.userAgent?.length, 500);
    assert.ok(!saved.ip?.includes("\n"));
    assert.equal(saved.bacenTermVersion, "2026-11-13");
    assert.equal(saved.product, "creditas");
  });
});
