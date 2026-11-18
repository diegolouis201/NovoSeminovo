import { z } from "zod";

// Vendedores IA ("assistentes comerciais") da prospecção do Hub. Cada um tem
// nome próprio, se apresenta SEMPRE como "<Nome>, assistente comercial da
// NovoSeminovo" (nunca finge ser pessoa nem o dono) e usa uma caixa de e-mail
// (remetente). Só vendedor ativo, com caixa e sem pausa faz alguma coisa.

export const VENDEDOR_TITULO = "assistente comercial da NovoSeminovo";

// Caixas de e-mail conhecidas (lista fixa: o remetente de cada vendedor).
// Cada uma tem a sua configuração no .env (PROSPECCAO_<CHAVE>_SMTP_*; a
// "prospeccao" usa os nomes antigos PROSPECCAO_SMTP_*) e a senha no arquivo
// secrets/prospeccao_<chave>_smtp_password. Uma caixa nunca é de dois
// vendedores ativos ao mesmo tempo.
export const CAIXAS_EMAIL = {
  prospeccao: { endereco: "contato@novoseminovo.com.br" },
  atendimento: { endereco: "atendimento@novoseminovo.com.br" },
} as const;
export type VendedorCaixa = keyof typeof CAIXAS_EMAIL;
export const VENDEDOR_CAIXAS = Object.keys(CAIXAS_EMAIL) as [VendedorCaixa, ...VendedorCaixa[]];

// Segmento que cada vendedor atende (o mesmo `segment` do card no CRM).
// Vendedor sem segmento marcado atende todos. Imobiliária e corretor de
// imóveis são segmentos diferentes (decisão do marketing, 18/11/2026).
export const VENDEDOR_SEGMENTOS = { vehicle: "Lojas de veículos", property: "Imobiliárias", broker: "Corretores de imóveis", other: "Outros" } as const;
export type VendedorSegmento = keyof typeof VENDEDOR_SEGMENTOS;
export const VendedorSegmentoSchema = z.enum(Object.keys(VENDEDOR_SEGMENTOS) as [VendedorSegmento, ...VendedorSegmento[]]);
// Imóveis (imobiliária ou corretor) usam o roteiro de imóveis; o resto, o de lojas.
export const segmentoImoveis = (s?: string | null) => s === "property" || s === "broker";

// Os 5 vendedores do começo. Decisão do marketing (18/11/2026, troca a
// divisão anterior): Caio = lojas de veículos no atendimento@ (fica INATIVO
// até o dono ativar no Hub); Nina = imobiliárias e corretores no contato@;
// os outros entram quando ganharem um remetente próprio.
export const VENDEDORES_INICIAIS: readonly { slug: string; nome: string; feminino: boolean; ativo: boolean; caixa: VendedorCaixa | null; segmentos: readonly VendedorSegmento[] }[] = [
  { slug: "nina", nome: "Nina", feminino: true, ativo: true, caixa: "prospeccao", segmentos: ["property", "broker"] },
  { slug: "lara", nome: "Lara", feminino: true, ativo: false, caixa: null, segmentos: [] },
  { slug: "dani", nome: "Dani", feminino: true, ativo: false, caixa: null, segmentos: [] },
  { slug: "caio", nome: "Caio", feminino: false, ativo: false, caixa: "atendimento", segmentos: ["vehicle"] },
  { slug: "joao", nome: "João", feminino: false, ativo: false, caixa: null, segmentos: [] },
];

// Sequências criadas pelo marketing no Hub e o vendedor (remetente) de cada
// uma (decisão de 18/11/2026). O texto delas é do dono: o código nunca
// reescreve; só cria o rascunho se a sequência não existir.
export const SEQUENCIAS_DOS_VENDEDORES = [
  { nome: "Lojas BH", vendedor: "caio", padrao: false },
  { nome: "Caio: lojas de veículos", vendedor: "caio", padrao: true },
  { nome: "Nina: imobiliárias e corretores", vendedor: "nina", padrao: true },
] as const;

// Assinatura padrão (o dono pode trocar por vendedor no Hub).
export const assinaturaPadrao = (nome: string) => `${nome}, ${VENDEDOR_TITULO}`;
// Assinatura editada: uma linha, com o nome do vendedor e "assistente" (nunca
// se passa por pessoa), sem link nem HTML.
export const assinaturaValida = (nome: string, assinatura: string) =>
  assinatura.toLowerCase().includes(nome.toLowerCase()) && /assistente/i.test(assinatura) && !/[<>\r\n]|https?:|www\.|@/i.test(assinatura);

// Vendedor masculino? (só para concordância: "o Caio", "obrigado").
export const vendedorFeminino = (slug: string): boolean => VENDEDORES_INICIAIS.find((v) => v.slug === slug)?.feminino ?? true;

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
    // Ativar exige caixa configurada, caixa livre e primeira abordagem aprovada.
    ativo: z.boolean().optional(),
    // Lista vazia = atende todos os segmentos.
    segmentos: z
      .array(VendedorSegmentoSchema)
      .max(3)
      .refine((l) => new Set(l).size === l.length, "Segmento repetido.")
      .optional(),
    caixa: z.enum(VENDEDOR_CAIXAS).nullable().optional(),
    // Assinatura dos e-mails do vendedor (vazia = padrão). Conferida com o nome no serviço.
    assinatura: z.string().trim().max(120, "Assinatura: no máximo 120 caracteres.").optional(),
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
    segmento: z.enum(["vehicle", "property", "broker", "other"]).default("vehicle"),
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
  segmentos: VendedorSegmento[];
  assinatura: string;
  // Situação da caixa do vendedor (endereço, configurada ou o motivo).
  caixaStatus?: CaixaStatus;
  autonomia: VendedorAutonomia;
  noArDesde?: string;
  podeAutomatico: boolean;
  diasParaAutomatico: number;
  limiteEmailsDia: number;
  limiteRascunhosDia: number;
  sequencia?: { id: string; nome: string; status: string; aprovada: boolean };
};

export type CaixaStatus = {
  chave: VendedorCaixa;
  endereco: string;
  // Envio (SMTP) completo: host, usuário e senha no arquivo.
  configurada: boolean;
  // Por que não está configurada (sem nunca mostrar a senha).
  motivo?: string;
  // Leitura das respostas (IMAP) possível.
  leitura: boolean;
  // Vendedor ativo que usa esta caixa (nome e id: o Hub bloqueia a escolha
  // dela para os outros vendedores).
  vendedorAtivo?: string;
  vendedorAtivoId?: string;
};

// Página de um vendedor no Hub: números, últimas respostas e a situação de
// todas as caixas (para o dono escolher a caixa dele).
export type VendedorDetalhe = { vendedor: VendedorPainel; recentes: RascunhoVista[]; caixas: CaixaStatus[] };

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
  caixas: CaixaStatus[];
  // Empresas "a abordar" com e-mail que ficaram sem vendedor porque nenhum
  // vendedor ativo atende o segmento delas.
  semVendedor: { segmento: VendedorSegmento; rotulo: string; quantidade: number }[];
  vendedores: VendedorPainel[];
};

// ------------------------------------------------------------ arrumação das sequências
// Ação do dono (Hub): prévia primeiro, nada é enviado. Idempotente.
export type ArrumacaoSequencias = {
  aplicada: boolean;
  // Vendedor (remetente) de cada sequência do marketing.
  remetentes: { sequencia: string; existe: boolean; vendedorAntes?: string; vendedorDepois: string }[];
  // Segmento e caixa de cada vendedor do começo.
  vendedores: { nome: string; caixaAntes?: string; caixaDepois?: string; segmentosAntes: string[]; segmentosDepois: string[] }[];
  // Imobiliárias/corretores levados de "Caio: lojas de veículos" para "Nina: imobiliárias e corretores".
  movidasParaNina: number;
  // Empresas que estavam em "Caio: lojas" e também em "Lojas BH" (ficam só em "Lojas BH").
  tiradasPorLojasBh: number;
  // Cards que trocam de vendedor (veículos → Caio; imóveis → Nina).
  cardsTrocados: number;
  // Antes/depois: inscrições ativas por sequência.
  inscritasAntes: Record<string, number>;
  inscritasDepois: Record<string, number>;
  // Conflitos que precisam de você (ex.: já recebeu e-mail e não dá para mover; mesmo e-mail em duas caixas).
  conflitos: { empresa: string; motivo: string }[];
};
