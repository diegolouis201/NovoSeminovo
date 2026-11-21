import { z } from "zod";

// Prospecção pelo CRM do Hub: empresas encontradas no Mailerfind (busca do
// Google Maps) entram como cards "A abordar" e todo contato sai do Hub.

export const PROSPECCAO_ETIQUETA_PADRAO = "Prospecção BH - lojas de carros";
// Segmento do card + tipo de negócio.
export const PROSPECCAO_SEGMENTOS = {
  vehicle: { label: "Loja de veículos", businessType: "loja" },
  property: { label: "Imobiliária", businessType: "imobiliaria" },
  broker: { label: "Corretor de imóveis", businessType: "corretor" },
  other: { label: "Outro", businessType: "outro" },
} as const;
export type ProspeccaoSegmento = keyof typeof PROSPECCAO_SEGMENTOS;
export const segmentoLabel = (s?: string) => (s === "property" ? "Imobiliária" : s === "broker" ? "Corretor de imóveis" : s === "other" ? "Outro" : "Veículos");
export const ProspeccaoSegmentoSchema = z.enum(["vehicle", "property", "broker", "other"], { errorMap: () => ({ message: "Escolha o tipo de empresa." }) });

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
    segmento: z.enum(["vehicle", "property", "broker", "other"], { errorMap: () => ({ message: "Escolha o tipo de empresa." }) }),
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

// ------------------------------------------------------------ Sequências
// Sequência de e-mails de prospecção (até 3 passos). Só envia depois que o
// dono clica "Aprovar e ativar"; editar volta para rascunho.

export const PROSPECCAO_RODAPE = {
  antes: "Você recebeu este e-mail porque o contato da sua empresa está público no Google Maps. NovoSeminovo, DLRLVM Soluções Ltda., CNPJ 60.327.011/0001-02. Não quer receber mais?",
  link: "Clique aqui para sair",
  depois: "ou responda SAIR.",
} as const;

const PLACEHOLDER_ESTRANHO = /\{\{(?!\s*(empresa|cidade)\s*\}\})/;
const LINK_PERIGOSO = /\b(javascript|vbscript)\s*:|\bdata:\s*[a-z]+\/[a-z0-9.+-]+|\bfile:\/\//i;
const textoSequencia = (max: number, rotulo: string) =>
  z
    .string()
    .max(max, `${rotulo}: no máximo ${max.toLocaleString("pt-BR")} caracteres.`)
    .refine((v) => !PLACEHOLDER_ESTRANHO.test(v), "Use só {{empresa}} e {{cidade}} entre chaves duplas.")
    .refine((v) => !LINK_PERIGOSO.test(v), "Links só com http:// ou https://.");

export const ProspeccaoPassoSchema = z
  .object({
    assunto: textoSequencia(150, "Assunto").transform((v) => v.replace(/[\r\n]+/g, " ").trim()),
    corpo: textoSequencia(5000, "Texto").refine((v) => v.trim().length > 0, "Escreva o texto do e-mail."),
    esperaDias: z.number().int().min(0).max(30),
  })
  .strict();
export type ProspeccaoPasso = z.infer<typeof ProspeccaoPassoSchema>;

export const ProspeccaoSequenciaSchema = z
  .object({
    nome: z.string().trim().min(1, "Dê um nome para a sequência.").max(80),
    passos: z.array(ProspeccaoPassoSchema).min(1, "Pelo menos 1 e-mail.").max(3, "No máximo 3 e-mails."),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (!s.passos[0]?.assunto) ctx.addIssue({ code: "custom", message: "O 1º e-mail precisa de assunto.", path: ["passos", 0, "assunto"] });
    if (s.passos[0] && s.passos[0].esperaDias !== 0) ctx.addIssue({ code: "custom", message: "O 1º e-mail sai no dia da inscrição (espera 0).", path: ["passos", 0, "esperaDias"] });
    s.passos.slice(1).forEach((p, i) => {
      if (p.esperaDias < 1) ctx.addIssue({ code: "custom", message: "Espere de 1 a 30 dias entre os e-mails.", path: ["passos", i + 1, "esperaDias"] });
    });
  });
export type ProspeccaoSequenciaInput = z.infer<typeof ProspeccaoSequenciaSchema>;

export const ProspeccaoAjustesSchema = z
  .object({
    limiteDiario: z.number().int().min(1, "Mínimo 1 por dia.").max(50, "Máximo 50 por dia.").default(25),
    pausado: z.boolean().default(false),
  })
  .strict();
export type ProspeccaoAjustes = z.infer<typeof ProspeccaoAjustesSchema>;

// Inscrever empresas: por etiqueta, por tipo (loja/imobiliária/corretor)
// e/ou ids escolhidos na lista. Etiqueta + tipo = as duas condições.
export const ProspeccaoInscreverSchema = z
  .object({
    etiqueta: ProspeccaoEtiquetaSchema.optional(),
    segmento: z.enum(["vehicle", "property", "broker", "other"]).optional(),
    ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(5000).optional(),
  })
  .strict()
  .refine((v) => v.etiqueta || v.segmento || v.ids?.length, "Escolha a etiqueta, o tipo ou as empresas.");

// Tirar empresas de uma sequência (uma ou várias). Nada é enviado.
export const ProspeccaoRemoverSchema = z
  .object({ ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).min(1, "Escolha as empresas.").max(5000) })
  .strict();

// Recolocar na fila as inscrições que pararam por falha TEMPORÁRIA do SMTP
// (4xx, conexão caiu). O dono confirma depois de ver quantas são.
export const ProspeccaoReenviarFalhasSchema = z.object({ confirmo: z.literal(true) }).strict();

// Remetente (vendedor IA) da sequência: só o dono troca.
export const ProspeccaoRemetenteSchema = z.object({ vendedorId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).nullable() }).strict();

// Tipo do card (o Comercial corrige quando a importação errou).
export const ProspeccaoCardSegmentoSchema = z.object({ segmento: z.enum(["vehicle", "property", "broker", "other"]) }).strict();

export const PROSPECCAO_STATUS = {
  agendado: "Agendado",
  enviando: "Enviando",
  concluido: "Sequência completa",
  respondeu: "Respondeu",
  saiu: "Saiu (não quer receber)",
  parou: "Parou",
  erro: "Erro",
} as const;
export const PROSPECCAO_MOTIVO_PARADA = {
  respondeu: "Respondeu",
  saiu: "Pediu para sair",
  mudou_etapa: "Mudou de etapa no funil",
  virou_parceira: "Virou parceira do site",
  sem_email: "Sem e-mail",
  email_invalido: "E-mail voltou (endereço inválido)",
  removida: "Retirada da sequência",
  outra_caixa: "O mesmo e-mail já foi contatado por outra caixa",
  movida: "Levada para outra sequência",
} as const;

export type ProspeccaoSequencia = {
  id: string;
  nome: string;
  status: "rascunho" | "ativa" | "pausada";
  passos: ProspeccaoPasso[];
  aprovadaPor?: string;
  aprovadaEm?: string;
  atualizadaEm: string;
  inscritas: Record<string, number>;
  // Vendedor IA que manda os e-mails desta sequência (nome e caixa).
  remetente?: { vendedorId: string; nome: string; caixa?: string; endereco?: string };
};
export type ProspeccaoInscricao = {
  id: string;
  empresa: string;
  cardId: string;
  segmento?: string;
  status: keyof typeof PROSPECCAO_STATUS;
  passosEnviados: number;
  proximoEnvio?: string;
  ultimoEnvio?: string;
  motivo?: string;
  erro?: string;
  // Falhas temporárias seguidas no passo atual (nova tentativa já agendada).
  tentativas?: number;
};
export type ProspeccaoPainel = {
  ajustes: ProspeccaoAjustes;
  enviadosHoje: number;
  smtpConfigurado: boolean;
  remetente?: string;
  rotinaDesligada: boolean;
  sequencias: ProspeccaoSequencia[];
};

// Rascunho aprovado em princípio pelo Diego (textos dele, não mudar sem ele).
const LINK_COMECAR = "https://novoseminovo.com.br/para-lojas/comecar?utm_source=prospeccao&utm_medium=email&utm_campaign=prospeccao-lojas-bh";
export const SEQUENCIA_LOJAS_BH: ProspeccaoSequenciaInput = {
  nome: "Lojas BH",
  passos: [
    {
      assunto: "Estoque da {{empresa}} no NovoSeminovo, 3 meses grátis",
      corpo: `Olá, tudo bem?\n\nSou o Diego, do NovoSeminovo, um marketplace nacional de carros e imóveis. Encontrei a loja de vocês no Google Maps e queria fazer um convite rápido.\n\nEstamos abrindo espaço para lojas de seminovos anunciarem o estoque 3 meses grátis, sem limite de anúncios e sem fidelidade. Além do anúncio, cada carro ganha:\n- Vitrine pronta: imagem para Instagram e WhatsApp e cartaz com QR code para o vidro;\n- Importação pelo link: se vocês já anunciam em outro site, é só colar o link que a gente organiza tudo;\n- Painel de leads, para ver quem chamou e responder rápido.\n\nDá uma olhada aqui: ${LINK_COMECAR}\n\nSe fizer sentido, é só responder este e-mail que eu ajudo a subir os primeiros carros.\n\nAbraço,\nDiego Louis, NovoSeminovo`,
      esperaDias: 0,
    },
    {
      assunto: "",
      corpo: "Oi, passando só para facilitar: se quiserem testar, a gente ajuda a subir os primeiros carros de vocês a partir do link de outro site. Vocês só revisam e aprovam.\n\nLeva uns 10 minutos de vocês. Respondo por aqui ou pelo WhatsApp, como preferirem.\n\nDiego",
      esperaDias: 3,
    },
    {
      assunto: "",
      corpo: `Último contato sobre isso, prometo. 🙂\n\nSe agora não for o momento, sem problema. Os 3 meses grátis continuam valendo quando quiserem começar: ${LINK_COMECAR}\n\nObrigado pela atenção,\nDiego, NovoSeminovo`,
      esperaDias: 4,
    },
  ],
};
