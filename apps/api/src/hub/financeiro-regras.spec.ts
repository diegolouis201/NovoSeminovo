import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  type Movimento,
  PLANO_DE_CONTAS,
  dre,
  extrato,
  fluxoCaixa,
  gerarParcelas,
  lerOfx,
  lerPlanilha,
  pontoEquilibrio,
  pontosAtencao,
  saldos,
} from "./financeiro-regras";

// Financeiro do Hub: regras puras (sem banco). Faturamento = planos (Stripe);
// financiamentos e afiliados ficam fora do DRE (só visualização no CRM).

const mov = (over: Partial<Movimento>): Movimento => ({
  id: Math.random().toString(36).slice(2),
  tipo: "pagar",
  descricao: "x",
  categoria: "F02",
  competencia: "2026-10-10",
  vencimento: "2026-10-10",
  valor: 100,
  status: "pago",
  pagoEm: "2026-10-10",
  contaId: "inter",
  origem: "manual",
  ...over,
});

describe("Plano de contas", () => {
  test("tem receitas do Stripe, impostos, custos, despesas fixas, retiradas e não operacional", () => {
    const codigos = PLANO_DE_CONTAS.map((c) => c.codigo);
    for (const c of ["R01", "R02", "D01", "C01", "F01", "S01", "N01"]) assert.ok(codigos.includes(c), c);
    assert.equal(new Set(codigos).size, codigos.length, "sem código repetido");
    assert.ok(!PLANO_DE_CONTAS.some((c) => /financiamento|afiliad/i.test(c.nome)), "financiamentos e afiliados não entram no DRE");
  });
});

describe("DRE", () => {
  const base = [
    mov({ tipo: "receber", categoria: "R01", valor: 1000, competencia: "2026-10-05", contaId: "stripe", origem: "stripe" }),
    mov({ tipo: "receber", categoria: "R02", valor: 200, competencia: "2026-10-20", contaId: "stripe", origem: "stripe" }),
    mov({ categoria: "D01", valor: 72, competencia: "2026-10-31" }),
    mov({ categoria: "C01", valor: 48, competencia: "2026-10-31" }),
    mov({ categoria: "F02", valor: 300, competencia: "2026-10-15" }),
    mov({ categoria: "F03", valor: 400, competencia: "2026-10-15", status: "aberto", pagoEm: undefined }),
    mov({ categoria: "S01", valor: 150, competencia: "2026-10-28" }),
    mov({ tipo: "receber", categoria: "N01", valor: 10, competencia: "2026-10-30" }),
    mov({ categoria: "F02", valor: 999, competencia: "2026-10-15", status: "cancelado" }),
    mov({ tipo: "receber", categoria: "R01", valor: 500, competencia: "2026-09-05", pagoEm: "2026-10-02" }),
  ];

  test("competência: mês a mês, com margem, EBITDA, lucro e retiradas à parte; cancelado não entra", () => {
    const out = dre(base, 2026, "competencia");
    const out10 = out.meses.find((m) => m.mes === "2026-10")!;
    assert.equal(out10.receitaBruta, 1200);
    assert.equal(out10.deducoes, 72);
    assert.equal(out10.receitaLiquida, 1128);
    assert.equal(out10.custos, 48);
    assert.equal(out10.margemContribuicao, 1080);
    assert.equal(out10.despesasFixas, 700, "despesa em aberto também é do mês (competência)");
    assert.equal(out10.ebitda, 380);
    assert.equal(out10.naoOperacional, 10);
    assert.equal(out10.lucroLiquido, 390);
    assert.equal(out10.retiradas, 150);
    assert.equal(out.meses.find((m) => m.mes === "2026-09")!.receitaBruta, 500);
    assert.equal(out.total.receitaBruta, 1700);
    assert.equal(out.meses.length, 12);
  });

  test("caixa: só o que foi pago, no mês do pagamento", () => {
    const out10 = dre(base, 2026, "caixa").meses.find((m) => m.mes === "2026-10")!;
    assert.equal(out10.receitaBruta, 1700, "a receita de setembro foi recebida em outubro");
    assert.equal(out10.despesasFixas, 300, "a despesa em aberto não saiu do caixa");
  });

  test("ponto de equilíbrio: (despesas fixas + retiradas) ÷ margem de contribuição %", () => {
    const pe = pontoEquilibrio(dre(base, 2026, "competencia"), ["2026-10"]);
    // margem 1080/1200 = 90%; fixas+retiradas = 850 → 850/0,9 = 944,44
    assert.equal(pe?.receitaNecessaria, 944.44);
    assert.equal(pe?.receitaMedia, 1200);
    assert.equal(pe?.folga, 255.56);
  });
});

describe("Saldos, extrato e fluxo de caixa", () => {
  const contas = [
    { id: "inter", nome: "Inter PJ", saldoInicial: 1000, saldoInicialEm: "2026-10-01" },
    { id: "stripe", nome: "Stripe", saldoInicial: 0, saldoInicialEm: "2026-10-01" },
  ];
  const movs = [
    mov({ tipo: "receber", valor: 500, pagoEm: "2026-10-03", contaId: "stripe", categoria: "R01" }),
    mov({ valor: 200, pagoEm: "2026-10-05", contaId: "inter" }),
    mov({ valor: 50, pagoEm: "2026-09-20", contaId: "inter", descricao: "antes do saldo inicial" }),
    mov({ valor: 80, status: "aberto", pagoEm: undefined, vencimento: "2026-11-10", contaId: "inter" }),
    mov({ tipo: "receber", valor: 300, status: "aberto", pagoEm: undefined, vencimento: "2026-11-15", categoria: "R01" }),
  ];
  const transf = [{ id: "t1", deContaId: "stripe", paraContaId: "inter", valor: 400, data: "2026-10-08", descricao: "Repasse Stripe" }];

  test("saldo de cada conta e total; movimento antes do saldo inicial é ignorado", () => {
    const s = saldos(contas, movs, transf, "2026-10-31");
    assert.equal(s.porConta.find((c) => c.id === "inter")!.saldo, 1200);
    assert.equal(s.porConta.find((c) => c.id === "stripe")!.saldo, 100);
    assert.equal(s.total, 1300);
  });

  test("extrato com saldo linha a linha", () => {
    const e = extrato(contas, movs, transf, { contaId: "inter", de: "2026-10-01", ate: "2026-10-31" });
    assert.equal(e.saldoAnterior, 1000);
    assert.deepEqual(e.linhas.map((l) => [l.data, l.entrada ?? 0, l.saida ?? 0, l.saldo]), [
      ["2026-10-05", 0, 200, 800],
      ["2026-10-08", 400, 0, 1200],
    ]);
  });

  test("fluxo de caixa: realizado até hoje e previsto pelos vencimentos em aberto", () => {
    const f = fluxoCaixa(contas, movs, transf, "2026-10-20", 2);
    assert.equal(f.saldoHoje, 1300);
    const nov = f.meses.find((m) => m.mes === "2026-11")!;
    assert.equal(nov.entradasPrevistas, 300);
    assert.equal(nov.saidasPrevistas, 80);
    assert.equal(nov.saldoFinal, 1520);
    assert.equal(f.proximos30.aReceber, 300);
    assert.equal(f.proximos30.aPagar, 80);
  });

  test("pontos de atenção: vencidos em aberto a receber e a pagar", () => {
    const p = pontosAtencao([...movs, mov({ valor: 70, status: "aberto", pagoEm: undefined, vencimento: "2026-10-01" }), mov({ tipo: "receber", valor: 40, status: "aberto", pagoEm: undefined, vencimento: "2026-09-01" })], "2026-10-20");
    assert.deepEqual(p, { vencidosReceber: { quantidade: 1, valor: 40 }, vencidosPagar: { quantidade: 1, valor: 70 } });
  });
});

describe("Parcelas e recorrência", () => {
  test("3 parcelas mensais: valor dividido, último ajusta os centavos, descrição 1/3", () => {
    const p = gerarParcelas({ descricao: "Notebook", valor: 100, vencimento: "2026-01-31", parcelas: 3, recorrente: false });
    assert.deepEqual(p.map((x) => [x.descricao, x.valor, x.vencimento]), [
      ["Notebook 1/3", 33.33, "2026-01-31"],
      ["Notebook 2/3", 33.33, "2026-02-28"],
      ["Notebook 3/3", 33.34, "2026-03-31"],
    ]);
  });
  test("recorrente: mesmo valor todo mês", () => {
    const p = gerarParcelas({ descricao: "Servidor", valor: 120, vencimento: "2026-11-05", parcelas: 12, recorrente: true });
    assert.equal(p.length, 12);
    assert.ok(p.every((x) => x.valor === 120 && x.descricao === "Servidor"));
    assert.equal(p[11].vencimento, "2027-10-05");
  });
});

describe("Importação", () => {
  test("OFX do banco: data, valor (+ entrada, − saída), descrição e código único", () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-200.50<FITID>A1<MEMO>PIX ENVIADO LOCAWEB</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261008
<TRNAMT>400,00
<FITID>A2
<NAME>STRIPE PAYMENTS
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    assert.deepEqual(lerOfx(ofx), [
      { id: "A1", data: "2026-10-05", valor: -200.5, descricao: "PIX ENVIADO LOCAWEB" },
      { id: "A2", data: "2026-10-08", valor: 400, descricao: "STRIPE PAYMENTS" },
    ]);
  });

  test("planilha (CSV com ; ou ,): colunas pelo nome, números e datas brasileiras", () => {
    const csv = `Data;Descrição;Valor;Categoria;Tipo;Situação
05/10/2026;Servidor VPS;-120,50;F02;;pago
10/11/2026;Assinatura Loja X;"1.234,56";R01;receber;aberto
xx;linha ruim;abc;;;`;
    const r = lerPlanilha(csv);
    assert.equal(r.linhas.length, 2);
    assert.deepEqual(r.linhas[0], { data: "2026-10-05", descricao: "Servidor VPS", valor: 120.5, tipo: "pagar", categoria: "F02", status: "pago" });
    assert.deepEqual(r.linhas[1], { data: "2026-11-10", descricao: "Assinatura Loja X", valor: 1234.56, tipo: "receber", categoria: "R01", status: "aberto" });
    assert.deepEqual(r.erros, ["Linha 4: data ou valor inválido"]);
  });

  test("planilha: célula com fórmula é tratada como texto, não executada", () => {
    const r = lerPlanilha(`Data,Descrição,Valor\n01/10/2026,=HYPERLINK("x"),-10`);
    assert.equal(r.linhas[0].descricao, "'=HYPERLINK(\"x\")");
  });
});
