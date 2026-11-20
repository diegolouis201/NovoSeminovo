import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FIPE_MARGEM_MEDIA_PCT } from "@novoseminovo/shared-types";
import {
  PESOS_QUALIDADE,
  analisarCarros,
  analisarImoveis,
  chaveDoDia,
  formatarDuracao,
  funilDosLeads,
  inicioDoDia,
  leadsPorDia,
  notaDaLoja,
  situacaoDoPlano,
  tempoDeResposta,
  ultimosDias,
} from "./dashboard";

// Funções puras da tela inicial do painel do parceiro (/parceiro).

describe("Painel do parceiro: dias no fuso de São Paulo", () => {
  test("lead às 01h UTC conta no dia anterior em São Paulo", () => {
    assert.equal(chaveDoDia(new Date("2026-11-20T01:30:00Z")), "2026-11-19");
    assert.equal(chaveDoDia(new Date("2026-11-20T03:00:00Z")), "2026-11-20");
  });

  test("últimos 15 dias terminam hoje e começam 14 dias atrás", () => {
    const dias = ultimosDias(new Date("2026-11-20T12:00:00Z"), 15);
    assert.equal(dias.length, 15);
    assert.equal(dias[0], "2026-11-06");
    assert.equal(dias[14], "2026-11-20");
  });

  test("início do dia é a meia-noite de São Paulo (03h UTC)", () => {
    assert.equal(inicioDoDia("2026-11-06").toISOString(), "2026-11-06T03:00:00.000Z");
  });

  test("agrupa por dia e preenche os dias sem lead com zero", () => {
    const agora = new Date("2026-11-20T15:00:00Z");
    const porDia = leadsPorDia(
      [
        new Date("2026-11-20T10:00:00Z"),
        new Date("2026-11-20T02:59:00Z"), // 23h59 do dia 19 em SP
        new Date("2026-11-19T12:00:00Z"),
        new Date("2026-11-06T03:00:00Z"), // primeiro minuto da janela
        new Date("2026-11-06T02:59:00Z"), // fora da janela
      ],
      agora,
      15,
    );
    assert.equal(porDia.length, 15);
    assert.deepEqual(porDia.at(-1), { data: "2026-11-20", total: 1 });
    assert.deepEqual(porDia.at(-2), { data: "2026-11-19", total: 2 });
    assert.deepEqual(porDia[0], { data: "2026-11-06", total: 1 });
    assert.equal(porDia.reduce((s, d) => s + d.total, 0), 4);
  });
});

describe("Painel do parceiro: funil pela etapa atual", () => {
  test("etapas do quadro de leads na ordem, com perdidos à parte", () => {
    const funil = funilDosLeads({ new: 5, contacted: 4, visit_scheduled: 3, negotiating: 2, won: 1, lost: 6 }, true);
    assert.equal(funil.totalLeads, 21);
    assert.deepEqual(
      funil.etapas.map((e) => [e.status, e.label, e.total]),
      [
        ["contacted", "Em contato", 4],
        ["visit_scheduled", "Visita / test-drive", 3],
        ["negotiating", "Proposta", 2],
        ["won", "Vendido", 1],
      ],
    );
    assert.equal(funil.perdidos, 6);
  });

  test("imóvel usa 'Visita agendada' e etapas sem lead aparecem com zero", () => {
    const funil = funilDosLeads({ new: 2 }, false);
    assert.equal(funil.totalLeads, 2);
    assert.equal(funil.etapas[1]!.label, "Visita agendada");
    assert.ok(funil.etapas.every((e) => e.total === 0));
  });
});

describe("Painel do parceiro: tempo de resposta no chat", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 12, min));

  test("da primeira mensagem do comprador até a primeira resposta da loja", () => {
    const r = tempoDeResposta([
      { compradorId: "c1", mensagens: [{ autorId: "c1", em: t(0) }, { autorId: "c1", em: t(2) }, { autorId: "loja", em: t(10) }, { autorId: "loja", em: t(50) }] },
      { compradorId: "c2", mensagens: [{ autorId: "c2", em: t(0) }, { autorId: "vendedor", em: t(30) }] },
    ]);
    assert.deepEqual(r && { media: r.mediaMinutos, respondidas: r.respondidas, conversas: r.conversas }, { media: 20, respondidas: 2, conversas: 2 });
    assert.equal(r?.label, "20 min");
  });

  test("conversa sem resposta conta no total mas não na média", () => {
    const r = tempoDeResposta([
      { compradorId: "c1", mensagens: [{ autorId: "c1", em: t(0) }, { autorId: "loja", em: t(6) }] },
      { compradorId: "c2", mensagens: [{ autorId: "c2", em: t(0) }] },
    ]);
    assert.equal(r?.mediaMinutos, 6);
    assert.equal(r?.respondidas, 1);
    assert.equal(r?.conversas, 2);
  });

  test("mensagem da loja antes do comprador falar não é resposta", () => {
    const r = tempoDeResposta([{ compradorId: "c1", mensagens: [{ autorId: "loja", em: t(0) }, { autorId: "c1", em: t(5) }] }]);
    assert.equal(r, undefined);
  });

  test("sem nenhuma conversa respondida não estima nada", () => {
    assert.equal(tempoDeResposta([]), undefined);
    assert.equal(tempoDeResposta([{ compradorId: "c1", mensagens: [{ autorId: "c1", em: t(0) }] }]), undefined);
  });

  test("duração legível", () => {
    assert.equal(formatarDuracao(0.4), "menos de 1 min");
    assert.equal(formatarDuracao(18), "18 min");
    assert.equal(formatarDuracao(125), "2 h 5 min");
    assert.equal(formatarDuracao(60 * 27), "1 dia e 3 h");
  });
});

const agora = new Date("2026-11-20T12:00:00Z");
const antigo = new Date("2026-11-01T12:00:00Z");
const novo = new Date("2026-11-18T12:00:00Z");
const base = { preco: 100_000, fotos: 10, descricao: 400, temVideo: true, visualizacoes: 100, noArDesde: antigo };

describe("Painel do parceiro: análise de carros", () => {
  test("acima/abaixo da FIPE usam a mesma margem da página do anúncio", () => {
    const margem = FIPE_MARGEM_MEDIA_PCT / 100;
    const analise = analisarCarros(
      [
        { ...base, fipe: 100_000 }, // na média
        { ...base, preco: 100_000 * (1 + margem) + 1_000, fipe: 100_000 }, // acima
        { ...base, preco: 100_000 * (1 - margem) - 1_000, fipe: 100_000 }, // abaixo
        { ...base, preco: 100_000 * (1 + margem), fipe: 100_000 }, // no limite: média
        { ...base, fipe: undefined }, // sem FIPE: fora da conta
      ],
      agora,
    );
    const item = (chave: string) => analise.itens.find((i) => i.chave === chave)?.total;
    assert.equal(analise.segmento, "vehicle");
    assert.equal(analise.anunciosAtivos, 5);
    assert.equal(item("acima_fipe"), 1);
    assert.equal(item("abaixo_fipe"), 1);
    assert.match(analise.regra, new RegExp(`${FIPE_MARGEM_MEDIA_PCT}%`));
  });

  test("pouca procura: menos de 20 visualizações e no ar há mais de 7 dias", () => {
    const analise = analisarCarros(
      [
        { ...base, visualizacoes: 5, noArDesde: antigo }, // conta
        { ...base, visualizacoes: 5, noArDesde: novo }, // novo demais
        { ...base, visualizacoes: 20, noArDesde: antigo }, // 20 já não é pouca
      ],
      agora,
    );
    assert.equal(analise.itens.find((i) => i.chave === "pouca_procura")?.total, 1);
  });

  test("menos de 8 fotos", () => {
    const analise = analisarCarros([{ ...base, fotos: 7 }, { ...base, fotos: 8 }, { ...base, fotos: 0 }], agora);
    assert.equal(analise.itens.find((i) => i.chave === "poucas_fotos")?.total, 2);
    assert.deepEqual(analise.itens.map((i) => i.chave), ["acima_fipe", "abaixo_fipe", "pouca_procura", "poucas_fotos"]);
  });
});

describe("Painel do parceiro: análise de imóveis", () => {
  test("sem vídeo, poucas fotos, descrição curta e pouca procura; nada de preço por m²", () => {
    const analise = analisarImoveis(
      [
        { ...base, temVideo: false, fotos: 3, descricao: 299, visualizacoes: 1 },
        { ...base, descricao: 300 },
        { ...base, temVideo: false, noArDesde: novo, visualizacoes: 0 },
      ],
      agora,
    );
    const item = (chave: string) => analise.itens.find((i) => i.chave === chave)?.total;
    assert.equal(analise.segmento, "property");
    assert.deepEqual(analise.itens.map((i) => i.chave), ["sem_video", "poucas_fotos", "descricao_curta", "pouca_procura"]);
    assert.equal(item("sem_video"), 2);
    assert.equal(item("poucas_fotos"), 1);
    assert.equal(item("descricao_curta"), 1);
    assert.equal(item("pouca_procura"), 1);
    assert.doesNotMatch(JSON.stringify(analise), /m²|metro/i);
  });
});

describe("Painel do parceiro: qualidade da loja (0 a 100)", () => {
  const perfeita = {
    verificada: true,
    temLogo: true,
    anunciosAtivos: 10,
    comFotosSuficientes: 10,
    comDescricaoCompleta: 10,
    avaliacoes: 3,
    avaliacaoMedia: 5,
    leadsParaResponder: 4,
    leadsRespondidos: 4,
  };

  test("pesos fixos somam 100", () => {
    assert.equal(Object.values(PESOS_QUALIDADE).reduce((s, p) => s + p, 0), 100);
  });

  test("loja completa tira 100 e todos os itens ficam ✓", () => {
    const q = notaDaLoja(perfeita);
    assert.equal(q.nota, 100);
    assert.ok(q.itens.every((i) => i.ok));
    assert.deepEqual(q.itens.map((i) => i.chave), ["verificada", "logo", "fotos", "descricao", "avaliacao", "respostas"]);
  });

  test("loja vazia tira 0", () => {
    const q = notaDaLoja({ ...perfeita, verificada: false, temLogo: false, anunciosAtivos: 0, comFotosSuficientes: 0, comDescricaoCompleta: 0, avaliacoes: 0, avaliacaoMedia: undefined, leadsParaResponder: 0, leadsRespondidos: 0 });
    assert.equal(q.nota, 0);
    assert.ok(q.itens.every((i) => !i.ok));
  });

  test("sem avaliações e sem leads esses itens saem e a nota é proporcional ao resto", () => {
    const q = notaDaLoja({ ...perfeita, avaliacoes: 0, avaliacaoMedia: undefined, leadsParaResponder: 0, leadsRespondidos: 0, temLogo: false });
    assert.deepEqual(q.itens.map((i) => i.chave), ["verificada", "logo", "fotos", "descricao"]);
    const max = PESOS_QUALIDADE.verificada + PESOS_QUALIDADE.logo + PESOS_QUALIDADE.fotos + PESOS_QUALIDADE.descricao;
    assert.equal(q.nota, Math.round(((max - PESOS_QUALIDADE.logo) / max) * 100));
  });

  test("percentual de anúncios conta proporcionalmente e marca ! abaixo de 80%", () => {
    const q = notaDaLoja({ ...perfeita, comFotosSuficientes: 5 });
    const fotos = q.itens.find((i) => i.chave === "fotos")!;
    assert.equal(fotos.pontos, PESOS_QUALIDADE.fotos / 2);
    assert.equal(fotos.ok, false);
    assert.match(fotos.label, /50%/);
    assert.equal(q.nota, Math.round(100 - PESOS_QUALIDADE.fotos / 2));
  });

  test("avaliação média vira pontos na proporção de 5 estrelas", () => {
    const q = notaDaLoja({ ...perfeita, avaliacaoMedia: 4 });
    const item = q.itens.find((i) => i.chave === "avaliacao")!;
    assert.equal(item.pontos, PESOS_QUALIDADE.avaliacao * 0.8);
    assert.equal(item.ok, true);
    assert.match(item.label, /4,0/);
  });
});

describe("Painel do parceiro: situação do plano", () => {
  const criada = new Date("2026-11-01T12:00:00Z");

  test("período grátis sem assinatura", () => {
    assert.equal(situacaoDoPlano({ precisaPlano: true, trialAte: new Date("2027-01-30T12:00:00Z"), assinatura: undefined, agora }), "trial");
  });
  test("grátis acabou e não assinou", () => {
    assert.equal(situacaoDoPlano({ precisaPlano: true, trialAte: criada, assinatura: undefined, agora }), "sem_plano");
  });
  test("assinatura ativa vale mesmo no período grátis", () => {
    assert.equal(situacaoDoPlano({ precisaPlano: true, trialAte: new Date("2027-01-30T12:00:00Z"), assinatura: { status: "active" }, agora }), "em_dia");
  });
  test("pagamento atrasado", () => {
    assert.equal(situacaoDoPlano({ precisaPlano: true, trialAte: criada, assinatura: { status: "past_due" }, agora }), "atrasado");
  });
  test("oficina não precisa de plano", () => {
    assert.equal(situacaoDoPlano({ precisaPlano: false, trialAte: criada, assinatura: undefined, agora }), "nao_precisa");
  });
});
