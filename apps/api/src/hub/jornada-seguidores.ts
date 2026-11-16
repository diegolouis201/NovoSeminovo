import { z } from "zod";
import { JORNADA_REDES_LISTA, type JornadaRede, type JornadaRedeAtual } from "@novoseminovo/shared-types";

// Seguidores das redes na Jornada do Hub: regras puras (testes em
// jornada-seguidores.spec.ts). O serviço (jornada-seguidores.service.ts) lê
// as fontes e guarda o estado em mkt_settings:
//   "jornada_seguidores"           {rede: {valor, em}}  último valor bom;
//   "jornada_seguidores_historico" {rede: [{dia, valor}]} um ponto por dia,
//                                   no máximo 400 dias.

const DAY_MS = 86_400_000;
export const HISTORICO_DIAS = 400;

const Contagem = z.number().int().nonnegative().max(1e12);
const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const LeituraSchema = z.object({ valor: Contagem, em: z.string().datetime() });
const PontoSchema = z.object({ dia: Dia, valor: Contagem });
const porRede = <T extends z.ZodTypeAny>(item: T) =>
  z.object(Object.fromEntries(JORNADA_REDES_LISTA.map((r) => [r, item.optional().catch(undefined)])) as Record<JornadaRede, z.ZodCatch<z.ZodOptional<T>>>);
export const AtualSchema = porRede(LeituraSchema);
export const HistoricoSchema = porRede(z.array(PontoSchema).max(HISTORICO_DIAS * 2));

export type SeguidoresEstado = {
  atual: Partial<Record<JornadaRede, { valor: number; em: string }>>;
  historico: Partial<Record<JornadaRede, Array<{ dia: string; valor: number }>>>;
};
export const ESTADO_VAZIO: SeguidoresEstado = Object.freeze({ atual: Object.freeze({}), historico: Object.freeze({}) }) as SeguidoresEstado;

// Valor guardado estragado (ou de versão antiga) vira vazio, nunca erro.
export function estadoDoBanco(atual: unknown, historico: unknown): SeguidoresEstado {
  const a = AtualSchema.safeParse(atual ?? {});
  const h = HistoricoSchema.safeParse(historico ?? {});
  const limpar = <T>(o: Record<string, T | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<Record<JornadaRede, T>>;
  return { atual: a.success ? limpar(a.data) : {}, historico: h.success ? limpar(h.data) : {} };
}

// Dia no fuso de Brasília (o "hoje" do Diego), formato AAAA-MM-DD.
export function diaBrasil(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Nova leitura: vira o último valor bom e o ponto do dia (um por dia; a
// leitura mais nova do dia substitui a anterior). Não altera a entrada.
export function registrarLeitura(estado: SeguidoresEstado, rede: JornadaRede, valor: number, agora: Date): SeguidoresEstado {
  const dia = diaBrasil(agora);
  const limite = diaBrasil(new Date(agora.getTime() - (HISTORICO_DIAS - 1) * DAY_MS));
  const pontos = (estado.historico[rede] ?? []).filter((p) => p.dia !== dia && p.dia >= limite);
  pontos.push({ dia, valor });
  pontos.sort((a, b) => a.dia.localeCompare(b.dia));
  return {
    atual: { ...estado.atual, [rede]: { valor, em: agora.toISOString() } },
    historico: { ...estado.historico, [rede]: pontos.slice(-HISTORICO_DIAS) },
  };
}

// O que a tela mostra de uma rede. aoVivo = lida agora (false = fonte fora
// do ar ou desligada; mostra o último valor guardado com a data).
export function resumoRede(estado: SeguidoresEstado, rede: JornadaRede, hoje: Date, aoVivo: boolean): JornadaRedeAtual {
  const ultimo = estado.atual[rede];
  if (!ultimo) return { valor: null, atualizadoEm: null, aoVivo: false, variacao30d: null, variacao30dPct: null, desde: null };
  const corte = diaBrasil(new Date(hoje.getTime() - 30 * DAY_MS));
  const base = (estado.historico[rede] ?? []).filter((p) => p.dia <= corte).at(-1);
  const variacao = base ? ultimo.valor - base.valor : null;
  return {
    valor: ultimo.valor,
    atualizadoEm: ultimo.em,
    aoVivo,
    variacao30d: variacao,
    variacao30dPct: base && base.valor > 0 && variacao !== null ? Math.round((variacao / base.valor) * 1000) / 10 : null,
    desde: base?.dia ?? null,
  };
}

// Total de seguidores vindo de fora (número ou texto só com dígitos).
export function contagem(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,13}(\.0+)?$/.test(v.trim()) ? Number(v) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

// Linhas do Windsor: só as do dia mais recente (quando vier "date"); prefere
// a conta do NovoSeminovo (algum texto da linha com "novoseminovo"), senão a
// primeira com número. Nada de somar contas.
export function escolherSeguidores(rows: Record<string, unknown>[], campo: string): number | null {
  const datas = rows.map((r) => r.date).filter((d): d is string => typeof d === "string" && Dia.safeParse(d.slice(0, 10)).success);
  const ultima = datas.length ? datas.map((d) => d.slice(0, 10)).sort().at(-1) : undefined;
  const doDia = ultima ? rows.filter((r) => typeof r.date === "string" && r.date.slice(0, 10) === ultima) : rows;
  const nosso = (r: Record<string, unknown>) => Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes("novoseminovo"));
  for (const r of [...doDia.filter(nosso), ...doDia]) {
    const n = contagem(r[campo]);
    if (n !== null) return n;
  }
  return null;
}
