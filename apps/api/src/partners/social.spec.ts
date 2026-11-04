import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PartnerSocialInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { savePartnerSocial } from "./social";
import { CrmService } from "../crm/crm.service";
import { SalesService } from "../sales/sales.service";

// Post de boas-vindas nas redes: a empresa informa o Instagram/Facebook dela e
// autoriza (caixinha) o NovoSeminovo a divulgar a empresa e a logomarca. O CRM
// só pede o post ao Marketing para quem autorizou.

describe("Redes sociais da empresa: o que entra", () => {
  const parse = (input: unknown) => PartnerSocialInputSchema.safeParse(input);

  test("Instagram: aceita @, nome ou link e guarda só o nome, em minúsculas", () => {
    assert.equal(parse({ instagram: "@Loja.Savassi", consent: false }).data?.instagram, "loja.savassi");
    assert.equal(parse({ instagram: "https://www.instagram.com/loja_bh/", consent: false }).data?.instagram, "loja_bh");
    assert.equal(parse({ instagram: "instagram.com/loja_bh?igsh=abc", consent: false }).data?.instagram, "loja_bh");
  });

  test("Facebook: aceita nome da página ou link do facebook.com", () => {
    assert.equal(parse({ facebook: "https://www.facebook.com/LojaSavassi", consent: false }).data?.facebook, "LojaSavassi");
    assert.equal(parse({ facebook: "m.facebook.com/profile.php?id=10001234", consent: false }).data?.facebook, "profile.php?id=10001234");
    assert.equal(parse({ facebook: "loja.savassi", consent: false }).data?.facebook, "loja.savassi");
  });

  test("campo vazio apaga; texto que não é perfil é recusado", () => {
    assert.equal(parse({ instagram: "", facebook: "  ", consent: false }).data?.instagram, null);
    assert.equal(parse({ instagram: "", facebook: "  ", consent: false }).data?.facebook, null);
    for (const ruim of ["javascript:alert(1)", "<script>", "https://evil.com/loja", "a".repeat(31), "loja savassi"]) {
      assert.equal(parse({ instagram: ruim, consent: false }).success, false, `instagram ${ruim}`);
    }
    for (const ruim of ["https://evil.com/x", "javascript:alert(1)", "<b>x</b>"]) {
      assert.equal(parse({ facebook: ruim, consent: false }).success, false, `facebook ${ruim}`);
    }
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Redes sociais e autorização (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const crm = new CrmService(prisma, new SalesService(prisma));
  const tag = `soc-${Date.now()}`;
  const ids = { owner: "", partner: "" };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dona Social", email: `ds-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.partner = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja Social ${tag}`, document: "11444777000161", slug: tag, logoUrl: "/uploads/logo-teste.webp" },
      })
    ).id;
    await prisma.partnerMember.create({ data: { partnerId: ids.partner, userId: ids.owner, role: "owner" } });
  });

  after(async () => {
    await prisma.salesProspect.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partnerMember.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  test("dono salva as redes e autoriza; o painel mostra; tirar a autorização apaga a data", async () => {
    let mine = await savePartnerSocial(prisma, ids.owner, { instagram: "loja.social", facebook: "LojaSocial", consent: true });
    assert.equal(mine.instagram, "loja.social");
    assert.equal(mine.facebook, "LojaSocial");
    assert.ok(mine.consentAt);
    mine = await savePartnerSocial(prisma, ids.owner, { instagram: "loja.social", facebook: null, consent: false });
    assert.equal(mine.facebook, undefined);
    assert.equal(mine.consentAt, undefined);
  });

  test("quem não tem empresa não consegue salvar", async () => {
    const stranger = await prisma.user.create({ data: { name: "Sem loja", email: `sl-${tag}@teste.local` } });
    await assert.rejects(savePartnerSocial(prisma, stranger.id, { instagram: "x", facebook: null, consent: true }), /não tem/);
    await prisma.user.delete({ where: { id: stranger.id } });
  });

  test("o feed do CRM traz logo, redes e a autorização", async () => {
    await savePartnerSocial(prisma, ids.owner, { instagram: "loja.social", facebook: "LojaSocial", consent: true });
    const empresa = (await crm.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.logo, "/uploads/logo-teste.webp");
    assert.deepEqual(empresa.redesSociais, { instagram: "loja.social", facebook: "LojaSocial" });
    assert.ok(empresa.autorizaDivulgacaoEm);
  });
});
