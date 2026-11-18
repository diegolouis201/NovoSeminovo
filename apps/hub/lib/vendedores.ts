import type { ArrumacaoSequencias, RascunhoVista, VendedorPainel, VendedoresPainel } from "@novoseminovo/shared-types";
import { hubFetch } from "./api";

export const painelVendedores = () => hubFetch<VendedoresPainel>("/hub/vendedores");
export const detalheVendedor = (id: string) => hubFetch<{ vendedor: VendedorPainel; recentes: RascunhoVista[] }>(`/hub/vendedores/${encodeURIComponent(id)}`);
export const respostasParaAprovar = (vendedor?: string) => hubFetch<RascunhoVista[]>(`/hub/vendedores/respostas${vendedor ? `?vendedor=${encodeURIComponent(vendedor)}` : ""}`);

export const pct = (v?: number) => (v === undefined ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const horas = (v?: number) => (v === undefined ? "—" : v < 1 ? `${Math.round(v * 60)} min` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`);
export const previaArrumacao = () => hubFetch<ArrumacaoSequencias>("/hub/vendedores/arrumacao");
