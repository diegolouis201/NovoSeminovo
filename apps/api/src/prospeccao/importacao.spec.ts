import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_LINHAS,
  analisarCsv,
  chavesDedup,
  csvRelatorio,
  decodificarCsv,
  detectarColunas,
  dominioDoSite,
  normalizarEmail,
  normalizarTelefoneBr,
  segmentoDaLinha,
  semFormula,
} from "./importacao";

// Importação de empresas do Mailerfind (busca do Google Maps) para o CRM do
// Hub: o arquivo é decidido pelo conteúdo, as colunas são reconhecidas em
// português ou inglês, nada que pareça fórmula entra e a mesma empresa não
// aparece duas vezes (nem dentro do próprio arquivo).

const csv = (texto: string) => Buffer.from(texto, "utf8");

describe("Importar empresas: tipo do arquivo pelo conteúdo", () => {
  test("CSV em UTF-8 (com BOM) e em Windows-1252 (Excel) viram o mesmo texto", () => {
    const utf8 = decodificarCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv("Nome;Cidade\nAuto São José;Belo Horizonte\n")]));
    assert.ok("texto" in utf8);
    assert.ok(utf8.texto.startsWith("Nome;"), "BOM sai");
    assert.ok(utf8.texto.includes("São José"));
    const latin1 = decodificarCsv(Buffer.from("Nome;Cidade\nAuto S\xe3o Jos\xe9;Belo Horizonte\n", "latin1"));
    assert.ok("texto" in latin1);
    assert.ok(latin1.texto.includes("São José"));
  });

  test("recusa o que não é CSV: PDF, planilha .xlsx (zip), imagem, binário, HTML, JSON, vazio", () => {
    const casos: [string, Buffer][] = [
      ["pdf", Buffer.from("%PDF-1.7\n1 0 obj\n")],
      ["xlsx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])],
      ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ["xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
      ["binário", Buffer.from("Nome,Cidade\nLoja\u0000X,BH\n")],
      ["utf16", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Nome,Cidade", "utf16le")])],
      ["html", csv("<!doctype html><html><body>Nome,Cidade</body></html>")],
      ["json", csv('[{"nome":"Loja"}]')],
      ["vazio", Buffer.alloc(0)],
      ["sem colunas", csv("só uma linha sem separador")],
    ];
    for (const [nome, bytes] of casos) {
      const r = decodificarCsv(bytes);
      assert.ok("erro" in r, `${nome} devia ser recusado`);
    }
  });

  test("limite de 5 MB e de 5.000 linhas", () => {
    assert.equal(IMPORT_MAX_BYTES, 5 * 1024 * 1024);
    assert.equal(IMPORT_MAX_LINHAS, 5000);
    const grande = decodificarCsv(Buffer.alloc(IMPORT_MAX_BYTES + 1, "a"));
    assert.ok("erro" in grande && /5 MB/.test(grande.erro));
    const linhas = ["Nome,Telefone,Cidade", ...Array.from({ length: IMPORT_MAX_LINHAS + 1 }, (_, i) => `Loja ${i},(31) 3333-${String(i).padStart(4, "0")},BH`)].join("\n");
    const muitas = analisarCsv(csv(linhas));
    assert.ok("erro" in muitas && /5\.000/.test(muitas.erro));
    const ok = analisarCsv(csv(["Nome,Telefone,Cidade", ...Array.from({ length: 10 }, (_, i) => `Loja ${i},(31) 3333-000${i},BH`)].join("\n")));
    assert.ok(!("erro" in ok));
  });
});

describe("Importar empresas: colunas do Mailerfind / Google Maps", () => {
  test("cabeçalhos em inglês", () => {
    const m = detectarColunas(["Business Name", "Phone", "Email", "Website", "Full Address", "City", "State", "Category", "Rating", "Reviews", "Google Maps URL", "Instagram", "Facebook"]);
    assert.deepEqual(m, { nome: 0, telefone: 1, email: 2, site: 3, endereco: 4, cidade: 5, uf: 6, categoria: 7, nota: 8, avaliacoes: 9, mapsUrl: 10, instagram: 11, facebook: 12 });
  });

  test("cabeçalhos em português, com acento e maiúsculas", () => {
    const m = detectarColunas(["NOME DA EMPRESA", "Telefone", "E-mail", "Site", "Endereço", "Cidade", "UF", "Categoria", "Nota", "Número de avaliações", "Link do Google Maps"]);
    assert.deepEqual(m, { nome: 0, telefone: 1, email: 2, site: 3, endereco: 4, cidade: 5, uf: 6, categoria: 7, nota: 8, avaliacoes: 9, mapsUrl: 10 });
  });

  test("variações comuns de exportação (title, phone_number, emails, review_count, place url)", () => {
    const m = detectarColunas(["title", "phone_number", "emails", "website", "address", "main_category", "rating", "review_count", "place_url"]);
    assert.equal(m.nome, 0);
    assert.equal(m.telefone, 1);
    assert.equal(m.email, 2);
    assert.equal(m.avaliacoes, 7);
    assert.equal(m.mapsUrl, 8);
    assert.equal(m.categoria, 5);
  });

  test("sem coluna de nome: análise recusa explicando", () => {
    const r = analisarCsv(csv("Telefone,Cidade\n(31) 3333-4444,BH\n"));
    assert.ok("erro" in r && /nome/i.test(r.erro));
  });
});

describe("Importar empresas: exportação real do Mailerfind (Google Maps)", () => {
  // Cabeçalho exato da exportação (dados fictícios): "country" aparece duas vezes.
  const fixture = readFileSync(join(__dirname, "../../src/prospeccao/fixtures/mailerfind-google-maps.csv"));

  test("todas as colunas reconhecidas sem mapear nada à mão", () => {
    const cab = fixture.toString("utf8").split("\n")[0]!.split(",");
    const m = detectarColunas(cab);
    const nome = (campo: keyof typeof m) => (m[campo] === undefined ? undefined : cab[m[campo]!]);
    assert.equal(nome("nome"), "full_name");
    assert.equal(nome("telefone"), "full_phone_number", "com DDI ganha de phone_number");
    assert.equal(nome("telefoneAlt"), "phone_number");
    assert.equal(nome("email"), "email");
    assert.equal(nome("emailsExtras"), "all_emails");
    assert.equal(nome("site"), "website");
    assert.equal(nome("endereco"), "full_address");
    assert.equal(nome("cidade"), "city");
    assert.equal(nome("uf"), "state");
    assert.equal(nome("categoria"), "category");
    assert.equal(nome("nota"), "rating");
    assert.equal(nome("avaliacoes"), "reviews_count");
    assert.equal(nome("mapsUrl"), "location_link");
    assert.equal(nome("facebook"), "facebook");
    assert.equal(nome("instagram"), "instagram");
    assert.equal(nome("placeId"), "place_id");
    assert.equal(nome("situacao"), "business_status");
  });

  test("linhas: e-mail de all_emails, telefone de phone_number quando falta o completo, UF por extenso, place_id", () => {
    const r = analisarCsv(fixture);
    assert.ok(!("erro" in r));
    assert.equal(r.total, 5);
    const [um, dois, cinco] = r.validas;
    assert.equal(um!.nome, "Loja Exemplo Um Veículos");
    assert.equal(um!.email, "contato@lojaexemploum.com.br", "primeiro válido de all_emails");
    assert.equal(um!.telefone, "+553130000001");
    assert.equal(um!.uf, "MG", "Minas Gerais → MG");
    assert.equal(um!.dominio, "lojaexemploum.com.br");
    assert.equal(um!.placeId, "ChIJexemplo0000000001");
    assert.equal(um!.nota, 4.6);
    assert.equal(um!.avaliacoes, 87);
    assert.equal(um!.instagram, "lojaexemploum");
    assert.ok(um!.mapsUrl?.startsWith("https://www.google.com/maps/"));
    assert.equal(dois!.telefone, "+5531990000002", "full_phone_number vazio: usa phone_number");
    assert.equal(dois!.nota, 4.1);
    assert.equal(cinco!.nome, "Exemplo Cinco Motors", "fórmula tirada");
    assert.deepEqual(r.duplicadas.map((d) => [d.linha, d.motivo]), [[4, "Repetida no arquivo: mesmo lugar no Google Maps"]]);
    assert.deepEqual(r.invalidas.map((d) => [d.linha, d.motivo]), [[5, "Fechada permanentemente no Google"]]);
  });

  test("place_id é a primeira chave de duplicada", () => {
    assert.deepEqual(chavesDedup({ nome: "X", placeId: "ChIJexemplo0000000001" }), ["lugar:ChIJexemplo0000000001"]);
  });
});

describe("Importar empresas: normalização", () => {
  test("telefone vira E.164 do Brasil; número curto, 0800 ou estrangeiro não", () => {
    assert.equal(normalizarTelefoneBr("(31) 99876-5432"), "+5531998765432");
    assert.equal(normalizarTelefoneBr("+55 31 3333-4444"), "+553133334444");
    assert.equal(normalizarTelefoneBr("031 3333-4444"), "+553133334444");
    assert.equal(normalizarTelefoneBr("55 (11) 2345-6789"), "+551123456789");
    assert.equal(normalizarTelefoneBr("3333-4444"), undefined);
    assert.equal(normalizarTelefoneBr("0800 123 4567"), undefined);
    assert.equal(normalizarTelefoneBr("+1 415 555 0100"), undefined);
    assert.equal(normalizarTelefoneBr("(01) 99999-9999"), undefined, "DDD não começa com 0");
    assert.equal(normalizarTelefoneBr(""), undefined);
  });

  test("e-mail: minúsculo, primeiro válido da célula, inválido some", () => {
    assert.equal(normalizarEmail(" Contato@LojaBH.com.br "), "contato@lojabh.com.br");
    assert.equal(normalizarEmail("vendas@a.com.br; outro@b.com"), "vendas@a.com.br");
    assert.equal(normalizarEmail("sem-arroba.com"), undefined);
    assert.equal(normalizarEmail("=HYPERLINK(\"x\")@a.com"), undefined);
    assert.equal(normalizarEmail(`${"a".repeat(200)}@a.com`), undefined);
  });

  test("site: domínio sem www; rede social, WhatsApp e link javascript: não contam", () => {
    assert.equal(dominioDoSite("https://www.LojaBH.com.br/estoque?x=1"), "lojabh.com.br");
    assert.equal(dominioDoSite("lojabh.com.br"), "lojabh.com.br");
    assert.equal(dominioDoSite("http://autosilva.negocio.site"), "autosilva.negocio.site");
    assert.equal(dominioDoSite("https://instagram.com/lojabh"), undefined);
    assert.equal(dominioDoSite("https://wa.me/5531999999999"), undefined);
    assert.equal(dominioDoSite("https://www.facebook.com/lojabh"), undefined);
    assert.equal(dominioDoSite("javascript:alert(1)"), undefined);
    assert.equal(dominioDoSite("ftp://lojabh.com.br"), undefined);
  });

  test("fórmula de planilha não entra (=, +, -, @, tab)", () => {
    assert.equal(semFormula("=HYPERLINK(\"http://golpe\",\"clique\")"), "HYPERLINK(\"http://golpe\",\"clique\")");
    assert.equal(semFormula("+cmd|' /C calc'!A0"), "cmd|' /C calc'!A0");
    assert.equal(semFormula("-2+3"), "2+3");
    assert.equal(semFormula("@SUM(A1)"), "SUM(A1)");
    assert.equal(semFormula("\t=1"), "1");
    assert.equal(semFormula("Auto Center BH"), "Auto Center BH");
  });

  test("linha completa: textos limpos e cortados, cidade/UF do endereço do Google Maps", () => {
    const texto = [
      "Name,Phone,Email,Website,Address,Category,Rating,Reviews,Google Maps URL,Instagram",
      `"=Auto Center ""BH""",(31) 99876-5432,VENDAS@AUTOCENTER.COM.BR,https://autocenter.com.br,"Av. Amazonas, 1000 - Centro, Belo Horizonte - MG, 30180-001",Concessionária,"4,7",123,https://maps.google.com/?cid=1,@autocenterbh`,
    ].join("\n");
    const r = analisarCsv(csv(texto));
    assert.ok(!("erro" in r));
    assert.equal(r.validas.length, 1);
    const l = r.validas[0]!;
    assert.equal(l.nome, 'Auto Center "BH"');
    assert.equal(l.telefone, "+5531998765432");
    assert.equal(l.email, "vendas@autocenter.com.br");
    assert.equal(l.site, "https://autocenter.com.br");
    assert.equal(l.dominio, "autocenter.com.br");
    assert.equal(l.cidade, "Belo Horizonte");
    assert.equal(l.uf, "MG");
    assert.equal(l.nota, 4.7);
    assert.equal(l.avaliacoes, 123);
    assert.equal(l.instagram, "autocenterbh");
    assert.equal(l.mapsUrl, "https://maps.google.com/?cid=1");
    const longa = analisarCsv(csv(`Nome,Telefone,Endereço\n${"X".repeat(500)},(31) 3333-4444,${"Rua ".repeat(200)}\n`));
    assert.ok(!("erro" in longa));
    assert.equal(longa.validas[0]!.nome.length, 120);
    assert.ok(longa.validas[0]!.endereco!.length <= 300);
  });

  test("links só http(s): javascript: e data: são descartados", () => {
    const r = analisarCsv(csv("Nome,Telefone,Site,Google Maps URL,Facebook\nLoja,(31) 3333-4444,javascript:alert(1),data:text/html;base64,xx,javascript:alert(2)\n"));
    assert.ok(!("erro" in r));
    const l = r.validas[0]!;
    assert.equal(l.site, undefined);
    assert.equal(l.mapsUrl, undefined);
    assert.equal(l.facebook, undefined);
  });

  test("inválidas com o motivo: sem nome; sem telefone nem e-mail", () => {
    const r = analisarCsv(csv("Nome,Telefone,Email,Cidade\n,(31) 3333-4444,,BH\nLoja Sem Contato,123,email-ruim,BH\nLoja Boa,(31) 3333-4444,,BH\n"));
    assert.ok(!("erro" in r));
    assert.equal(r.validas.length, 1);
    assert.deepEqual(
      r.invalidas.map((i) => [i.linha, i.motivo]),
      [
        [2, "Sem nome da empresa"],
        [3, "Sem telefone nem e-mail válido"],
      ],
    );
  });
});

describe("Importar empresas: duplicadas", () => {
  test("chaves: telefone, e-mail, site e nome+cidade (sem acento, sem LTDA)", () => {
    const k = chavesDedup({ nome: "Auto Peças São José LTDA", cidade: "Belo Horizonte", telefone: "+5531998765432", email: "a@b.com", dominio: "autosj.com.br" });
    assert.deepEqual(k, ["telefone:31998765432", "email:a@b.com", "site:autosj.com.br", "nome:auto pecas sao jose|belo horizonte"]);
    assert.deepEqual(chavesDedup({ nome: "auto peças são josé", cidade: "belo horizonte" }), ["nome:auto pecas sao jose|belo horizonte"]);
    assert.deepEqual(chavesDedup({ nome: "Loja" }), [], "sem cidade, nome sozinho não identifica");
  });

  test("a mesma empresa repetida no arquivo (zonas do mapa que se sobrepõem) entra uma vez, com o motivo", () => {
    const texto = [
      "Nome,Telefone,Email,Site,Cidade",
      "Loja A,(31) 3333-4444,,,Belo Horizonte",
      "Loja A filial,+55 31 3333-4444,,,Contagem",
      "Loja B,,b@b.com,,Belo Horizonte",
      "Loja B2,,B@B.COM,,Betim",
      "Loja C,(31) 3333-5555,,https://lojac.com.br,BH",
      "Loja C nova,(31) 3333-6666,,http://www.lojac.com.br/x,BH",
      "Loja D,(31) 3333-7777,,,Belo Horizonte",
      "LOJA D,(31) 3333-8888,,,belo horizonte",
    ].join("\n");
    const r = analisarCsv(csv(texto));
    assert.ok(!("erro" in r));
    assert.deepEqual(r.validas.map((l) => l.nome), ["Loja A", "Loja B", "Loja C", "Loja D"]);
    assert.deepEqual(
      r.duplicadas.map((d) => [d.linha, d.motivo]),
      [
        [3, "Repetida no arquivo: mesmo telefone"],
        [5, "Repetida no arquivo: mesmo e-mail"],
        [7, "Repetida no arquivo: mesmo site"],
        [9, "Repetida no arquivo: mesmo nome e cidade"],
      ],
    );
  });

  test("relatório em CSV neutraliza fórmulas e usa ;", () => {
    const out = csvRelatorio([{ linha: 2, nome: "=1+1", motivo: "Sem telefone nem e-mail válido" }, { linha: 3, nome: 'Loja "X"; ok', motivo: "@x" }]);
    const linhas = out.trim().split("\n");
    assert.equal(linhas[0], "Linha;Empresa;Motivo");
    assert.equal(linhas[1], "2;'=1+1;Sem telefone nem e-mail válido");
    assert.equal(linhas[2], `3;"Loja ""X""; ok";'@x`);
  });
});

describe("Importar empresas: imobiliária x corretor pela categoria do Google", () => {
  test("arquivo de imóveis: \"Corretor de imóveis\" vira corretor; \"Imobiliária\" fica imobiliária", () => {
    assert.equal(segmentoDaLinha("property", "Corretor de imóveis"), "broker");
    assert.equal(segmentoDaLinha("property", "Real estate agent"), "broker");
    assert.equal(segmentoDaLinha("broker", "Imobiliária"), "property");
    assert.equal(segmentoDaLinha("property", "Real estate agency"), "property");
    assert.equal(segmentoDaLinha("property", "Imobiliária e corretor de imóveis"), "property", "os dois: imobiliária");
    assert.equal(segmentoDaLinha("property", undefined), "property");
    assert.equal(segmentoDaLinha("broker", ""), "broker");
  });
  test("arquivo de lojas ou \"outro\": a categoria não muda o tipo escolhido", () => {
    assert.equal(segmentoDaLinha("vehicle", "Corretor de imóveis"), "vehicle");
    assert.equal(segmentoDaLinha("other", "Imobiliária"), "other");
  });
});
