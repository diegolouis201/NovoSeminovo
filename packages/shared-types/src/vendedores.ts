import { z } from "zod";

// Vendedores IA ("assistentes comerciais") da prospecção do Hub. Cada um tem
// nome próprio, se apresenta SEMPRE como "<Nome>, assistente comercial da
// NovoSeminovo" (nunca finge ser pessoa nem o dono) e usa uma caixa de e-mail
// (remetente). Só vendedor ativo, com caixa e sem pausa faz alguma coisa.

export const VENDEDOR_TITULO = "assistente comercial da NovoSeminovo";

// Os 5 vendedores do começo (decisão do Diego, 18/11/2026). Só a Nina tem
// caixa (o contato@ da prospecção, PROSPECCAO_SMTP_*); os outros entram
// quando ganharem um remetente próprio.
export const VENDEDORES_INICIAIS = [
  { slug: "nina", nome: "Nina", ativo: true, caixa: "prospeccao" },
  { slug: "lara", nome: "Lara", ativo: false, caixa: null },
  { slug: "dani", nome: "Dani", ativo: false, caixa: null },
  { slug: "caio", nome: "Caio", ativo: false, caixa: null },
  { slug: "joao", nome: "João", ativo: false, caixa: null },
] as const;

// Caixas de e-mail conhecidas (o remetente de cada vendedor). "prospeccao" =
// contato@ configurado em PROSPECCAO_SMTP_* / PROSPECCAO_IMAP_*.
export const VENDEDOR_CAIXAS = ["prospeccao"] as const;
export type VendedorCaixa = (typeof VENDEDOR_CAIXAS)[number];

// supervisionado = toda resposta passa pelo dono; automatico = respostas de
// rotina saem sozinhas (só depois de 14 dias no ar), o resto continua com o dono.
export const VENDEDOR_AUTONOMIA = { supervisionado: "Supervisionado (dono aprova cada resposta)", automatico: "Automático (respostas de rotina)" } as const;
export type VendedorAutonomia = keyof typeof VENDEDOR_AUTONOMIA;
export const DIAS_SUPERVISIONADO = 14;

// Objeções que a IA pode apontar (lista fechada: o modelo não inventa outra).
export const OBJECOES = {
  nenhuma: "Nenhuma",
  ja_anuncia: "Já anuncia em outro portal",
  sem_tempo: "Não tem tempo",
  quanto_custa: "Quanto custa depois",
  como_funciona: "Como funciona",
  nao_confia: "Não confia",
  sem_interesse: "Sem interesse",
  pouco_estoque: "Pouco estoque",
  outra: "Outra",
} as const;
export type Objecao = keyof typeof OBJECOES;
export const ObjecaoSchema = z.enum(Object.keys(OBJECOES) as [Objecao, ...Objecao[]]);

// Etapa sugerida pela IA. "ganho" NÃO existe aqui: só o cadastro no site
// (casamento por e-mail/telefone/CNPJ/UTM) marca ganho.
export const ETAPAS_SUGERIDAS = { manter: "Manter etapa", contatado: "Em contato", negociacao: "Interessada (negociação)", perdido: "Perdida" } as const;
export type EtapaSugerida = keyof typeof ETAPAS_SUGERIDAS;
export const EtapaSugeridaSchema = z.enum(Object.keys(ETAPAS_SUGERIDAS) as [EtapaSugerida, ...EtapaSugerida[]]);

// Motivos para passar para uma pessoa (tarefa + aviso, nunca resposta sozinha).
export const MOTIVOS_ESCALAR = {
  desconto: "Pediu desconto ou condição especial",
  reclamacao: "Reclamação",
  juridico: "Assunto jurídico / LGPD / dados",
  financiamento: "Financiamento ou crédito",
  ligacao: "Pediu ligação ou reunião",
  agressivo: "Mensagem agressiva",
  fora_do_roteiro: "Rascunho saiu do roteiro",
  incerto: "A IA não teve certeza",
  ia_desligada: "IA desligada: responder à mão",
} as const;
export type MotivoEscalar = keyof typeof MOTIVOS_ESCALAR;
export const MotivoEscalarSchema = z.enum(Object.keys(MOTIVOS_ESCALAR) as [MotivoEscalar, ...MotivoEscalar[]]);

// Saída do modelo (conferida com zod; qualquer campo fora disso = rascunho
// descartado e o caso vai para o dono).
export const RascunhoModeloSchema = z
  .object({
    reply_text: z.string().max(3000),
    detected_objection: ObjecaoSchema,
    suggested_stage: EtapaSugeridaSchema,
    escalate: z.object({ needed: z.boolean(), reason: MotivoEscalarSchema.optional() }).strict(),
    next_followup_days: z.number().int().min(0).max(30),
  })
  .strict();
export type RascunhoModelo = z.infer<typeof RascunhoModeloSchema>;

export const RASCUNHO_STATUS = {
  pendente: "Esperando aprovação",
  escalado: "Precisa de você",
  aprovado: "Aprovado (na fila de envio)",
  enviado: "Enviado",
  rejeitado: "Rejeitado",
  erro: "Erro ao enviar",
  descartado: "Descartado",
} as const;
export type RascunhoStatus = keyof typeof RASCUNHO_STATUS;

// ------------------------------------------------------------ entradas (Hub)

const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");
export const VendedorIdSchema = IdSchema;

export const AprovarRascunhoSchema = z
  .object({
    // Texto editado pelo dono (opcional: sem ele, sai o rascunho da IA).
    texto: z.string().trim().min(1, "Escreva a resposta.").max(3000, "A resposta tem no máximo 3.000 caracteres.").optional(),
  })
  .strict();
export const RejeitarRascunhoSchema = z.object({ motivo: z.string().trim().max(500, "Motivo: no máximo 500 caracteres.").optional() }).strict();

export const VendedorAjustesSchema = z
  .object({
    autonomia: z.enum(["supervisionado", "automatico"]).optional(),
    pausado: z.boolean().optional(),
    limiteEmailsDia: z.number().int().min(1).max(50).optional(),
    limiteRascunhosDia: z.number().int().min(1).max(200).optional(),
  })
  .strict();
export type VendedorAjustes = z.infer<typeof VendedorAjustesSchema>;

export const VendedoresGeralSchema = z
  .object({
    pausarTodos: z.boolean().default(false),
    // Mandar uma confirmação curta a quem pediu para sair (padrão: não).
    confirmarSaida: z.boolean().default(false),
  })
  .strict();
export type VendedoresGeral = z.infer<typeof VendedoresGeralSchema>;

// Ingestão de empresas por automação (POST /hub/prospects/ingest, chave de API).
export const IngestLinhaSchema = z.record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.null()]));
export const IngestSchema = z
  .object({
    etiqueta: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,_\-/()&+]*$/u, "Etiqueta inválida."),
    segmento: z.enum(["vehicle", "property", "other"]).default("vehicle"),
    csv: z.string().max(5 * 1024 * 1024).optional(),
    linhas: z.array(IngestLinhaSchema).max(5000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.csv) !== Boolean(v.linhas?.length), "Mande o CSV (csv) ou as linhas (linhas), um dos dois.");
export type IngestInput = z.input<typeof IngestSchema>;

// ------------------------------------------------------------ painéis

export type VendedorResumo = {
  id: string;
  slug: string;
  nome: string;
  titulo: string;
  ativo: boolean;
  pausado: boolean;
  caixa?: string;
  autonomia: VendedorAutonomia;
  noArDesde?: string;
  podeAutomatico: boolean;
  diasParaAutomatico: number;
  limiteEmailsDia: number;
  limiteRascunhosDia: number;
  sequencia?: { id: string; nome: string; status: string; aprovada: boolean };
};

export type VendedorNumeros = {
  fila: number;
  contatadosHoje: number;
  contatados7d: number;
  contatados30d: number;
  contatadosTotal: number;
  respostas: number;
  taxaResposta?: number; // %
  emNegociacao: number;
  ganhos: number;
  conversao?: number; // %
  perdidos: { motivo: string; quantidade: number }[];
  objecoes: { objecao: string; quantidade: number }[];
  aprovacoesPendentes: number;
  tempoMedioRespostaHoras?: number;
  custoIaHojeBrl: number;
  custoIaMesBrl: number;
  rascunhosHoje: number;
  emailsHoje: number;
};

export type VendedorPainel = VendedorResumo & { numeros: VendedorNumeros };

export type RascunhoVista = {
  id: string;
  vendedor: { id: string; nome: string };
  empresa: { id: string; nome: string; cidade?: string; etapa: string };
  canal: "email" | "whatsapp";
  status: RascunhoStatus;
  mensagem: { assunto?: string; texto: string; recebidaEm: string };
  texto: string;
  objecao: Objecao;
  etapaSugerida: EtapaSugerida;
  escalar?: { motivo: MotivoEscalar; rotulo: string };
  proximoContatoDias: number;
  criadoEm: string;
  erro?: string;
};

export type VendedoresPainel = {
  geral: VendedoresGeral;
  iaLigada: boolean;
  caixaConfigurada: boolean;
  leituraConfigurada: boolean;
  vendedores: VendedorPainel[];
};
