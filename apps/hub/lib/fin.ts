import { redirect } from "next/navigation";
import { hubFetch } from "./api";
import { me } from "./crm";

// Tipos das respostas do financeiro (apps/api/src/hub/financeiro.service.ts).
export type Categoria = { codigo: string; nome: string; grupo: string };
export type Conta = { id: string; nome: string; banco?: string; tipo: string; saldoInicial: number; saldoInicialEm: string };
export type Mov = { id: string; tipo: "receber" | "pagar"; descricao: string; contraparte?: string; categoria: string; competencia: string; vencimento: string; valor: number; status: "aberto" | "pago" | "cancelado"; pagoEm?: string; contaId?: string; origem: string; observacao?: string };
export type LinhaDre = { mes: string; receitaBruta: number; deducoes: number; receitaLiquida: number; custos: number; margemContribuicao: number; margemPct?: number; despesasFixas: number; ebitda: number; naoOperacional: number; lucroLiquido: number; retiradas: number; porCategoria: Record<string, number> };
export type Fluxo = { saldoHoje: number; meses: { mes: string; entradasRealizadas: number; saidasRealizadas: number; entradasPrevistas: number; saidasPrevistas: number; saldoFinal: number }[]; proximos30: { aReceber: number; aPagar: number } };
export type Atencao = { vencidosReceber: { quantidade: number; valor: number }; vencidosPagar: { quantidade: number; valor: number } };
export type Saldos = { porConta: { id: string; nome: string; saldo: number }[]; total: number };

export async function exigirFinanceiro() {
  const a = await me();
  if (!a.permissions.includes("financeiro")) redirect("/");
  return a;
}

export const fin = {
  painel: (ano?: number) =>
    hubFetch<{
      ano: number;
      atencao: Atencao;
      acumulado: { receitaBruta: number; margemContribuicao: number; ebitda: number; lucroLiquido: number; retiradas: number; anterior: { receitaBruta: number; ebitda: number; lucroLiquido: number; retiradas: number } };
      saldos: Saldos;
      fluxo: Fluxo;
      equilibrio: { receitaNecessaria: number; receitaMedia: number; folga: number; margemPct: number; fixasMaisRetiradas: number } | null;
      porMes: { mes: string; receitaBruta: number; ebitda: number; anterior: number }[];
      por100: Record<string, number>;
      categorias: Categoria[];
    }>(`/hub/financeiro/painel${ano ? `?ano=${ano}` : ""}`),
  lancamentos: (qs: string) =>
    hubFetch<{ lista: Mov[]; total: number; resumo: { mes: string; aReceber: number; recebido: number; aPagar: number; pago: number; saldoPrevisto: number } & Atencao; contas: Conta[]; categorias: Categoria[] }>(`/hub/financeiro/lancamentos${qs}`),
  extrato: (qs: string) =>
    hubFetch<{ contas: Conta[]; saldos: Saldos; saldoAnterior: number; saldoFinal: number; linhas: { id: string; data: string; contaId: string; entrada?: number; saida?: number; descricao: string; categoria?: string; origem: string; saldo: number }[] }>(`/hub/financeiro/extrato${qs}`),
  fluxo: (meses = 6) => hubFetch<Fluxo>(`/hub/financeiro/fluxo?meses=${meses}`),
  dre: (ano: number, regime: string) => hubFetch<{ ano: number; regime: string; meses: LinhaDre[]; total: LinhaDre; categorias: Categoria[] }>(`/hub/financeiro/dre?ano=${ano}&regime=${regime}`),
  contas: () => hubFetch<Conta[]>("/hub/financeiro/contas"),
};

export const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const pct = (v?: number) => (v === undefined ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const variacao = (atual: number, anterior: number) => (anterior === 0 ? undefined : Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10);
