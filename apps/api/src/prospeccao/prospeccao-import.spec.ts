import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { ProspeccaoImportService } from "./prospeccao-import.service";

// Importação de empresas do Mailerfind para o CRM do Hub, no banco:
// cria cards "A abordar" com origem "mailerfind" e a etiqueta da campanha,
// e nunca duplica (empresa já no CRM, já parceira do site, repetida no
// arquivo, arquivo enviado de novo ou duas importações ao mesmo tempo).

const withDb = Boolean(process.env.DATABASE_URL);

describe("Importar empresas no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new ProspeccaoImportService(prisma);
  const tag = `imp${Date.now().toString(36)}`;
  const cidade = `Cidade ${tag}`;
  const base = 10_000_000 + (Date.now() % 80_000_000);
  const cel = (n: number) => `(31) 9${String(base + n).padStart(8, "0").slice(-8)}`;
  const celE164 = (n: number) => `+55319${String(base + n).padStart(8, "0").slice(-8)}`;
  const ids = { user: "", owner: "", partner: "", existentes: [] as string[] };
  const etiqueta = `Teste ${tag}`;

  const arquivo = () =>
    Buffer.from(
      [
        "Name,Phone,Email,Website,City,State,Category,Rating,Reviews",
        `Nova Loja ${tag},${cel(1)},nova-${tag}@loja.com.br,https://nova-${tag}.com.br,${cidade},MG,Loja de carros,"4,5",10`,
        `Outra Nova ${tag},${cel(2)},,,${cidade},MG,Loja de carros,4,3`,
        `Mesmo Telefone ${tag},${cel(3)},,,Outra,MG,,,`,
        `Mesmo Email ${tag},,EXISTENTE-${tag}@LOJA.COM.BR,,Outra,MG,,,`,
        `Mesmo Site ${tag},${cel(4)},,http://www.existente-${tag}.com.br/estoque,Outra,MG,,,`,
        `Existente Nome ${tag} LTDA,${cel(5)},,,${cidade},MG,,,`,
        `Parceira Pelo Telefone ${tag},${cel(6)},,,Outra,MG,,,`,
        `Razão Parceira ${tag},${cel(7)},,,${cidade},MG,,,`,
        `Nova Loja ${tag} (repetida),${cel(1)},,,${cidade},MG,,,`,
        `Sem Contato ${tag},,,,${cidade},MG,,,`,
        `"=HYPERLINK(""http://golpe"")",${cel(8)},,,${cidade},MG,,,`,
      ].join("\n"),
    );

  before(async () => {
    ids.user = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "admin" } })).id;
    ids.owner = (await prisma.user.create({ data: { name: "Dona da loja", email: `parceira-${tag}@teste.local`, phone: celE164(6) } })).id;
    ids.partner = (await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "dealership", legalName: `Razão Parceira ${tag}`, document: `9${base}000`.slice(0, 14), slug: `${tag}-parceira`, city: cidade, state: "MG" } })).id;
    for (const data of [
      { name: `Antiga ${tag}`, segment: "vehicle", phone: celE164(3), source: "manual" },
      { name: `Antiga Email ${tag}`, segment: "vehicle", email: `existente-${tag}@loja.com.br`, source: "campanha" },
      { name: `Antiga Site ${tag}`, segment: "vehicle", website: `https://existente-${tag}.com.br`, siteDomain: `existente-${tag}.com.br`, source: "manual" },
      { name: `Existente Nome ${tag}`, segment: "vehicle", city: cidade, source: "manual" },
    ]) ids.existentes.push((await prisma.salesProspect.create({ data })).id);
  });

  after(async () => {
    await prisma.salesProspect.deleteMany({ where: { OR: [{ name: { contains: tag } }, { campaignTag: etiqueta }, { id: { in: ids.existentes } }] } });
    await prisma.prospectImport.deleteMany({ where: { tag: etiqueta } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("análise mostra prévia, colunas e contagens antes de gravar nada", async () => {
    const a = await service.analisar(arquivo(), "lista.csv");
    assert.equal(a.total, 11);
    assert.equal(a.contagens.novas, 3, "Nova Loja, Outra Nova e a do nome com fórmula");
    assert.equal(a.contagens.jaNoCrm, 4);
    assert.equal(a.contagens.jaParceiras, 2);
    assert.equal(a.contagens.repetidasNoArquivo, 1);
    assert.equal(a.contagens.invalidas, 1);
    assert.ok(a.previa.length <= 20 && a.previa.length === 11);
    assert.deepEqual(
      a.colunas.filter((c) => c.coluna).map((c) => [c.campo, c.coluna]),
      [
        ["nome", "Name"],
        ["telefone", "Phone"],
        ["email", "Email"],
        ["site", "Website"],
        ["cidade", "City"],
        ["uf", "State"],
        ["categoria", "Category"],
        ["nota", "Rating"],
        ["avaliacoes", "Reviews"],
      ],
    );
    assert.equal(await prisma.salesProspect.count({ where: { campaignTag: etiqueta } }), 0, "analisar não grava");
  });

  test("confirmar: cria só as novas, com motivo de cada duplicada e inválida", async () => {
    const a = await service.analisar(arquivo(), "lista.csv");
    const r = await service.confirmar(arquivo(), { hash: a.hash, etiqueta, segmento: "vehicle", nomeArquivo: "lista.csv" }, ids.user);
    assert.equal(r.criadas, 3);
    const motivos = Object.fromEntries(r.duplicadas.map((d) => [d.nome.replace(` ${tag}`, ""), d.motivo]));
    assert.deepEqual(motivos, {
      "Mesmo Telefone": "Já está no CRM: mesmo telefone",
      "Mesmo Email": "Já está no CRM: mesmo e-mail",
      "Mesmo Site": "Já está no CRM: mesmo site",
      "Existente Nome LTDA": "Já está no CRM: mesmo nome e cidade",
      "Parceira Pelo Telefone": "Já é parceira do site (cadastrada): mesmo telefone",
      "Razão Parceira": "Já é parceira do site (cadastrada): mesmo nome e cidade",
      "Nova Loja (repetida)": "Repetida no arquivo: mesmo telefone",
    });
    assert.deepEqual(r.invalidas.map((i) => i.motivo), ["Sem telefone nem e-mail válido"]);
    assert.ok(r.relatorioCsv.startsWith("Linha;Empresa;Motivo\n"));
    assert.ok(!/\n\d+;=/.test(r.relatorioCsv), "nenhuma célula começa com fórmula");

    const cards = await prisma.salesProspect.findMany({ where: { campaignTag: etiqueta }, orderBy: { name: "asc" } });
    assert.equal(cards.length, 3);
    for (const c of cards) {
      assert.equal(c.stage, "a_abordar");
      assert.equal(c.source, "mailerfind");
      assert.equal(c.segment, "vehicle");
      assert.equal(c.businessType, "loja");
    }
    const nova = cards.find((c) => c.name === `Nova Loja ${tag}`)!;
    assert.equal(nova.phone, celE164(1), "telefone em E.164");
    assert.equal(nova.email, `nova-${tag}@loja.com.br`);
    assert.equal(nova.siteDomain, `nova-${tag}.com.br`);
    assert.deepEqual(nova.importData, { categoria: "Loja de carros", nota: 4.5, avaliacoes: 10 });
    assert.equal(nova.city, cidade);
    assert.ok(cards.some((c) => c.name === 'HYPERLINK("http://golpe")'), "fórmula tirada do nome");

    const historico = await prisma.prospectImport.findFirstOrThrow({ where: { tag: etiqueta } });
    assert.deepEqual([historico.total, historico.created, historico.duplicates, historico.invalid, historico.createdById], [11, 3, 7, 1, ids.user]);
    const nota = await prisma.salesNote.findFirst({ where: { prospectId: nova.id } });
    assert.match(nota!.body, /Mailerfind/);
  });

  test("telefone e e-mail ficam criptografados no banco", async () => {
    const nova = await prisma.salesProspect.findFirstOrThrow({ where: { name: `Nova Loja ${tag}` }, select: { id: true } });
    const [cru] = await prisma.$queryRaw<{ phone: string; email: string; phone_hash: string; email_hash: string }[]>`SELECT phone, email, phone_hash, email_hash FROM sales_prospects WHERE id = ${nova.id}`;
    assert.ok(cru!.phone.startsWith("enc:v1:"));
    assert.ok(cru!.email.startsWith("enc:v1:"));
    assert.ok(cru!.phone_hash && cru!.email_hash);
    assert.ok(!cru!.email.includes(tag));
    // A busca por igualdade continua funcionando (índice cego).
    assert.equal((await prisma.salesProspect.findFirst({ where: { email: `NOVA-${tag}@loja.com.br`.toLowerCase() } }))?.id, nova.id);
    const chaves = await prisma.prospectDedupKey.findMany({ where: { prospectId: nova.id } });
    assert.equal(chaves.length, 4, "telefone, e-mail, site e nome+cidade");
    assert.ok(chaves.every((k) => /^[0-9a-f]{64}$/.test(k.key)), "só o HMAC, nunca o dado");
  });

  test("enviar o mesmo arquivo de novo não cria nada (idempotente)", async () => {
    const a = await service.analisar(arquivo(), "lista.csv");
    assert.equal(a.contagens.novas, 0);
    assert.ok(a.jaImportadoEm, "avisa que o arquivo já foi importado");
    const r = await service.confirmar(arquivo(), { hash: a.hash, etiqueta, segmento: "vehicle" }, ids.user);
    assert.equal(r.criadas, 0);
    assert.equal(await prisma.salesProspect.count({ where: { campaignTag: etiqueta } }), 3);
  });

  test("arquivo parecido (outra zona do mapa) só traz as que faltam", async () => {
    const outro = Buffer.from([`Nome;Telefone;Cidade`, `NOVA LOJA ${tag};${cel(1)};${cidade}`, `Terceira ${tag};${cel(9)};${cidade}`].join("\n"));
    const a = await service.analisar(outro);
    const r = await service.confirmar(outro, { hash: a.hash, etiqueta, segmento: "vehicle" }, ids.user);
    assert.equal(r.criadas, 1);
    assert.deepEqual(r.duplicadas.map((d) => d.motivo), ["Já está no CRM: mesmo telefone"]);
  });

  test("duas importações ao mesmo tempo não duplicam (trava no banco)", async () => {
    const corrida = Buffer.from([`Nome,Telefone,Cidade`, ...Array.from({ length: 8 }, (_, i) => `Corrida ${i} ${tag},${cel(20 + i)},${cidade}`)].join("\n"));
    const a = await service.analisar(corrida);
    const [r1, r2] = await Promise.all([1, 2].map(() => service.confirmar(corrida, { hash: a.hash, etiqueta, segmento: "vehicle" }, ids.user)));
    assert.equal(r1!.criadas + r2!.criadas, 8);
    assert.equal(await prisma.salesProspect.count({ where: { name: { startsWith: "Corrida" }, campaignTag: etiqueta } }), 8);
  });

  test("empresa importada que se cadastra no site usa o mesmo card (sem card novo)", async () => {
    const dona = await prisma.user.create({ data: { name: "Dona Nova", email: `outra-nova-${tag}@teste.local`, phone: celE164(2) } });
    const parceira = await prisma.partner.create({ data: { ownerUserId: dona.id, type: "dealership", legalName: `Outra Nova Razão ${tag}`, document: `8${base}000`.slice(0, 14), slug: `${tag}-outra` } });
    await new SalesService(prisma).linkSignup(parceira.id);
    const card = await prisma.salesProspect.findFirstOrThrow({ where: { name: `Outra Nova ${tag}` } });
    assert.equal(card.partnerId, parceira.id);
    assert.equal(await prisma.salesProspect.count({ where: { partnerId: parceira.id } }), 1);
    await prisma.salesProspect.update({ where: { id: card.id }, data: { partnerId: null } });
    await prisma.salesNote.deleteMany({ where: { prospectId: card.id, kind: "stage" } });
    await prisma.partner.delete({ where: { id: parceira.id } });
  });

  test("place_id do Google: guardado no card, único, e acha a mesma empresa com outro nome/telefone", async () => {
    const pid = `ChIJ${tag}000001`;
    const a1 = Buffer.from(["full_name,full_phone_number,city,place_id", `Lugar Um ${tag},${cel(40)},${cidade},${pid}`].join("\n"));
    const r1 = await service.confirmar(a1, { hash: (await service.analisar(a1)).hash, etiqueta, segmento: "vehicle" }, ids.user);
    assert.equal(r1.criadas, 1);
    const card = await prisma.salesProspect.findFirstOrThrow({ where: { googlePlaceId: pid } });
    assert.equal(card.name, `Lugar Um ${tag}`);
    const a2 = Buffer.from(["full_name,full_phone_number,city,place_id", `Nome Novo ${tag},${cel(41)},Outra,${pid}`].join("\n"));
    const r2 = await service.confirmar(a2, { hash: (await service.analisar(a2)).hash, etiqueta, segmento: "vehicle" }, ids.user);
    assert.equal(r2.criadas, 0);
    assert.deepEqual(r2.duplicadas.map((d) => d.motivo), ["Já está no CRM: mesmo lugar no Google Maps"]);
    await assert.rejects(prisma.salesProspect.create({ data: { name: `Copia ${tag}`, segment: "vehicle", googlePlaceId: pid } }), /Unique|P2002/);
  });

  test("arquivo trocado entre analisar e confirmar é recusado; etiqueta e segmento validados", async () => {
    const a = await service.analisar(arquivo());
    await assert.rejects(service.confirmar(Buffer.from("Nome,Telefone\nX,(31) 3333-4444\n"), { hash: a.hash, etiqueta, segmento: "vehicle" }, ids.user), /analise de novo/i);
    await assert.rejects(service.confirmar(arquivo(), { hash: a.hash, etiqueta: "x".repeat(61), segmento: "vehicle" }, ids.user), /etiqueta/i);
    await assert.rejects(service.confirmar(arquivo(), { hash: a.hash, etiqueta, segmento: "barco" as never }, ids.user));
    await assert.rejects(service.analisar(Buffer.from("%PDF-1.4\n")), /PDF/);
  });
});

describe("Importar empresas: rota e permissão", () => {
  const { ProspeccaoController } = require("./prospeccao.controller") as typeof import("./prospeccao.controller");
  const { HubGuard } = require("../hub/hub.guard") as typeof import("../hub/hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const perfis = {
    dono: { userId: "dono", profile: "dono", permissions: ["crm.ver", "crm.editar", "financeiro", "marketing", "equipe"] },
    comercial: { userId: "comercial", profile: "comercial", permissions: ["crm.ver", "crm.editar"] },
    leitura: { userId: "leitura", profile: "leitura", permissions: ["crm.ver"] },
    marketing: { userId: "marketing", profile: "marketing", permissions: ["marketing"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string, handler: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => handler, getClass: () => ProspeccaoController }) as never;

  test("dono e comercial importam; leitura e marketing recebem 403", async () => {
    for (const handler of [ProspeccaoController.prototype.analisar, ProspeccaoController.prototype.confirmar]) {
      assert.equal(Reflect.getMetadata("hub:permission", handler), "crm.editar");
      assert.equal(await guard.canActivate(ctx("dono", handler)), true);
      assert.equal(await guard.canActivate(ctx("comercial", handler)), true);
      await assert.rejects(guard.canActivate(ctx("leitura", handler)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
      await assert.rejects(guard.canActivate(ctx("marketing", handler)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
    }
  });

  test("sem arquivo ou com corpo inválido: 400 antes do serviço", async () => {
    const chamadas: unknown[] = [];
    const ctrl = new ProspeccaoController({ analisar: async () => chamadas.push(1), confirmar: async () => chamadas.push(2) } as never);
    await assert.rejects(ctrl.analisar(undefined as never), /arquivo/i);
    const file = { buffer: Buffer.from("Nome,Telefone\nX,(31) 3333-4444\n"), originalname: "x.csv" } as never;
    await assert.rejects(ctrl.confirmar({ id: "u" }, file, { hash: "abc", etiqueta: "ok", segmento: "vehicle" }), /BadRequest|hash|inválid/i);
    await assert.rejects(ctrl.confirmar({ id: "u" }, file, { hash: "a".repeat(64), etiqueta: "<script>".repeat(20), segmento: "vehicle" }));
    assert.equal(chamadas.length, 0);
  });
});
