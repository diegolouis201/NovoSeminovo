import { z } from "zod";

// SEO no Hub: dados do Google Search Console (cliques, impressões, CTR e
// posição média das buscas do Google). Lidos pela API com a conta de
// serviço do Google (DEPLOY.md, "Search Console no Hub").

export const SEO_DIAS = [7, 28, 90] as const;
export type SeoDias = (typeof SEO_DIAS)[number];

// ?dias=7|28|90 (a query chega como texto). Padrão: 28.
export const SeoQuerySchema = z
  .object({
    dias: z.enum(["7", "28", "90"], { errorMap: () => ({ message: "Período inválido: use 7, 28 ou 90 dias" }) }).optional(),
  })
  .strict();

export const SeoAtualizarSchema = z
  .object({
    dias: z.union([z.literal(7), z.literal(28), z.literal(90)], { errorMap: () => ({ message: "Período inválido: use 7, 28 ou 90 dias" }) }),
  })
  .strict();

// Regra das oportunidades "quase na página 1": posição média entre 8 e 20
// (fim da 1ª página e 2ª página) e um mínimo de impressões no período.
export const SEO_OPORTUNIDADE = { posicaoMin: 8, posicaoMax: 20, impressoesMin: 10 } as const;

export type SeoMetricas = { cliques: number; impressoes: number; ctr: number; posicao: number };
export type SeoLinha = SeoMetricas & { chave: string };
export type SeoOportunidade = SeoMetricas & { consulta: string; pagina: string };
export type SeoVariacao = { atual: number; anterior: number; variacao: number; variacaoPct: number | null };
export type SeoPeriodo = { inicio: string; fim: string };

export type HubSeo = {
  configurado: boolean;
  // Não configurado: o que falta (sem segredo).
  falta?: string;
  site?: string;
  dias: SeoDias;
  periodo?: SeoPeriodo;
  anterior?: SeoPeriodo;
  atualizadoEm?: string;
  totais?: { cliques: SeoVariacao; impressoes: SeoVariacao; ctr: SeoVariacao; posicao: SeoVariacao };
  serie: Array<SeoMetricas & { dia: string }>;
  consultas: SeoLinha[];
  paginas: SeoLinha[];
  oportunidades: SeoOportunidade[];
  guias: SeoLinha[];
  regraOportunidade: { posicaoMin: number; posicaoMax: number; impressoesMin: number };
  // Falha ao ler o Google (sem segredo). Com dado antigo em memória, ele
  // continua na tela junto com o aviso.
  erro?: string;
};
