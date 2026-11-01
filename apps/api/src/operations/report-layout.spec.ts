import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildReportLayout, readReportLayout, reportLayoutText } from "./report-layout";

// Relatório dos agentes em formato fácil de ler: uma frase principal,
// números em destaque e listas curtas separadas por assunto.
describe("Layout dos relatórios dos agentes", () => {
  const layout = buildReportLayout({
    manchete: "Mês começou sem receita; 8 leads para acompanhar.",
    numeros: [
      { rotulo: "Receita 30 dias", valor: "R$ 0,00", tom: "atencao" },
      { rotulo: "Leads", valor: "8" },
    ],
    detalhes: "Texto com os detalhes.",
    blocos: [
      { titulo: "O que foi bem", tipo: "bom", itens: ["94 visualizações nos anúncios"] },
      { titulo: "Atenção", tipo: "atencao", itens: [] },
      { titulo: "Para você decidir", tipo: "acao", itens: ["Cadastrar as metas de novembro"] },
    ],
  });

  test("blocos vazios somem", () => {
    assert.deepEqual(layout.blocos.map((b) => b.titulo), ["O que foi bem", "Para você decidir"]);
  });

  test("texto para e-mail e histórico tem a manchete, os números e as listas", () => {
    const text = reportLayoutText(layout);
    assert.ok(text.startsWith("Mês começou sem receita"));
    assert.ok(text.includes("Receita 30 dias: R$ 0,00"));
    assert.ok(text.includes("Para você decidir:\n1. Cadastrar as metas de novembro"));
    assert.ok(text.includes("• 94 visualizações"));
  });

  test("lê o layout gravado e ignora dado estranho", () => {
    assert.equal(readReportLayout({ layout })?.manchete, layout.manchete);
    assert.equal(readReportLayout({ layout: { manchete: 5 } }), undefined);
    assert.equal(readReportLayout(null), undefined);
    assert.equal(readReportLayout({ alertas: ["antigo"] }), undefined);
  });
});
