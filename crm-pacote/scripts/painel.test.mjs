// Testes do painel do CRM (relatorios/painel.html). Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { agenda, esc, visaoGeral } from "./painel-dados.mjs";
import { renderPainel } from "./painel-html.mjs";

const hoje = new Date("2026-11-15T12:00:00Z");

const empresa = (extra) => ({
  id: "p",
  nome: "Empresa",
  tipo: "Loja de veículos",
  segmento: "vehicle",
  cnpj: "11222333000181",
  cadastroNoSiteEm: "2026-08-01",
  periodoGratisAte: "2026-10-30",
  pais: "Brasil",
  perfil: {},
  responsavel: { nome: "Dono", email: "dono@teste.local" },
  uso: { visualizacoes: 0 },
  chamados: { total: 0, abertos: 0 },
  socios: [],
  etapa: { id: "cadastrou", nome: "Cadastrou (período grátis)" },
  pagamentos: { quantidade: 0, totalPago: 0 },
  anuncios: { noAr: 0, total: 0 },
  leads: { total: 0, ultimos30Dias: 0, vendidos: 0, paradosMais3Dias: 0 },
  ultimasAnotacoes: [],
  ...extra,
});
const prospect = (extra) => ({ cardId: "c", nome: "Prospect", segmento: "vehicle", perfil: {}, etapa: { id: "a_abordar", nome: "A abordar" }, criadoEm: "2026-10-01T00:00:00Z", ...extra });

const feed = {
  geradoEm: hoje.toISOString(),
  empresas: [
    empresa({
      id: "a",
      nome: "Loja A",
      cardId: "ca",
      vendedor: "Ana",
      etapa: { id: "assinante", nome: "Assinante" },
      plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-11-02T00:00:00Z", periodoAte: "2026-12-02" },
      pagamentos: { quantidade: 1, totalPago: 149, primeiro: "2026-11-02" },
      origemMarketing: { canal: "google_ads" },
      nps: { nota: 10, data: "2026-11-05T00:00:00Z", classificacao: "promotor" },
      abertaEm: "2015-11-20",
      socios: [{ nome: "Maria", aniversario: "18/11" }],
    }),
    empresa({
      id: "b",
      nome: "Imob B",
      cardId: "cb",
      segmento: "property",
      etapa: { id: "assinante", nome: "Assinante" },
      plano: { nome: "Pack 35", valorMensal: 389, status: "ativa", mudouEm: "2026-06-01T00:00:00Z", periodoAte: "2026-12-01" },
      nps: { nota: 3, data: "2026-11-03T00:00:00Z", classificacao: "detrator", comentario: "Poucos leads" },
      uso: { visualizacoes: 10, diasSemAcesso: 40 },
      chamados: { total: 2, abertos: 1, abertoDesde: "2026-11-10T00:00:00Z", tempoMedioResolucaoHoras: 10 },
    }),
    empresa({
      id: "c",
      nome: "Loja C",
      vendedor: "Ana",
      etapa: { id: "cancelou", nome: "Cancelou" },
      plano: { nome: "Inicial", valorMensal: 149, status: "cancelada", mudouEm: "2026-11-08T00:00:00Z", periodoAte: "2026-11-08" },
      motivoPerda: { categoria: "Preço" },
      chamados: { total: 1, abertos: 0, tempoMedioResolucaoHoras: 30 },
    }),
    empresa({ id: "d", nome: "Loja D", etapa: { id: "publicou", nome: "Publicou anúncio" }, plano: { nome: "Inicial", valorMensal: 149, status: "em_atraso", mudouEm: "2026-11-01T00:00:00Z", periodoAte: "2026-11-30" } }),
  ],
  prospeccao: [
    prospect({ cardId: "p1", nome: "Loja X", vendedor: "Ana", proximoContato: "2026-11-17T13:00:00Z", proximoContatoTipo: "reuniao" }),
    prospect({ cardId: "p2", nome: "Loja Y", vendedor: "Bruno", etapa: { id: "proposta", nome: "Proposta enviada" } }),
    prospect({ cardId: "p3", nome: "Imob Z", segmento: "property", etapa: { id: "perdida", nome: "Perdida" }, motivoPerda: { categoria: "Preço" } }),
  ],
};

test("visão geral: números, funil, NPS, motivos, vendedores e atenção (mesma conta que o site usava)", () => {
  const v = visaoGeral(feed, hoje);
  assert.equal(v.numeros.empresas, 4);
  assert.equal(v.numeros.assinantes, 3, "ativa ou em atraso");
  assert.equal(v.numeros.mrr, 149 + 389 + 149);
  assert.equal(v.numeros.novasAssinaturasMes, 1);
  assert.equal(v.numeros.cancelamentosMes, 1);
  assert.equal(v.numeros.emRisco, 1);
  assert.equal(v.numeros.tempoMedioResolucaoHoras, 20);
  assert.deepEqual(v.numeros.nps, { score: 0, respostas: 2, promotores: 1, neutros: 0, detratores: 1 });
  const qty = Object.fromEntries(v.funil.map((f) => [f.etapa, f.quantidade]));
  assert.deepEqual(qty, { a_abordar: 1, em_contato: 0, interessada: 0, proposta: 1, cadastrou: 0, publicou: 1, assinante: 2, perdida: 1, cancelou: 1 });
  assert.deepEqual(v.motivos, [{ categoria: "Preço", quantidade: 2 }]);
  assert.deepEqual(v.vendedores.find((x) => x.nome === "Ana"), { nome: "Ana", cards: 3, cadastradas: 2, assinantes: 1, mrr: 149 });
  assert.equal(v.atencao[0].nivel, "urgente");
  assert.ok(v.atencao.some((a) => a.empresa === "Loja D" && /pagamento atrasado/.test(a.motivo)));
  assert.ok(v.atencao.some((a) => a.empresa === "Imob B" && /40 dias/.test(a.motivo)));
});

test("visão geral por segmento", () => {
  const v = visaoGeral(feed, hoje, "property");
  assert.equal(v.numeros.empresas, 1);
  assert.equal(v.numeros.mrr, 389);
});

test("agenda dos próximos dias: aniversários, reuniões e datas do setor, em ordem", () => {
  const calendario = [{ data: "20/11", nome: "Dia da Consciência Negra", publico: "todos", ideia: "x" }];
  const itens = agenda(feed, {}, calendario, hoje, 30);
  const tipos = itens.map((i) => `${i.data}:${i.tipo}`);
  assert.deepEqual(tipos.slice(0, 4), ["2026-11-17:Reunião", "2026-11-18:Aniversário de sócio", "2026-11-20:Aniversário da empresa", "2026-11-20:Data do setor"]);
  assert.ok(!itens.some((i) => i.data < "2026-11-15"), "nada do passado");
});

test("texto que vem do site é escapado (nome de empresa não vira código na página)", () => {
  assert.equal(esc(`<img src=x onerror="alert(1)">&'`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
  const malicioso = { ...feed, empresas: [empresa({ id: "z", nome: `<script>alert("x")</script>`, ultimasAnotacoes: [{ data: "2026-11-01", tipo: "note", texto: "<b>oi</b>" }] })] };
  const html = renderPainel({ feed: malicioso, receitas: undefined, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  assert.ok(!html.includes(`<script>alert("x")</script>`));
  assert.ok(!html.includes("<b>oi</b>"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
});

test("painel tem todas as telas e funciona sem receitas baixadas", () => {
  const html = renderPainel({ feed, receitas: undefined, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  for (const aba of ["Visão geral", "Receitas", "Empresas", "Prospecção", "Avisos", "Ordens", "Agenda"]) assert.ok(html.includes(`>${aba}<`), aba);
  assert.ok(html.includes("Ainda sem receitas baixadas"));
  assert.ok(!/<script[^>]+src=/.test(html), "nada carregado da internet");
});

test("botões de ação em cada empresa e card: ligar, WhatsApp, e-mail, reunião, registrar e site", () => {
  const f = { ...feed, empresas: [empresa({ id: "a1", nome: "Loja A", cardId: "ca1", pagina: "/lojas/loja-a", responsavel: { nome: "Maria Souza", email: "maria@loja.com", telefone: "31988887777" } })] };
  const html = renderPainel({ feed: f, receitas: undefined, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  for (const acao of ["ligar", "whatsapp", "email", "reuniao", "registrar", "site"]) assert.ok(html.includes(`data-acao="${acao}"`), acao);
  assert.ok(html.includes('data-telefone="31988887777"'));
  assert.ok(html.includes('data-card="ca1"'));
  // card de prospecção também tem os botões
  assert.ok(html.includes('data-card="p1"'));
});

test("quem pediu para não ser contatado e quem não tem telefone ficam com os botões desligados", () => {
  const f = { ...feed, empresas: [empresa({ id: "n1", nome: "Não Contatar", responsavel: { nome: "X", email: "x@x.com", telefone: "31988887777" } }), empresa({ id: "s1", nome: "Sem Fone", responsavel: { nome: "Y", email: "" } })] };
  const html = renderPainel({ feed: f, receitas: undefined, ordens: [], avisos: [], marcacoes: { n1: { naoContatar: true } }, jornada: [], calendario: [], hoje });
  const bloco = (id) => html.slice(html.indexOf(`id="empresa-${id}"`), html.indexOf("</details>", html.indexOf(`id="empresa-${id}"`)));
  assert.match(bloco("n1"), /data-acao="ligar"[^>]*disabled/);
  assert.match(bloco("n1"), /data-acao="whatsapp"[^>]*disabled/);
  assert.match(bloco("n1"), /Pediu para não ser contatado/);
  assert.match(bloco("s1"), /data-acao="ligar"[^>]*disabled[^>]*title="Sem telefone"/);
  assert.match(bloco("s1"), /data-acao="email"[^>]*disabled[^>]*title="Sem e-mail"/);
});

test("dados vindos do site são escapados também nos atributos dos botões", () => {
  const f = { ...feed, empresas: [empresa({ id: "z", nome: `Loja "><img src=x onerror=alert(1)>`, responsavel: { nome: "<b>", email: "a@a.com", telefone: "31988887777" } })] };
  const html = renderPainel({ feed: f, receitas: undefined, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"));
});

test("marca: logo embutida, fontes do Google só como fonte, nenhum programa de fora", () => {
  const html = renderPainel({ feed, receitas: undefined, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  assert.ok(html.includes('src="data:image/png;base64,'));
  assert.match(html, /font-src https:\/\/fonts\.gstatic\.com/);
  assert.match(html, /style-src 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(html, /script-src 'unsafe-inline';/);
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(html.includes("#0E2F4A") && html.includes("#F18E29") && html.includes("#0B1C2C"));
});

test("abas Pessoas físicas e Configurações; PF mostra a receita dos planos de anúncio", () => {
  const receitas = { geradoEm: hoje.toISOString(), consolidado: { porMes: [], total12m: 0, esteMes: 0, mesPassado: 0, acompanhamento12m: { lojas: 0, financiamentos: 0 } }, planos: { porMes: [{ mes: "2026-10", assinaturas: 100, anuncios: 59.8, total: 159.8 }, { mes: "2026-11", assinaturas: 100, anuncios: 29.9, total: 129.9 }], total12m: 289.7, esteMes: 129.9, mesPassado: 159.8, estornos12m: 0, mrr: 100, assinantes: 1 }, financiamentos: { porMes: [], negocios12m: 0, valorFinanciado12m: 0, comissao12m: 0, comissaoRecebida: 0, comissaoAReceber: 0, leadsAbertos: 0 }, afiliados: { lojas: { porMes: [], porLoja: [], total12m: 0, cliques30d: 0 }, programa: { ativos: 0, pendentes: 0, indicados: 0, cliques30d: 0, receitaGerada12m: 0, comissoes: { aConfirmar: 0, disponivel: 0, paga: 0, cancelada: 0 }, ranking: [] } } };
  const pf = [{ id: "u1", nome: "João PF", telefone: "31977776666", email: "joao@x.com", cidade: "BH", segmento: "vehicle" }];
  const html = renderPainel({ feed: { ...feed, pessoasFisicas: pf }, receitas, ordens: [], avisos: [], marcacoes: {}, jornada: [], calendario: [], hoje });
  for (const aba of ["Pessoas físicas", "Configurações"]) assert.ok(html.includes(`>${aba}<`), aba);
  assert.ok(html.includes("R$ 89,70"), "planos de anúncio em 12 meses");
  assert.ok(!/cashback/i.test(html), "financiamento sem cashback");
  const pfBloco = html.slice(html.indexOf('id="pf"'), html.indexOf('<section class="tab"', html.indexOf('id="pf"')));
  assert.ok(pfBloco.includes("João PF"));
  assert.ok(pfBloco.includes('data-acao="whatsapp"'));
  assert.ok(!pfBloco.includes('data-acao="registrar"'), "PF não tem ficha no /comercial");
});
