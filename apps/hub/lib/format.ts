// Números em R$ 1.234,56 e datas em DD/MM/AAAA (regra do CRM).
export const brl = (v?: number) => (v === undefined || v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const brlCurto = (v?: number) => {
  if (v === undefined || v === null) return "—";
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 10_000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl(v);
};
export const data = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
export const dataHora = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const mesAtual = (hoje: Date) => hoje.toISOString().slice(0, 7);
export const nomeMes = (mes: string) => new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
