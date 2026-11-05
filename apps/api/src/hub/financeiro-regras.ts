// Financeiro do NovoSeminovo Hub: regras puras (testes em
// financeiro-regras.spec.ts). Datas em "AAAA-MM-DD"; valores sempre
// positivos — o tipo (receber/pagar) diz se entra ou sai.
//
// Faturamento = planos (Stripe). Financiamentos e afiliados ficam fora do
// DRE: no CRM eles são "só visualização".

export type Grupo = "receita" | "deducao" | "custo" | "despesa_fixa" | "retirada" | "nao_operacional";
export type Categoria = { codigo: string; nome: string; grupo: Grupo };

export const PLANO_DE_CONTAS: Categoria[] = [
  { codigo: "R01", nome: "Assinaturas de lojas, imobiliárias e corretores (Stripe)", grupo: "receita" },
  { codigo: "R02", nome: "Planos de anúncio de pessoa física (Stripe)", grupo: "receita" },
  { codigo: "R03", nome: "Outras receitas operacionais", grupo: "receita" },
  { codigo: "D01", nome: "Simples Nacional (DAS) e impostos sobre a receita", grupo: "deducao" },
  { codigo: "C01", nome: "Taxas de pagamento (Stripe, banco)", grupo: "custo" },
  { codigo: "C02", nome: "Servidor, IA e serviços por uso", grupo: "custo" },
  { codigo: "F01", nome: "Pessoal, pró-labore e encargos", grupo: "despesa_fixa" },
  { codigo: "F02", nome: "Software, domínios e assinaturas", grupo: "despesa_fixa" },
  { codigo: "F03", nome: "Marketing e anúncios", grupo: "despesa_fixa" },
  { codigo: "F04", nome: "Contabilidade e jurídico", grupo: "despesa_fixa" },
  { codigo: "F05", nome: "Escritório, aluguel e utilidades", grupo: "despesa_fixa" },
  { codigo: "F06", nome: "Outras despesas", grupo: "despesa_fixa" },
  { codigo: "S01", nome: "Retiradas dos sócios (distribuição de lucro)", grupo: "retirada" },
  { codigo: "N01", nome: "Rendimentos, juros e tarifas (não operacional)", grupo: "nao_operacional" },
];
const GRUPO = new Map(PLANO_DE_CONTAS.map((c) => [c.codigo, c.grupo]));

export type Movimento = {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  contraparte?: string;
  categoria: string;
  competencia: string;
  vencimento: string;
  valor: number;
  status: "aberto" | "pago" | "cancelado";
  pagoEm?: string;
  contaId?: string;
  origem: "manual" | "stripe" | "planilha" | "ofx";
  observacao?: string;
};
export type Conta = { id: string; nome: string; saldoInicial: number; saldoInicialEm: string };
export type Transferencia = { id: string; deContaId: string; paraContaId: string; valor: number; data: string; descricao?: string };

const cents = (v: number) => Math.round(v * 100) / 100;
const mesDe = (d: string) => d.slice(0, 7);
const sinal = (m: Movimento) => (m.tipo === "receber" ? 1 : -1);

// ------------------------------------------------------------------ DRE

export type LinhaDre = {
  mes: string;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  margemContribuicao: number;
  margemPct?: number;
  despesasFixas: number;
  ebitda: number;
  naoOperacional: number;
  lucroLiquido: number;
  retiradas: number;
  porCategoria: Record<string, number>;
};

function linhaVazia(mes: string): LinhaDre {
  return { mes, receitaBruta: 0, deducoes: 0, receitaLiquida: 0, custos: 0, margemContribuicao: 0, despesasFixas: 0, ebitda: 0, naoOperacional: 0, lucroLiquido: 0, retiradas: 0, porCategoria: {} };
}

function fechar(l: LinhaDre): LinhaDre {
  l.receitaBruta = cents(l.receitaBruta);
  l.deducoes = cents(l.deducoes);
  l.custos = cents(l.custos);
  l.despesasFixas = cents(l.despesasFixas);
  l.naoOperacional = cents(l.naoOperacional);
  l.retiradas = cents(l.retiradas);
  l.receitaLiquida = cents(l.receitaBruta - l.deducoes);
  l.margemContribuicao = cents(l.receitaLiquida - l.custos);
  l.margemPct = l.receitaBruta > 0 ? Math.round((l.margemContribuicao / l.receitaBruta) * 1000) / 10 : undefined;
  l.ebitda = cents(l.margemContribuicao - l.despesasFixas);
  l.lucroLiquido = cents(l.ebitda + l.naoOperacional);
  for (const k of Object.keys(l.porCategoria)) l.porCategoria[k] = cents(l.porCategoria[k]);
  return l;
}

// Competência: o mês a que a receita/despesa pertence (inclui o que ainda
// está em aberto). Caixa: só o que foi pago, no mês do pagamento.
export function dre(movs: Movimento[], ano: number, regime: "competencia" | "caixa") {
  const meses = Array.from({ length: 12 }, (_, i) => linhaVazia(`${ano}-${String(i + 1).padStart(2, "0")}`));
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  for (const m of movs) {
    if (m.status === "cancelado") continue;
    if (regime === "caixa" && (m.status !== "pago" || !m.pagoEm)) continue;
    const linha = porMes.get(mesDe(regime === "caixa" ? m.pagoEm! : m.competencia));
    if (!linha) continue;
    const grupo = GRUPO.get(m.categoria) ?? (m.tipo === "receber" ? "receita" : "despesa_fixa");
    const entra = m.valor * sinal(m);
    linha.porCategoria[m.categoria] = (linha.porCategoria[m.categoria] ?? 0) + Math.abs(m.valor);
    if (grupo === "receita") linha.receitaBruta += entra;
    else if (grupo === "deducao") linha.deducoes -= entra;
    else if (grupo === "custo") linha.custos -= entra;
    else if (grupo === "despesa_fixa") linha.despesasFixas -= entra;
    else if (grupo === "retirada") linha.retiradas -= entra;
    else linha.naoOperacional += entra;
  }
  meses.forEach(fechar);
  const total = linhaVazia(String(ano));
  for (const l of meses) {
    for (const k of ["receitaBruta", "deducoes", "custos", "despesasFixas", "naoOperacional", "retiradas"] as const) total[k] += l[k];
    for (const [k, v] of Object.entries(l.porCategoria)) total.porCategoria[k] = (total.porCategoria[k] ?? 0) + v;
  }
  return { ano, regime, meses, total: fechar(total) };
}

// Quanto precisa faturar por mês para empatar: (despesas fixas + retiradas)
// ÷ margem de contribuição %. Média dos meses informados (já fechados).
export function pontoEquilibrio(d: ReturnType<typeof dre>, meses: string[]) {
  const ls = d.meses.filter((l) => meses.includes(l.mes));
  const receita = ls.reduce((s, l) => s + l.receitaBruta, 0);
  const margem = ls.reduce((s, l) => s + l.margemContribuicao, 0);
  if (!ls.length || receita <= 0 || margem <= 0) return null;
  const fixas = ls.reduce((s, l) => s + l.despesasFixas + l.retiradas, 0) / ls.length;
  const receitaNecessaria = cents(fixas / (margem / receita));
  const receitaMedia = cents(receita / ls.length);
  return { receitaNecessaria, receitaMedia, folga: cents(receitaMedia - receitaNecessaria), margemPct: Math.round((margem / receita) * 1000) / 10, fixasMaisRetiradas: cents(fixas) };
}

// ------------------------------------------------------ Saldos e extrato

type Lanc = { data: string; contaId: string; entrada?: number; saida?: number; descricao: string; categoria?: string; id: string; origem: string };

function lancamentos(contas: Conta[], movs: Movimento[], transf: Transferencia[]): Lanc[] {
  const inicio = new Map(contas.map((c) => [c.id, c.saldoInicialEm]));
  const out: Lanc[] = [];
  for (const m of movs) {
    if (m.status !== "pago" || !m.pagoEm || !m.contaId) continue;
    out.push({ id: m.id, data: m.pagoEm, contaId: m.contaId, descricao: m.contraparte ? `${m.descricao} · ${m.contraparte}` : m.descricao, categoria: m.categoria, origem: m.origem, ...(m.tipo === "receber" ? { entrada: m.valor } : { saida: m.valor }) });
  }
  for (const t of transf) {
    out.push({ id: `${t.id}-s`, data: t.data, contaId: t.deContaId, saida: t.valor, descricao: t.descricao || "Transferência entre contas", origem: "transferencia" });
    out.push({ id: `${t.id}-e`, data: t.data, contaId: t.paraContaId, entrada: t.valor, descricao: t.descricao || "Transferência entre contas", origem: "transferencia" });
  }
  // Antes do saldo inicial da conta não conta (o saldo inicial já inclui).
  return out.filter((l) => inicio.has(l.contaId) && l.data >= inicio.get(l.contaId)!).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

export function saldos(contas: Conta[], movs: Movimento[], transf: Transferencia[], ate: string) {
  const ls = lancamentos(contas, movs, transf).filter((l) => l.data <= ate);
  const porConta = contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    saldo: cents(ls.filter((l) => l.contaId === c.id).reduce((s, l) => s + (l.entrada ?? 0) - (l.saida ?? 0), c.saldoInicial)),
  }));
  return { porConta, total: cents(porConta.reduce((s, c) => s + c.saldo, 0)) };
}

export function extrato(contas: Conta[], movs: Movimento[], transf: Transferencia[], f: { contaId?: string; de: string; ate: string }) {
  const doFiltro = contas.filter((c) => !f.contaId || c.id === f.contaId);
  const ids = new Set(doFiltro.map((c) => c.id));
  const ls = lancamentos(doFiltro, movs, transf).filter((l) => ids.has(l.contaId));
  let saldo = doFiltro.reduce((s, c) => s + c.saldoInicial, 0) + ls.filter((l) => l.data < f.de).reduce((s, l) => s + (l.entrada ?? 0) - (l.saida ?? 0), 0);
  const saldoAnterior = cents(saldo);
  // Transferência entre duas contas do próprio filtro não muda o total.
  const linhas = ls
    .filter((l) => l.data >= f.de && l.data <= f.ate)
    .filter((l) => !(l.origem === "transferencia" && !f.contaId))
    .map((l) => {
      saldo += (l.entrada ?? 0) - (l.saida ?? 0);
      return { ...l, saldo: cents(saldo) };
    });
  return { saldoAnterior, linhas, saldoFinal: cents(saldo) };
}

// --------------------------------------------------------- Fluxo de caixa

const addMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const addDias = (dia: string, n: number) => new Date(new Date(`${dia}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Mês atual em diante: o que já entrou e saiu (realizado) e o que vence em
// aberto (previsto). Vencido em aberto conta como previsto no mês atual.
export function fluxoCaixa(contas: Conta[], movs: Movimento[], transf: Transferencia[], hoje: string, meses = 6) {
  const saldoHoje = saldos(contas, movs, transf, hoje).total;
  const ls = lancamentos(contas, movs, transf).filter((l) => l.origem !== "transferencia");
  const abertos = movs.filter((m) => m.status === "aberto");
  const atual = mesDe(hoje);
  let saldo = saldoHoje;
  const linhas = Array.from({ length: meses }, (_, i) => {
    const mes = addMeses(atual, i);
    const doMes = (m: Movimento) => (m.vencimento < hoje ? mes === atual : mesDe(m.vencimento) === mes);
    const prev = abertos.filter(doMes);
    const real = ls.filter((l) => mesDe(l.data) === mes && l.data <= hoje);
    const entradasPrevistas = cents(prev.filter((m) => m.tipo === "receber").reduce((s, m) => s + m.valor, 0));
    const saidasPrevistas = cents(prev.filter((m) => m.tipo === "pagar").reduce((s, m) => s + m.valor, 0));
    saldo += entradasPrevistas - saidasPrevistas;
    return {
      mes,
      entradasRealizadas: cents(real.reduce((s, l) => s + (l.entrada ?? 0), 0)),
      saidasRealizadas: cents(real.reduce((s, l) => s + (l.saida ?? 0), 0)),
      entradasPrevistas,
      saidasPrevistas,
      saldoFinal: cents(saldo),
    };
  });
  const ate30 = addDias(hoje, 30);
  const em30 = abertos.filter((m) => m.vencimento >= hoje && m.vencimento <= ate30);
  return {
    saldoHoje,
    meses: linhas,
    proximos30: {
      aReceber: cents(em30.filter((m) => m.tipo === "receber").reduce((s, m) => s + m.valor, 0)),
      aPagar: cents(em30.filter((m) => m.tipo === "pagar").reduce((s, m) => s + m.valor, 0)),
    },
  };
}

export function pontosAtencao(movs: Movimento[], hoje: string) {
  const vencidos = movs.filter((m) => m.status === "aberto" && m.vencimento < hoje);
  const soma = (t: Movimento["tipo"]) => {
    const l = vencidos.filter((m) => m.tipo === t);
    return { quantidade: l.length, valor: cents(l.reduce((s, m) => s + m.valor, 0)) };
  };
  return { vencidosReceber: soma("receber"), vencidosPagar: soma("pagar") };
}

// ------------------------------------------------- Parcelas e recorrência

function mesmoDiaNoMes(base: string, n: number) {
  const [a, m, d] = base.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + n, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

// Parcelado: divide o valor (a última parcela acerta os centavos) e numera
// "1/3". Recorrente: o mesmo valor todo mês.
export function gerarParcelas(i: { descricao: string; valor: number; vencimento: string; parcelas: number; recorrente: boolean }) {
  const n = Math.max(1, Math.min(60, Math.floor(i.parcelas)));
  const parte = i.recorrente ? i.valor : cents(Math.floor((i.valor / n) * 100) / 100);
  return Array.from({ length: n }, (_, k) => ({
    descricao: i.recorrente || n === 1 ? i.descricao : `${i.descricao} ${k + 1}/${n}`,
    valor: i.recorrente || k < n - 1 ? parte : cents(i.valor - parte * (n - 1)),
    vencimento: mesmoDiaNoMes(i.vencimento, k),
  }));
}

// -------------------------------------------------------------- Importação

// Extrato do banco em OFX (Inter, C6, Itaú...). Aceita o formato antigo
// (SGML, sem fechar as tags) e o XML.
export function lerOfx(texto: string) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const campo = (b: string, tag: string) => new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(b)?.[1]?.trim();
  return blocos
    .map((b) => {
      const dt = campo(b, "DTPOSTED") ?? "";
      const valor = Number((campo(b, "TRNAMT") ?? "").replace(",", "."));
      const data = /^\d{8}/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : "";
      return { id: campo(b, "FITID") ?? "", data, valor: cents(valor), descricao: (campo(b, "MEMO") || campo(b, "NAME") || "").slice(0, 200) };
    })
    .filter((t) => t.data && Number.isFinite(t.valor) && t.valor !== 0);
}

function linhasCsv(texto: string, sep: string): string[][] {
  const out: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"' && celula === "") aspas = true;
    else if (c === sep) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(celula);
      out.push(linha);
      linha = [];
      celula = "";
    } else celula += c;
  }
  if (celula || linha.length) {
    linha.push(celula);
    out.push(linha);
  }
  return out;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const numeroBr = (s: string) => {
  let t = s.replace(/R\$|\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return t && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const dataBr = (s: string) => {
  const t = s.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
};
const semFormula = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
const COLUNAS: Record<string, string[]> = {
  data: ["data", "vencimento", "data de vencimento", "dt"],
  descricao: ["descricao", "historico", "lancamento", "descricao do lancamento"],
  valor: ["valor", "valor (r$)", "total"],
  categoria: ["categoria", "conta do plano", "plano de contas", "codigo"],
  tipo: ["tipo", "natureza"],
  status: ["situacao", "status"],
};

// Planilha do financeiro (CSV, separado por ; ou ,). Reconhece as colunas
// pelo nome; valor negativo = pagar. Linha com data ou valor inválido vira
// aviso, não importa.
export function lerPlanilha(texto: string) {
  const primeira = texto.split(/\r?\n/)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const [cab = [], ...resto] = linhasCsv(texto.replace(/^﻿/, ""), sep);
  const idx: Record<string, number> = {};
  cab.forEach((h, i) => {
    for (const [k, nomes] of Object.entries(COLUNAS)) if (idx[k] === undefined && nomes.includes(norm(h))) idx[k] = i;
  });
  const linhas: { data: string; descricao: string; valor: number; tipo: "receber" | "pagar"; categoria?: string; status: "aberto" | "pago" }[] = [];
  const erros: string[] = [];
  resto.forEach((cols, i) => {
    if (cols.every((c) => !c.trim())) return;
    const get = (k: string) => (idx[k] === undefined ? "" : (cols[idx[k]] ?? "").trim());
    const data = dataBr(get("data"));
    const valor = numeroBr(get("valor"));
    if (!data || !Number.isFinite(valor) || valor === 0) {
      erros.push(`Linha ${i + 2}: data ou valor inválido`);
      return;
    }
    const t = norm(get("tipo"));
    const tipo = /receb|entrada|receita|credito/.test(t) ? "receber" : /pag|saida|despesa|debito/.test(t) ? "pagar" : valor < 0 ? "pagar" : "receber";
    const s = norm(get("status"));
    const categoria = get("categoria").toUpperCase().slice(0, 10);
    linhas.push({
      data,
      descricao: semFormula(get("descricao").slice(0, 200)) || "Sem descrição",
      valor: cents(Math.abs(valor)),
      tipo,
      ...(categoria ? { categoria } : {}),
      status: /aberto|pendente|a pagar|a receber/.test(s) ? "aberto" : "pago",
    });
  });
  return { linhas, erros };
}
