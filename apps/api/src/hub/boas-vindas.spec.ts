import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { PrismaService } from "../prisma/prisma.service";
import { savePartnerSocial } from "../partners/social";
import { safeSharp } from "../common/image-safety";
import { BoasVindasService } from "./boas-vindas.service";
import { montarSvgBoasVindas } from "./boas-vindas-layout";
import { dataBoasVindas, nomeExibicao, origemIdBoasVindas, problemasLegenda, textosBoasVindas } from "./boas-vindas-regras";
import { MarketingHubService } from "./marketing.service";

// Post automático de boas-vindas (pedido do Diego, 20/11/2026): empresa com
// logo E autorização de divulgação ganha 2 conteúdos (Instagram e Facebook)
// em Marketing → Aprovações. Nada publica sem a aprovação do Diego.

const loja = { nome: "Auto Veículos Exemplo", slug: "auto-veiculos-exemplo", type: "dealership" };

describe("Boas-vindas: textos", () => {
  test("empresa: título, subtítulo, link da loja e rodapé com o slogan", () => {
    const t = textosBoasVindas(loja);
    assert.equal(t.titulo, "Bem-vinda ao NovoSeminovo, Auto Veículos Exemplo!");
    assert.equal(t.subtitulo, "Agora os anúncios da Auto Veículos Exemplo também estão aqui.");
    assert.equal(t.linhaLink, "Conheça a loja: novoseminovo.com.br/lojas/auto-veiculos-exemplo");
    assert.equal(t.rodape, "novoseminovo.com.br · Carros e imóveis, sem enrolação.");
    assert.equal(t.tituloConteudo, "Boas-vindas: Auto Veículos Exemplo");
  });

  test("imobiliária e construtora: 'Conheça os imóveis'", () => {
    assert.match(textosBoasVindas({ ...loja, type: "real_estate_agency" }).linhaLink, /^Conheça os imóveis: novoseminovo\.com\.br\/lojas\//);
    assert.match(textosBoasVindas({ ...loja, type: "builder" }).linhaLink, /^Conheça os imóveis:/);
  });

  test("corretor(a) autônomo(a): 'Boas-vindas' e 'os anúncios de NOME'", () => {
    const t = textosBoasVindas({ nome: "Maria Souza", slug: "maria-souza", type: "broker" });
    assert.equal(t.titulo, "Boas-vindas ao NovoSeminovo, Maria Souza!");
    assert.equal(t.subtitulo, "Agora os anúncios de Maria Souza também estão aqui.");
    assert.match(t.linhaLink, /^Conheça os imóveis: novoseminovo\.com\.br\/lojas\/maria-souza$/);
    assert.match(t.legenda, /^Boas-vindas ao NovoSeminovo, Maria Souza! 🎉 A partir de agora, os anúncios de Maria Souza também estão aqui,/);
  });

  test("legenda exata, com o @ só quando a empresa informou", () => {
    const com = textosBoasVindas({ ...loja, instagram: "autoexemplo" }).legenda;
    assert.equal(
      com,
      "Bem-vinda ao NovoSeminovo, Auto Veículos Exemplo! 🎉 A partir de agora, os anúncios da Auto Veículos Exemplo também estão aqui, com a Vitrine para o Instagram, o WhatsApp e a rua. 👉 Conheça: https://novoseminovo.com.br/lojas/auto-veiculos-exemplo @autoexemplo\n\nCarros e imóveis, sem enrolação. Em todo o Brasil. #novoseminovo #bemvinda",
    );
    const sem = textosBoasVindas({ ...loja, instagram: null }).legenda;
    assert.ok(!sem.includes("@"), "sem Instagram informado, nada de @");
    assert.match(sem, /Conheça: https:\/\/novoseminovo\.com\.br\/lojas\/auto-veiculos-exemplo\n\n/);
  });

  test("regras da legenda: sem preço, desconto, números de visitas/vendas, concorrente ou cashback", () => {
    for (const type of ["dealership", "real_estate_agency", "broker", "builder", "workshop"]) {
      for (const instagram of ["autoexemplo", null]) {
        assert.deepEqual(problemasLegenda(textosBoasVindas({ ...loja, type, instagram }).legenda), [], `${type} ${instagram}`);
      }
    }
    assert.ok(problemasLegenda("Carros a partir de R$ 49.900").length);
    assert.ok(problemasLegenda("Aproveite 10% de desconto").length);
    assert.ok(problemasLegenda("Já são 2.000 visitas por dia").length);
    assert.ok(problemasLegenda("Mais de 300 vendas no mês").length);
    assert.ok(problemasLegenda("Melhor que a OLX e a Webmotors").length);
    assert.ok(problemasLegenda("Ganhe cashback").length);
  });

  test("o nome da empresa nunca derruba a regra (ex.: loja chamada 'Desconto Veículos')", () => {
    const t = textosBoasVindas({ ...loja, nome: "Desconto Veículos" });
    assert.match(t.legenda, /Desconto Veículos/);
  });

  test("nome da empresa: tira o CPF que a Receita põe na razão social do MEI e espaços sobrando", () => {
    assert.equal(nomeExibicao("MARIA SOUZA 12345678901"), "MARIA SOUZA");
    assert.equal(nomeExibicao("  Joao   Corretor 123.456.789-01 "), "Joao Corretor");
    assert.equal(nomeExibicao("Auto Center 2000"), "Auto Center 2000");
  });

  test("um id de origem por empresa e rede (nunca duplica)", () => {
    assert.equal(origemIdBoasVindas("p1", "instagram"), "boas-vindas:p1:instagram");
  });
});

describe("Boas-vindas: data planejada (2 dias úteis, 12h de Brasília)", () => {
  const sp = (iso: string) => new Date(`${iso}-03:00`);
  test("quarta → sexta 12h", () => assert.equal(dataBoasVindas(sp("2026-11-18T10:00:00")).toISOString(), "2026-11-20T15:00:00.000Z"));
  test("sexta → terça 12h", () => assert.equal(dataBoasVindas(sp("2026-11-20T09:00:00")).toISOString(), "2026-11-24T15:00:00.000Z"));
  test("sábado e domingo → terça 12h", () => {
    assert.equal(dataBoasVindas(sp("2026-11-21T15:00:00")).toISOString(), "2026-11-24T15:00:00.000Z");
    assert.equal(dataBoasVindas(sp("2026-11-22T15:00:00")).toISOString(), "2026-11-24T15:00:00.000Z");
  });
  test("quinta 23h30 em Brasília (já sexta em UTC) conta como quinta → segunda", () => {
    assert.equal(dataBoasVindas(sp("2026-11-19T23:30:00")).toISOString(), "2026-11-23T15:00:00.000Z");
  });
});

describe("Boas-vindas: arte", () => {
  test("texto da empresa com <, & e aspas é escapado no SVG (e o SVG continua válido)", async () => {
    const t = textosBoasVindas({ ...loja, nome: `A<B & "C" '<script>` });
    const svg = await montarSvgBoasVindas(t);
    assert.ok(!svg.includes("<script>"));
    assert.ok(!svg.includes("A<B"));
    assert.ok(svg.includes("A&lt;B &amp; &quot;C&quot; &#39;&lt;script&gt;"));
    const png = await safeSharp(Buffer.from(svg)).png().toBuffer();
    const meta = await safeSharp(png).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
  });

  test("caractere de controle no nome não quebra o XML", async () => {
    const svg = await montarSvgBoasVindas(textosBoasVindas({ ...loja, nome: "Loja\u0000\u0007 Teste" }));
    assert.ok(!/[\u0000-\u0008]/.test(svg));
    await safeSharp(Buffer.from(svg)).png().toBuffer();
  });

  test("nome comum (ex.: 'Imobiliária Savassi Ltda') aparece inteiro: diminui a letra antes de cortar", async () => {
    for (const nome of ["Imobiliária Savassi Ltda", "Auto Veículos Exemplo", "Concessionária Belo Horizonte Seminovos"]) {
      const svg = await montarSvgBoasVindas(textosBoasVindas({ ...loja, nome, slug: "imobiliaria-savassi-ltda-bh" }));
      assert.ok(!svg.includes("…"), `${nome} foi cortado`);
    }
  });

  test("letras largas (M, W) nunca passam da margem: a quebra mede o texto de verdade", async () => {
    for (const nome of ["MMMMWWWW Mmmm Wwww Veículos Grandes", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "Comércio de Veículos Seminovos e Usados Grande Belo Horizonte Ltda"]) {
      const svg = await montarSvgBoasVindas(textosBoasVindas({ ...loja, nome, slug: "comercio-de-veiculos-seminovos-e-usados-grande-belo-horizonte-ltda" }));
      const { data, info } = await safeSharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let fora = 0;
      for (let y = 650; y < 1320; y++) for (const x of [...Array(80).keys(), ...Array(80).keys()].map((v, i) => (i < 80 ? v : 1000 + v))) if (data[(y * info.width + x) * 4 + 3] > 0) fora++;
      assert.equal(fora, 0, `${nome}: texto encostou na borda`);
    }
  });

  test("nome enorme quebra em linhas e não passa da largura", async () => {
    const svg = await montarSvgBoasVindas(textosBoasVindas({ ...loja, nome: "Comércio de Veículos Seminovos e Usados Grande Belo Horizonte Ltda" }));
    const linhasTitulo = (svg.match(/data-bloco="titulo"/g) ?? []).length;
    assert.ok(linhasTitulo >= 2 && linhasTitulo <= 3, `linhas do título: ${linhasTitulo}`);
  });

  test("arte 1080×1350 PNG com fundo creme liso", async () => {
    const logo = await safeSharp(undefined, { create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 106, b: 164, alpha: 1 } } }).png().toBuffer();
    const png = await new BoasVindasService({} as never).gerarArte(textosBoasVindas(loja), logo);
    const img = safeSharp(png);
    const meta = await img.metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    const { data, info } = await safeSharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    assert.deepEqual(px(5, 5), [0xfa, 0xf8, 0xf3], "canto: creme #FAF8F3");
    assert.deepEqual(px(1074, 700), [0xfa, 0xf8, 0xf3]);
    assert.deepEqual(px(540, 480), [0, 106, 164], "a logo da empresa fica no centro");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Boas-vindas no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const boas = new BoasVindasService(prisma);
  const tag = `bv-${Date.now()}`;
  const ids = { owner: "", partner: "", admin: "" };
  let logo = "";

  const conteudos = () => prisma.mktContent.findMany({ where: { origemId: { startsWith: `boas-vindas:${ids.partner}:` } }, orderBy: { origemId: "asc" } });

  before(async () => {
    const png = await safeSharp(undefined, { create: { width: 300, height: 300, channels: 3, background: { r: 241, g: 142, b: 41 } } }).png().toBuffer();
    const { getPhotoStorage } = await import("../common/storage");
    logo = await getPhotoStorage().save(png, "logo.png", "image/png");
    ids.owner = (await prisma.user.create({ data: { name: "Dono BV", email: `bv-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.partner = (await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja <BV> & ${tag}`, document: `bv${tag}`, slug: tag } })).id;
  });

  after(async () => {
    await prisma.mktContent.deleteMany({ where: { origemId: { startsWith: `boas-vindas:${ids.partner}:` } } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  test("sem logo: nenhum post", async () => {
    await prisma.partner.update({ where: { id: ids.partner }, data: { socialConsentAt: new Date() } });
    assert.equal(await boas.sincronizar(ids.partner), "sem_logo");
    assert.equal((await conteudos()).length, 0);
  });

  test("com logo e sem autorização: nenhum post", async () => {
    await prisma.partner.update({ where: { id: ids.partner }, data: { socialConsentAt: null, logoUrl: logo } });
    assert.equal(await boas.sincronizar(ids.partner), "sem_autorizacao");
    assert.equal((await conteudos()).length, 0);
  });

  test("autorização dada depois (pela tela do dono): cria Instagram e Facebook em aprovação, 2 dias úteis às 12h", async () => {
    const antes = new Date();
    await savePartnerSocial(prisma, ids.owner, { instagram: "loja.bv", facebook: "LojaBV", consent: true }, (id) => boas.sincronizar(id).then(() => undefined));
    const cs = await conteudos();
    assert.deepEqual(cs.map((c) => c.redes), [["facebook"], ["instagram"]]);
    for (const c of cs) {
      assert.equal(c.status, "em_aprovacao");
      assert.equal(c.tipo, "post");
      assert.equal(c.titulo, `Boas-vindas: Loja <BV> & ${tag}`);
      assert.equal(c.dataPlanejada?.toISOString(), dataBoasVindas(c.createdAt).toISOString());
      assert.ok(c.dataPlanejada! > antes);
      assert.match(c.midias[0], /^\/uploads\/.+\.jpg$/, "Instagram só aceita JPEG");
      assert.match(c.legenda, new RegExp(`https://novoseminovo\\.com\\.br/lojas/${tag} @loja\\.bv`));
      assert.deepEqual(c.hashtags, []);
    }
    assert.equal((cs[0].detalhes as Record<string, string>).marcar_facebook, "LojaBV");
    assert.equal((cs[1].detalhes as Record<string, string>).marcar_instagram, "loja.bv");
    const hist = await prisma.mktHistory.findMany({ where: { contentId: cs[0].id } });
    assert.deepEqual(hist.map((h) => h.acao), ["enviado"]);
  });

  test("editar o cadastro (trocar logo, salvar de novo) não repete o post", async () => {
    await savePartnerSocial(prisma, ids.owner, { instagram: "loja.bv2", facebook: "LojaBV", consent: true }, (id) => boas.sincronizar(id).then(() => undefined));
    assert.equal(await boas.sincronizar(ids.partner), "ja_existe");
    assert.equal((await conteudos()).length, 2);
  });

  test("retirar a autorização cancela o que ainda não foi publicado (o publicado fica)", async () => {
    const [fb] = await conteudos();
    await prisma.mktContent.update({ where: { id: fb.id }, data: { status: "publicado", publicadoEm: new Date() } });
    await savePartnerSocial(prisma, ids.owner, { instagram: "loja.bv2", facebook: "LojaBV", consent: false }, (id) => boas.sincronizar(id).then(() => undefined));
    const [fb2, ig2] = await conteudos();
    assert.equal(fb2.status, "publicado");
    assert.equal(ig2.status, "cancelado");
    const hist = await prisma.mktHistory.findMany({ where: { contentId: ig2.id }, orderBy: { createdAt: "asc" } });
    assert.equal(hist.at(-1)?.acao, "cancelado");
    assert.match(hist.at(-1)?.texto ?? "", /autorização/);
  });
});

describe("Boas-vindas publicadas: marcação da empresa", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const avisos: { userId: string; type: string; payload: Record<string, unknown> }[] = [];
  const mkt = new MarketingHubService(prisma, { notify: async (userId: string, type: string, payload: Record<string, unknown>) => void avisos.push({ userId, type, payload }) } as never);
  const tag = `bvm-${Date.now()}`;
  let server: Server;
  const calls: { path: string; body: string }[] = [];
  const env = { ...process.env };
  let recusarMarcacao = true;
  let adminId = "";

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const path = (req.url ?? "").split("?")[0];
        const params = new URLSearchParams(body);
        calls.push({ path: `${req.method} ${path}`, body });
        res.setHeader("Content-Type", "application/json");
        const erro = (msg: string) => {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { message: msg, code: 100 } }));
        };
        if (req.method === "POST" && path.endsWith("/ig1/media")) {
          if (params.get("user_tags") && recusarMarcacao) return erro("Invalid user id in user_tags");
          return res.end(JSON.stringify({ id: `c${calls.length}` }));
        }
        if (req.method === "GET" && /\/c\d+$/.test(path)) return res.end(JSON.stringify({ status_code: "FINISHED" }));
        if (path.endsWith("/ig1/media_publish")) return res.end(JSON.stringify({ id: "midia1" }));
        if (path.endsWith("/midia1")) return res.end(JSON.stringify({ permalink: "https://instagram.com/p/abc" }));
        if (path.endsWith("/pg1/photos")) return res.end(JSON.stringify({ id: "foto1", post_id: "pg1_post1" }));
        if (req.method === "GET" && path.endsWith("/LojaMarcada")) return recusarMarcacao ? erro("Page not found") : res.end(JSON.stringify({ id: "998877" }));
        if (req.method === "POST" && path.endsWith("/pg1_post1")) return res.end(JSON.stringify({ success: true }));
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { message: "rota de teste desconhecida" } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    Object.assign(process.env, {
      INSTAGRAM_GRAPH_HOST: `http://127.0.0.1:${addr.port}`,
      INSTAGRAM_ACCESS_TOKEN: "token-de-teste",
      INSTAGRAM_ACCOUNT_ID: "ig1",
      FACEBOOK_PAGE_ID: "pg1",
      FACEBOOK_PAGE_TOKEN: "token-pagina-teste",
      PUBLIC_API_URL: "https://api.exemplo.com",
    });
    adminId = (await prisma.user.create({ data: { name: "Diego BV", email: `adm-${tag}@teste.local`, role: "admin" } })).id;
  });

  after(async () => {
    process.env = env;
    server.close();
    await prisma.mktContent.deleteMany({ where: { titulo: { contains: tag } } });
    // Outros testes rodando ao mesmo tempo também avisam "todos os admins".
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  const criarAprovado = async (rede: "instagram" | "facebook", detalhes: Record<string, string>) => {
    const midia = await mkt.salvarMidia({ nome: "arte.png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" });
    const c = await mkt.criar({ tipo: "post", redes: [rede], titulo: `Boas-vindas: ${tag} ${rede}`, legenda: "Bem-vinda! @lojamarcada", midias: [midia], detalhes }, "hub", "Hub");
    await mkt.aprovar(c.id, { publicarEm: "2020-01-01T12:00:00Z" }, "u1");
    meus = midia.split("/").pop()!;
    return c.id;
  };
  // Outros arquivos de teste também publicam no mesmo banco: conta só as
  // chamadas com a imagem deste teste.
  let meus = "";
  const criacoesIg = () => calls.filter((x) => x.path.endsWith("/ig1/media") && x.body.includes(meus));

  test("Instagram recusa a marcação: publica sem ela e avisa o Diego para marcar pelo app", async () => {
    recusarMarcacao = true;
    avisos.length = 0;
    calls.length = 0;
    const id = await criarAprovado("instagram", { marcar_instagram: "lojamarcada" });
    await mkt.publicarPendentes(new Date());
    const d = await mkt.detalhe(id);
    assert.equal(d.status, "publicado", "a marcação nunca derruba a publicação");
    assert.equal(d.links.instagram, "https://instagram.com/p/abc");
    const criacoes = criacoesIg();
    assert.equal(criacoes.length, 2, "tenta com a marcação e depois sem");
    assert.deepEqual(JSON.parse(new URLSearchParams(criacoes[0].body).get("user_tags")!), [{ username: "lojamarcada", x: 0.5, y: 0.5 }]);
    assert.equal(new URLSearchParams(criacoes[1].body).get("user_tags"), null);
    const aviso = avisos.find((a) => a.userId === adminId);
    assert.ok(aviso, "Diego recebe o aviso");
    assert.equal(aviso!.type, "ops_alert");
    assert.match(String(aviso!.payload.body), /@lojamarcada/);
    assert.match(String(aviso!.payload.body), /instagram\.com\/p\/abc/);
    assert.ok(!JSON.stringify(avisos).includes("token-de-teste"), "token nunca aparece no aviso");
    assert.ok(d.historico.some((h) => h.acao === "marcacao"));
  });

  test("Instagram aceita a marcação: um envio só, sem aviso", async () => {
    recusarMarcacao = false;
    avisos.length = 0;
    calls.length = 0;
    const id = await criarAprovado("instagram", { marcar_instagram: "lojamarcada" });
    await mkt.publicarPendentes(new Date());
    assert.equal((await mkt.detalhe(id)).status, "publicado");
    assert.equal(criacoesIg().length, 1);
    assert.equal(avisos.filter((a) => String(a.payload.body).includes("lojamarcada")).length, 0);
  });

  test("Facebook: menciona a página depois de publicar; se a Meta recusar, publica igual e avisa", async () => {
    recusarMarcacao = false;
    avisos.length = 0;
    calls.length = 0;
    const ok = await criarAprovado("facebook", { marcar_facebook: "LojaMarcada" });
    await mkt.publicarPendentes(new Date());
    assert.equal((await mkt.detalhe(ok)).status, "publicado");
    const edicao = calls.find((x) => x.path.endsWith("/pg1_post1"));
    assert.ok(edicao, "edita o post com a menção");
    assert.match(new URLSearchParams(edicao!.body).get("message")!, /@\[998877\]/);
    assert.equal(avisos.length, 0);

    recusarMarcacao = true;
    calls.length = 0;
    const falha = await criarAprovado("facebook", { marcar_facebook: "LojaMarcada" });
    await mkt.publicarPendentes(new Date());
    const d = await mkt.detalhe(falha);
    assert.equal(d.status, "publicado");
    assert.equal(d.links.facebook, "https://www.facebook.com/pg1_post1");
    const aviso = avisos.find((a) => a.userId === adminId);
    assert.ok(aviso);
    assert.match(String(aviso!.payload.body), /LojaMarcada/);
    assert.match(String(aviso!.payload.body), /facebook\.com\/pg1_post1/);
  });

  test("handle inválido nos detalhes não vai para a Meta", async () => {
    recusarMarcacao = false;
    calls.length = 0;
    await criarAprovado("instagram", { marcar_instagram: "x\"}]; <b>" });
    await mkt.publicarPendentes(new Date());
    const criacoes = criacoesIg();
    assert.equal(new URLSearchParams(criacoes[0].body).get("user_tags"), null);
  });
});
