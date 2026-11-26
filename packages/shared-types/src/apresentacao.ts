import { z } from "zod";

// PDF de apresentação para empresas (lojas, imobiliárias, corretores), que vai
// como link nos e-mails das sequências de prospecção. Endereço fixo; o arquivo
// fica no servidor, fora da imagem do site (DEPLOY.md, "Apresentação para empresas").
export const APRESENTACAO_PDF_PATH = "/apresentacao-empresas.pdf";
export const APRESENTACAO_LINK_PATH = "/apresentacao-empresas";
export const APRESENTACAO_TARGET = "apresentacao_empresas";

// Alvos que contam visita (lista fixa: nada vindo da URL vira nome de alvo).
export const CAMPAIGN_VISIT_TARGETS = [APRESENTACAO_TARGET] as const;
export type CampaignVisitTarget = (typeof CAMPAIGN_VISIT_TARGETS)[number];

// Valor de UTM aceito: só minúsculas, números, "_" e "-", até 60 caracteres.
export const CAMPAIGN_UTM_PATTERN = /^[a-z0-9_-]{1,60}$/;
export type CampaignUtm = { source?: string; medium?: string; campaign?: string; content?: string; term?: string };

const UTM_KEYS = { source: "utm_source", medium: "utm_medium", campaign: "utm_campaign", content: "utm_content", term: "utm_term" } as const;

// Lê os utm_* da URL. Maiúsculas viram minúsculas; qualquer outro caractere
// (espaço, aspas, <, /, :) descarta o valor inteiro — nunca é "consertado".
export function cleanCampaignUtm(get: (name: string) => string | null | undefined): CampaignUtm {
  const out: CampaignUtm = {};
  for (const [key, param] of Object.entries(UTM_KEYS) as [keyof CampaignUtm, string][]) {
    const raw = get(param);
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    if (CAMPAIGN_UTM_PATTERN.test(value)) out[key] = value;
  }
  return out;
}

const utmValue = z.string().regex(CAMPAIGN_UTM_PATTERN);

// O que o site manda para a API ao contar uma visita (sem IP, sem dado pessoal).
export const CampaignVisitInputSchema = z
  .object({
    target: z.enum(CAMPAIGN_VISIT_TARGETS),
    source: utmValue.optional(),
    medium: utmValue.optional(),
    campaign: utmValue.optional(),
    content: utmValue.optional(),
  })
  .strict();
export type CampaignVisitInput = z.infer<typeof CampaignVisitInputSchema>;

// Resumo do Hub (/prospeccao): aberturas do link de campanha da apresentação.
export type ApresentacaoAberturas = {
  link: string;
  linkCampanha: string;
  total7d: number;
  total30d: number;
  linhas: { origem?: string; meio?: string; campanha?: string; conteudo?: string; aberturas7d: number; aberturas30d: number; ultimaEm: string }[];
};
