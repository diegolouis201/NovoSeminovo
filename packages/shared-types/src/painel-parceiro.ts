import { z } from "zod";

// Tela inicial do painel do parceiro (/parceiro), etapa 1: só dados que já
// existem no banco. Montado em GET /partners/mine/dashboard (cálculos em
// apps/api/src/partners/dashboard.ts, testes em dashboard.spec.ts).
// Visualizações por dia ainda não existem (só Listing.viewsCount, total):
// por isso "visualizações" vem separado e nunca dentro do período.

export const PAINEL_FUSO = "America/Sao_Paulo";
export const PAINEL_DIAS_LEADS = 15;
export const PAINEL_DIAS_FUNIL = 30;
// Análise de anúncios: abaixo disso é "poucas fotos" / "descrição curta" /
// "pouca procura" (visualizações, só para anúncio no ar há mais de 7 dias).
export const PAINEL_MIN_FOTOS = 8;
export const PAINEL_MIN_DESCRICAO = 300;
export const PAINEL_POUCA_PROCURA_VISUALIZACOES = 20;
export const PAINEL_POUCA_PROCURA_DIAS = 7;

const Money = z.object({ value: z.number(), label: z.string() });

export const PainelPlanoSchema = z.object({
  // trial = período grátis; em_dia = assinatura ativa; atrasado = renovação
  // não passou (past_due); sem_plano = grátis acabou e não assinou;
  // nao_precisa = tipo de conta que não paga (oficina).
  situacao: z.enum(["trial", "em_dia", "atrasado", "sem_plano", "nao_precisa"]),
  planName: z.string().optional(),
  trialEndsAt: z.string().optional(),
  // Só com assinatura paga no Stripe e ativa: preço do plano na data de
  // renovação guardada no banco (nunca chamamos o Stripe pra montar a tela).
  proximaCobranca: z.object({ valor: Money, data: z.string() }).optional(),
  anunciosEmUso: z.number().int(),
  // Ausente = sem limite (período grátis ou conta que não precisa de plano).
  limiteAnuncios: z.number().int().optional(),
  destaques: z.object({ usados: z.number().int(), max: z.number().int(), superUsados: z.number().int(), superMax: z.number().int() }).optional(),
});

export const PainelLeadsSchema = z.object({
  total: z.number().int(),
  aguardando: z.number().int(),
  emContato: z.number().int(),
  // Um item por dia (o mais antigo primeiro), data "AAAA-MM-DD" no fuso de SP.
  porDia: z.array(z.object({ data: z.string(), total: z.number().int() })),
  // Só existe quando há conversa de chat respondida: da primeira mensagem do
  // comprador até a primeira resposta da loja na plataforma.
  tempoResposta: z
    .object({ mediaMinutos: z.number(), label: z.string(), respondidas: z.number().int(), conversas: z.number().int() })
    .optional(),
});

export const PainelFunilEtapaSchema = z.object({
  status: z.enum(["new", "contacted", "visit_scheduled", "negotiating", "won", "lost"]),
  label: z.string(),
  total: z.number().int(),
});

export const PainelFunilSchema = z.object({
  totalLeads: z.number().int(),
  // Etapa ATUAL dos leads criados nos últimos 30 dias (em contato → vendido).
  etapas: z.array(PainelFunilEtapaSchema),
  perdidos: z.number().int(),
  // Total acumulado dos anúncios no ar (não é dos 30 dias).
  visualizacoesAnunciosAtivos: z.number().int(),
  // Sinais de interesse dos últimos 30 dias, só números (nunca quem foi):
  // assistente = vezes que abriram um anúncio da loja por link do assistente
  // virtual (contado desde 20/11/2026); arquiteto = pessoas distintas que
  // usaram o Arquiteto num imóvel da loja (só imobiliária/corretor/construtora).
  sinais: z.object({ assistente: z.number().int(), arquiteto: z.number().int().optional() }),
});

export const PainelNovoLeadSchema = z.object({
  id: z.string(),
  nome: z.string(),
  anuncio: z.string().optional(),
  origem: z.string(),
  status: PainelFunilEtapaSchema.shape.status,
  statusLabel: z.string(),
  criadoEm: z.string(),
});

export const PainelTopAnuncioSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  preco: Money,
  visualizacoes: z.number().int(),
  leads: z.number().int(),
  fotoUrl: z.string().optional(),
});

export const PainelAnaliseItemSchema = z.object({
  chave: z.string(),
  titulo: z.string(),
  total: z.number().int(),
  dica: z.string(),
  tom: z.enum(["alerta", "bom", "neutro"]),
});

export const PainelAnaliseSchema = z.object({
  segmento: z.enum(["vehicle", "property"]),
  anunciosAtivos: z.number().int(),
  itens: z.array(PainelAnaliseItemSchema),
  // Explicação da regra (ex.: margem da FIPE) mostrada na tela.
  regra: z.string(),
});

export const PainelQualidadeItemSchema = z.object({
  chave: z.string(),
  label: z.string(),
  ok: z.boolean(),
  pontos: z.number(),
  max: z.number(),
  detalhe: z.string(),
});

export const PainelQualidadeSchema = z.object({
  nota: z.number().int().min(0).max(100),
  itens: z.array(PainelQualidadeItemSchema),
});

export const PartnerDashboardSchema = z.object({
  segmento: z.enum(["vehicle", "property"]),
  plano: PainelPlanoSchema,
  leads: PainelLeadsSchema,
  funil: PainelFunilSchema,
  novosLeads: z.array(PainelNovoLeadSchema),
  topAnuncios: z.array(PainelTopAnuncioSchema),
  analise: PainelAnaliseSchema,
  qualidade: PainelQualidadeSchema,
  geradoEm: z.string(),
});
export type PartnerDashboard = z.infer<typeof PartnerDashboardSchema>;
export type PainelQualidade = z.infer<typeof PainelQualidadeSchema>;
export type PainelAnalise = z.infer<typeof PainelAnaliseSchema>;
export type PainelFunil = z.infer<typeof PainelFunilSchema>;
