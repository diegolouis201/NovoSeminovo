import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { safeSharp } from "../common/image-safety";
import { BoasVindasService } from "../hub/boas-vindas.service";
import { importarLogoDoFeed, jsonLogoUrl, logoUrlDoFeed, vrsyncLogoUrl } from "./feed-logo";
import { IntegrationsService } from "./integrations.service";

// Logo da empresa vinda da integração com o CRM (pedido do Diego, 20/11/2026):
// só preenche quando a empresa ainda não tem logo, nunca troca a que o dono
// enviou, baixa com as travas de sempre e passa pela checagem de imagem.

const VRSYNC_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync">
  <Header><Provider>CRM X</Provider><Email>a@b.com</Email><Logo>https://crm.exemplo.com/logo-header.png</Logo></Header>
  <Listings><Listing><ListingID>1</ListingID><ContactInfo><Name>Imob</Name><Logo>https://crm.exemplo.com/logo-contato.png</Logo></ContactInfo></Listing></Listings>
</ListingDataFeed>`;
const VRSYNC_CONTATO = `<ListingDataFeed><Header><Provider>CRM X</Provider></Header>
  <Listings><Listing><ListingID>1</ListingID><ContactInfo><Name>Imob</Name><Logo>https://crm.exemplo.com/logo-contato.png</Logo></ContactInfo></Listing></Listings>
</ListingDataFeed>`;

describe("Logo no feed: de onde vem em cada formato", () => {
  test("VRSync: Header/Logo; sem ele, ContactInfo/Logo do anúncio", () => {
    assert.equal(vrsyncLogoUrl(VRSYNC_HEADER), "https://crm.exemplo.com/logo-header.png");
    assert.equal(vrsyncLogoUrl(VRSYNC_CONTATO), "https://crm.exemplo.com/logo-contato.png");
    assert.equal(vrsyncLogoUrl("<ListingDataFeed><Listings></Listings></ListingDataFeed>"), undefined);
  });

  test("JSON próprio: campo opcional de topo logoUrl", () => {
    assert.equal(jsonLogoUrl(JSON.stringify({ logoUrl: "https://crm.exemplo.com/l.webp", listings: [] })), "https://crm.exemplo.com/l.webp");
    assert.equal(jsonLogoUrl(JSON.stringify({ listings: [] })), undefined);
    assert.equal(jsonLogoUrl(JSON.stringify([{ externalId: "1" }])), undefined, "lista solta não tem topo");
    assert.equal(jsonLogoUrl(JSON.stringify({ logoUrl: 123, listings: [] })), undefined);
    assert.equal(jsonLogoUrl(JSON.stringify({ logoUrl: `https://x.com/${"a".repeat(3000)}`, listings: [] })), undefined, "tamanho máximo");
  });

  test("catálogo Meta de veículos não tem campo de logo da loja", () => {
    assert.equal(logoUrlDoFeed("meta_vehicles", "<listings><listing><vehicle_id>1</vehicle_id></listing></listings>"), undefined);
  });

  test("link que não é http(s) já fica de fora na leitura", () => {
    assert.equal(vrsyncLogoUrl(VRSYNC_HEADER.replace("https://crm.exemplo.com/logo-header.png", "javascript:alert(1)")), "https://crm.exemplo.com/logo-contato.png");
    assert.equal(jsonLogoUrl(JSON.stringify({ logoUrl: "file:///etc/passwd", listings: [] })), undefined);
    assert.equal(logoUrlDoFeed("vrsync", VRSYNC_HEADER), "https://crm.exemplo.com/logo-header.png");
    assert.equal(logoUrlDoFeed("novoseminovo_json", JSON.stringify({ logoUrl: "https://a.com/l.png", listings: [] })), "https://a.com/l.png");
    assert.equal(logoUrlDoFeed("vrsync", "isto não é xml <<<"), undefined, "XML quebrado não derruba");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Logo do feed no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const boas = new BoasVindasService(prisma);
  const tag = `fl-${Date.now()}`;
  const ids = { owner: "", partner: "" };
  let png: Buffer;

  const novaEmpresa = async (sufixo: string, data: Record<string, unknown> = {}) =>
    (await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "real_estate_agency", legalName: `Imob ${tag} ${sufixo}`, document: `${tag}${sufixo}`, slug: `${tag}-${sufixo}`, ...data } })).id;

  before(async () => {
    png = await safeSharp(undefined, { create: { width: 200, height: 100, channels: 3, background: { r: 14, g: 47, b: 74 } } }).png().toBuffer();
    ids.owner = (await prisma.user.create({ data: { name: "Dono FL", email: `fl-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.partner = await novaEmpresa("a");
  });

  after(async () => {
    const parceiros = await prisma.partner.findMany({ where: { ownerUserId: ids.owner }, select: { id: true } });
    for (const p of parceiros) await prisma.mktContent.deleteMany({ where: { origemId: { startsWith: `boas-vindas:${p.id}:` } } });
    await prisma.integrationFeed.deleteMany({ where: { partnerId: { in: parceiros.map((p) => p.id) } } });
    await prisma.partner.deleteMany({ where: { ownerUserId: ids.owner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  test("URL javascript:, file: ou de endereço interno é recusada sem baixar nada", async () => {
    let baixou = 0;
    const baixar = async () => (baixou++, png);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "http://127.0.0.1/logo.png", "http://10.0.0.5/logo.png", "http://localhost/logo.png", "http://[::1]/logo.png"]) {
      await assert.rejects(importarLogoDoFeed(prisma, ids.partner, url, { baixar }), Error, url);
    }
    assert.equal(baixou, 0);
    assert.equal((await prisma.partner.findUnique({ where: { id: ids.partner } }))?.logoUrl, null);
  });

  test("arquivo que não é imagem (HTML/SVG com script) é recusado", async () => {
    for (const bytes of ["<html><script>alert(1)</script></html>", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>']) {
      await assert.rejects(importarLogoDoFeed(prisma, ids.partner, "https://crm.exemplo.com/logo.png", { baixar: async () => Buffer.from(bytes) }), /imagem/);
    }
    assert.equal((await prisma.partner.findUnique({ where: { id: ids.partner } }))?.logoUrl, null);
  });

  test("logo válida é gravada no nosso armazenamento (nunca a URL externa)", async () => {
    assert.equal(await importarLogoDoFeed(prisma, ids.partner, "https://crm.exemplo.com/logo.png", { baixar: async () => png }), "salva");
    const logo = (await prisma.partner.findUnique({ where: { id: ids.partner } }))?.logoUrl;
    assert.match(logo ?? "", /^\/uploads\//);
  });

  test("não sobrescreve a logo que já existe, nem se a URL do feed mudar", async () => {
    const antes = (await prisma.partner.findUnique({ where: { id: ids.partner } }))?.logoUrl;
    let baixou = 0;
    assert.equal(await importarLogoDoFeed(prisma, ids.partner, "https://crm.exemplo.com/OUTRA-logo.png", { baixar: async () => (baixou++, png) }), "ja_tem");
    assert.equal(baixou, 0, "nem baixa");
    assert.equal((await prisma.partner.findUnique({ where: { id: ids.partner } }))?.logoUrl, antes);
  });

  test("dono enviou a logo enquanto o download corria: a do dono fica", async () => {
    const id = await novaEmpresa("b");
    const r = await importarLogoDoFeed(prisma, id, "https://crm.exemplo.com/logo.png", {
      baixar: async () => {
        await prisma.partner.update({ where: { id }, data: { logoUrl: "/uploads/do-dono.webp" } });
        return png;
      },
    });
    assert.equal(r, "ja_tem");
    assert.equal((await prisma.partner.findUnique({ where: { id } }))?.logoUrl, "/uploads/do-dono.webp");
  });

  test("logo do feed + autorização dispara as boas-vindas uma vez só", async () => {
    const id = await novaEmpresa("c", { socialConsentAt: new Date() });
    const aoSalvar = (pid: string) => boas.sincronizar(pid).then(() => undefined);
    await importarLogoDoFeed(prisma, id, "https://crm.exemplo.com/logo.png", { baixar: async () => png, aoSalvar });
    await importarLogoDoFeed(prisma, id, "https://crm.exemplo.com/logo.png", { baixar: async () => png, aoSalvar });
    await boas.sincronizar(id);
    const cs = await prisma.mktContent.findMany({ where: { origemId: { startsWith: `boas-vindas:${id}:` } } });
    assert.equal(cs.length, 2);
  });

  test("sem autorização, a logo do feed entra mas nenhum post é criado", async () => {
    const id = await novaEmpresa("d");
    await importarLogoDoFeed(prisma, id, "https://crm.exemplo.com/logo.png", { baixar: async () => png, aoSalvar: (pid) => boas.sincronizar(pid).then(() => undefined) });
    assert.ok((await prisma.partner.findUnique({ where: { id } }))?.logoUrl);
    assert.equal(await prisma.mktContent.count({ where: { origemId: { startsWith: `boas-vindas:${id}:` } } }), 0);
  });

  test("sincronização do feed: logo vem junto; falha ao baixar a logo não derruba a importação", async () => {
    const id = await novaEmpresa("e", { socialConsentAt: new Date() });
    const feed = await prisma.integrationFeed.create({ data: { partnerId: id, url: "https://crm.exemplo.com/feed.json", format: "novoseminovo_json" } });
    const svc = new IntegrationsService(prisma, {} as never, {} as never, boas);
    const feedJson = JSON.stringify({ logoUrl: "https://crm.exemplo.com/logo.png", listings: [{ externalId: "1" }] });
    (svc as unknown as { downloadFeed: () => Promise<string> }).downloadFeed = async () => feedJson;
    let aplicados = 0;
    svc.applyItems = (async () => {
      aplicados++;
      return { report: { total: 1, created: 1, updated: 0, unchanged: 0, paused: 0, reactivated: 0, skipped: 0, errors: [], warnings: [] }, outcomes: [] };
    }) as never;

    (svc as unknown as { downloadLogo: () => Promise<Buffer> }).downloadLogo = async () => {
      throw new Error("CRM fora do ar");
    };
    let row = await svc.syncFeed(feed.id);
    assert.equal(row.lastStatus, "ok", "a importação continua");
    assert.equal(aplicados, 1);
    assert.equal((await prisma.partner.findUnique({ where: { id } }))?.logoUrl, null);

    (svc as unknown as { downloadLogo: () => Promise<Buffer> }).downloadLogo = async () => png;
    row = await svc.syncFeed(feed.id);
    assert.equal(row.lastStatus, "ok");
    assert.match((await prisma.partner.findUnique({ where: { id } }))?.logoUrl ?? "", /^\/uploads\//);
    assert.equal(await prisma.mktContent.count({ where: { origemId: { startsWith: `boas-vindas:${id}:` } } }), 2);
    await svc.syncFeed(feed.id);
    assert.equal(await prisma.mktContent.count({ where: { origemId: { startsWith: `boas-vindas:${id}:` } } }), 2);
  });
});
