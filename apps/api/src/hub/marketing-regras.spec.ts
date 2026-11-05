import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { categoriaAutomatica } from "./financeiro-regras";
import { CANAIS_AUTOMATICOS, calendarioMes, custoPorCadastro, proximoStatus, publicacaoAutomatica, resumoGastos } from "./marketing-regras";

// Marketing do Hub: regras puras (sem banco nem rede).

describe("Aprovação do conteúdo", () => {
  test("enviado → aprovado ou ajuste; ajuste volta para aprovação como nova revisão", () => {
    assert.equal(proximoStatus("em_aprovacao", "aprovar"), "aprovado");
    assert.equal(proximoStatus("em_aprovacao", "ajuste"), "ajuste");
    assert.equal(proximoStatus("ajuste", "revisar"), "em_aprovacao");
    assert.equal(proximoStatus("em_aprovacao", "revisar"), "em_aprovacao");
    assert.equal(proximoStatus("aprovado", "publicado"), "publicado");
    assert.equal(proximoStatus("erro", "aprovar"), "aprovado", "deu erro ao publicar: dá para aprovar de novo");
    assert.equal(proximoStatus("aprovado", "cancelar"), "cancelado");
  });
  test("transição inválida é recusada (nada publica sem aprovação)", () => {
    assert.equal(proximoStatus("em_aprovacao", "publicado"), null);
    assert.equal(proximoStatus("ajuste", "aprovar"), null, "precisa da revisão antes");
    assert.equal(proximoStatus("publicado", "aprovar"), null);
    assert.equal(proximoStatus("cancelado", "revisar"), null);
  });
});

describe("Quem publica sozinho", () => {
  test("Instagram e Facebook com imagem ou carrossel: o Hub publica; o resto fica para publicar à mão", () => {
    assert.deepEqual([...CANAIS_AUTOMATICOS].sort(), ["facebook", "instagram"]);
    assert.deepEqual(publicacaoAutomatica({ tipo: "post", redes: ["instagram", "facebook", "tiktok"], midias: ["a.jpg"] }), { automatico: ["instagram", "facebook"], manual: ["tiktok"] });
    assert.deepEqual(publicacaoAutomatica({ tipo: "carrossel", redes: ["instagram"], midias: ["a.jpg", "b.jpg"] }), { automatico: ["instagram"], manual: [] });
    assert.deepEqual(publicacaoAutomatica({ tipo: "reels", redes: ["instagram"], midias: ["v.mp4"] }), { automatico: [], manual: ["instagram"] }, "vídeo: à mão por enquanto");
    assert.deepEqual(publicacaoAutomatica({ tipo: "post", redes: ["instagram"], midias: [] }), { automatico: [], manual: ["instagram"] }, "sem imagem não dá para publicar");
    assert.deepEqual(publicacaoAutomatica({ tipo: "email", redes: ["email"], midias: [] }), { automatico: [], manual: ["email"] });
  });
});

describe("Gastos com anúncios", () => {
  const linhas = [
    { plataforma: "meta_ads", campanha: "Lojas BH", data: "2026-11-02", gasto: 120.5, cliques: 300, impressoes: 10000, conversoes: 6 },
    { plataforma: "meta_ads", campanha: "Imobiliárias", data: "2026-11-03", gasto: 79.5, cliques: 100, impressoes: 5000, conversoes: 4 },
    { plataforma: "google_ads", campanha: "Busca", data: "2026-11-03", gasto: 300, cliques: 150, impressoes: 2000, conversoes: 0 },
  ];
  test("por plataforma: gasto, orçamento usado, CPC e custo por conversão", () => {
    const r = resumoGastos(linhas, { meta_ads: 400, google_ads: 250, tiktok_ads: 100 });
    const meta = r.porPlataforma.find((p) => p.plataforma === "meta_ads")!;
    assert.equal(meta.gasto, 200);
    assert.equal(meta.orcamento, 400);
    assert.equal(meta.usadoPct, 50);
    assert.equal(meta.cpc, 0.5);
    assert.equal(meta.custoPorConversao, 20);
    const google = r.porPlataforma.find((p) => p.plataforma === "google_ads")!;
    assert.equal(google.usadoPct, 120);
    assert.equal(google.estourou, true);
    assert.equal(google.custoPorConversao, undefined, "sem conversão: não divide por zero");
    assert.equal(r.porPlataforma.find((p) => p.plataforma === "tiktok_ads")!.gasto, 0, "plataforma com orçamento e sem gasto aparece");
    assert.equal(r.total.gasto, 500);
    assert.equal(r.total.orcamento, 750);
    assert.deepEqual(r.porCampanha.map((c) => c.campanha), ["Busca", "Lojas BH", "Imobiliárias"], "maior gasto primeiro");
  });
  test("custo por cadastro e por assinatura no período", () => {
    assert.deepEqual(custoPorCadastro(500, { cadastros: 10, assinaturas: 2 }), { porCadastro: 50, porAssinatura: 250 });
    assert.deepEqual(custoPorCadastro(500, { cadastros: 0, assinaturas: 0 }), { porCadastro: undefined, porAssinatura: undefined });
  });
});

describe("Calendário", () => {
  test("mês em semanas (segunda a domingo) com os conteúdos de cada dia", () => {
    const c = calendarioMes("2026-11", [
      { id: "a", dataPlanejada: "2026-11-05T12:00:00Z" },
      { id: "b", dataPlanejada: "2026-11-05T21:00:00Z" },
      { id: "c", dataPlanejada: "2026-12-01T12:00:00Z" },
      { id: "d" },
    ]);
    assert.equal(c.semanas[0][0].dia, "2026-10-26", "começa na segunda antes do dia 1");
    assert.equal(c.semanas.at(-1)!.at(-1)!.dia, "2026-12-06");
    const dia5 = c.semanas.flat().find((d) => d.dia === "2026-11-05")!;
    assert.deepEqual(dia5.itens.map((i) => i.id), ["a", "b"]);
    assert.equal(dia5.doMes, true);
    assert.deepEqual(c.semData.map((i) => i.id), ["d"]);
  });
  test("horário de Brasília: post às 23h do dia 5 (02h UTC do dia 6) fica no dia 5", () => {
    const c = calendarioMes("2026-11", [{ id: "x", dataPlanejada: "2026-11-06T02:00:00Z" }]);
    assert.deepEqual(c.semanas.flat().find((d) => d.dia === "2026-11-05")!.itens.map((i) => i.id), ["x"]);
  });
});

describe("Categoria automática do extrato (financeiro)", () => {
  test("anúncios do Meta, Google e TikTok viram Marketing; o resto fica para classificar", () => {
    assert.equal(categoriaAutomatica("FACEBK *ADS 123", -50), "F03");
    assert.equal(categoriaAutomatica("GOOGLE*ADS1234", -80), "F03");
    assert.equal(categoriaAutomatica("TIKTOK ADS", -10), "F03");
    assert.equal(categoriaAutomatica("PIX ENVIADO LOCAWEB", -90), "C02");
    assert.equal(categoriaAutomatica("DAS SIMPLES NACIONAL", -300), "D01");
    assert.equal(categoriaAutomatica("TARIFA PACOTE", -15), "N01");
    assert.equal(categoriaAutomatica("SUPERMERCADO", -15), "F06");
    assert.equal(categoriaAutomatica("RENDIMENTO APLICACAO", 3), "N01");
    assert.equal(categoriaAutomatica("PIX RECEBIDO", 100), "R03");
  });
});
