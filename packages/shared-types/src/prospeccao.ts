import { z } from "zod";

// Prospecção pelo CRM do Hub: empresas encontradas no Mailerfind (busca do
// Google Maps) entram como cards "A abordar" e todo contato sai do Hub.

export const PROSPECCAO_ETIQUETA_PADRAO = "Prospecção BH - lojas de carros";
// Segmento do card + tipo de negócio.
export const PROSPECCAO_SEGMENTOS = {
  vehicle: { label: "Loja de veículos", businessType: "loja" },
  property: { label: "Imobiliária", businessType: "imobiliaria" },
  other: { label: "Outro", businessType: "outro" },
} as const;
export type ProspeccaoSegmento = keyof typeof PROSPECCAO_SEGMENTOS;
export const segmentoLabel = (s?: string) => (s === "property" ? "Imóveis" : s === "other" ? "Outro" : "Veículos");

// Etiqueta da campanha: texto curto, sem cara de fórmula nem HTML.
export const ProspeccaoEtiquetaSchema = z
  .string()
  .trim()
  .min(1, "Dê um nome para a etiqueta da campanha.")
  .max(60, "A etiqueta tem no máximo 60 caracteres.")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,_\-/()&+]*$/u, "Etiqueta: use letras, números, espaço e - / ( ).");

export const ProspeccaoConfirmarSchema = z
  .object({
    hash: z.string().regex(/^[0-9a-f]{64}$/, "Arquivo inválido: analise de novo."),
    etiqueta: ProspeccaoEtiquetaSchema,
    segmento: z.enum(["vehicle", "property", "other"], { errorMap: () => ({ message: "Escolha o tipo de empresa." }) }),
    nomeArquivo: z.string().trim().max(200).optional(),
  })
  .strict();
export type ProspeccaoConfirmar = z.infer<typeof ProspeccaoConfirmarSchema>;

export type ProspeccaoLinhaRecusada = { linha: number; nome: string; motivo: string };
export type ProspeccaoPreviaLinha = {
  linha: number;
  nome: string;
  telefone?: string;
  email?: string;
  site?: string;
  cidade?: string;
  uf?: string;
  categoria?: string;
  nota?: number;
  avaliacoes?: number;
  situacao: "nova" | "duplicada" | "invalida";
  motivo?: string;
};
export type ProspeccaoAnalise = {
  hash: string;
  total: number;
  colunas: { campo: string; rotulo: string; coluna?: string }[];
  colunasIgnoradas: string[];
  previa: ProspeccaoPreviaLinha[];
  contagens: { novas: number; jaNoCrm: number; jaParceiras: number; repetidasNoArquivo: number; invalidas: number; emailsDescartados: number };
  jaImportadoEm?: string;
};
export type ProspeccaoResultado = {
  criadas: number;
  duplicadas: ProspeccaoLinhaRecusada[];
  invalidas: ProspeccaoLinhaRecusada[];
  relatorioCsv: string;
};
