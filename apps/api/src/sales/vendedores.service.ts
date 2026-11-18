import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, ProspectMessage, ProspectReplyDraft, SalesAgent, SalesProspect } from "@novoseminovo/db";
import {
  AprovarRascunhoSchema,
  MOTIVOS_ESCALAR,
  RejeitarRascunhoSchema,
  SALES_STAGE_LABEL,
  VENDEDORES_INICIAIS,
  VENDEDOR_TITULO,
  VendedorAjustesSchema,
  VendedoresGeralSchema,
  OBJECOES,
  type EtapaSugerida,
  type MotivoEscalar,
  type Objecao,
  type ProspeccaoSequenciaInput,
  type RascunhoVista,
  type VendedorAjustes,
  type VendedorAutonomia,
  type VendedorPainel,
  type VendedoresGeral,
  type VendedoresPainel,
} from "@novoseminovo/shared-types";
import { z } from "zod";
import { runAgentTurn } from "../agents/agent-engine";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { parseOrBadRequest } from "../common/parse";
import { webOrigin } from "../marketing/links";
import { NotificationsService } from "../notifications/notifications.service";
import { aiContext, trackedAnthropic } from "../operations/ai-usage";
import { trackRoutine } from "../operations/routine-health";
import { AGENT_FEATURE_PREFIX, UsageService, brtDayStart } from "../operations/usage.service";
import { PrismaService } from "../prisma/prisma.service";
import { caixaImap, lerEmail, prospeccaoImapConfig, type CaixaEntrada, type EmailBruto, type EmailLido } from "../prospeccao/caixa-entrada";
import { renderizarEmail } from "../prospeccao/sequencia-regras";
import { ProspeccaoSequenciasService } from "../prospeccao/sequencias.service";
import { criarEnvio, prospeccaoSmtpConfig, semSenha, type EnviarProspeccao } from "../prospeccao/smtp";
import { FERRAMENTA_RASCUNHO, PLAYBOOK_VERSAO, linkComecar, pedidoVendedor, sistemaVendedor } from "./playbook-vendedor";
import {
  categoriaPerda,
  classificarEntrada,
  dentroDoHorarioRespostas,
  diasParaAutomatico,
  distribuirRodizio,
  etapaDestino,
  extrairWhatsapp,
  finalizarRascunho,
  limparCorpo,
  motivoEscalar,
  numerosDoVendedor,
  pedidoDeSaida,
  podeAutomatico,
  saiSozinho,
} from "./vendedor-regras";
import { envioWhatsapp, registrarRotaProspeccao, type EnviarWhatsapp } from "./whatsapp-ponte";

// Vendedores IA ("assistentes comerciais") da prospecção. Regras do Diego:
// - automático: distribuir as empresas importadas (rodízio entre vendedores
//   ativos com caixa) e a primeira sequência de e-mails (aprovada pelo dono);
// - respostas: a IA só escreve RASCUNHO. Nos primeiros 14 dias no ar (e
//   sempre que o vendedor está em "supervisionado") o dono aprova, edita ou
//   rejeita no Hub. Depois, o dono pode ligar o "automático" para as
//   respostas de rotina; o resto continua com ele;
// - passa para uma pessoa (tarefa + aviso) quando pedem desconto/condição,
//   reclamam, falam de LGPD/jurídico, financiamento, pedem ligação/reunião,
//   são agressivos ou quando a IA não tem certeza;
// - SAIR / me tire da lista: sai na hora, sem IA;
// - WhatsApp só com quem autorizou; nunca liga (cria tarefa para a pessoa);
// - "ganho" só pelo cadastro no site (SalesService.linkSignup), nunca pela IA.

const GERAL = "vendedores_ia";
const ESTADO_IMAP = "prospeccao_imap";
const ROTINA_MS = 5 * 60_000;
const LOTE_CAIXA = 50;
const CRIADO_POR = "vendedor-ia";
const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");

export type ResultadoCaixa = { respostas: number; aquecimento: number; automaticas: number; devolvidos: number; saidas: number; ignorados: number; repetidos: number };
type Escopo = { somenteVendedores?: string[] };
type CardComVendedor = SalesProspect & { salesAgent: SalesAgent | null };

// Texto da primeira abordagem de cada vendedor (assinada por ele, nunca pelo
// dono). Passa pela aprovação do dono como qualquer sequência.
export function sequenciaDoVendedor(v: { nome: string; slug: string }): ProspeccaoSequenciaInput {
  const link = linkComecar(v.slug);
  const assinatura = `${v.nome}, ${VENDEDOR_TITULO}`;
  return {
    nome: `${v.nome}: primeira abordagem`,
    passos: [
      {
        assunto: "Estoque da {{empresa}} no NovoSeminovo, 3 meses grátis",
        corpo: `Olá, tudo bem?\n\nSou a ${v.nome}, assistente comercial (virtual) da NovoSeminovo, um marketplace nacional de carros e imóveis. Encontrei a {{empresa}} no Google Maps e queria fazer um convite rápido.\n\nEstamos abrindo espaço para lojas anunciarem o estoque 3 meses grátis, sem limite de anúncios e sem fidelidade. Além do anúncio, cada carro ganha:\n- Vitrine pronta: imagem para Instagram e WhatsApp e cartaz com QR code para o vidro;\n- Importação pelo link: se vocês já anunciam em outro site, é só colar o link que a gente organiza tudo;\n- Painel de leads, para ver quem chamou e responder rápido.\n\nDá uma olhada aqui: ${link}\n\nSe fizer sentido, é só responder este e-mail que a nossa equipe ajuda a subir os primeiros carros.\n\n${assinatura}`,
        esperaDias: 0,
      },
      {
        assunto: "",
        corpo: `Oi, passando só para facilitar: se quiserem testar, a nossa equipe ajuda a subir os primeiros carros a partir do link de outro site. Vocês só revisam e aprovam.\n\nÉ só responder este e-mail.\n\n${assinatura}`,
        esperaDias: 3,
      },
      {
        assunto: "",
        corpo: `Último contato sobre isso. Se agora não for o momento, sem problema: os 3 meses grátis continuam valendo quando quiserem começar: ${link}\n\nObrigada pela atenção,\n${assinatura}`,
        esperaDias: 4,
      },
    ],
  };
}

@Injectable()
export class VendedoresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Vendedores IA");
  private readonly usage: UsageService;
  private timer?: NodeJS.Timeout;
  private rodando = false;
  private caixaDeTeste?: CaixaEntrada;
  private envioDeTeste?: EnviarProspeccao;
  private modeloDeTeste?: Anthropic;
  private whatsDeTeste?: EnviarWhatsapp;
  private cliente?: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequencias: ProspeccaoSequenciasService,
    private readonly notificacoes: NotificationsService,
  ) {
    this.usage = new UsageService(prisma);
  }

  // Testes trocam caixa, SMTP, modelo e WhatsApp (nada de verdade sai).
  usarCaixa(c: CaixaEntrada | undefined) {
    this.caixaDeTeste = c;
  }
  usarEnvio(e: EnviarProspeccao | undefined) {
    this.envioDeTeste = e;
  }
  usarModelo(m: Anthropic | undefined) {
    this.modeloDeTeste = m;
  }
  usarWhatsapp(w: EnviarWhatsapp | undefined) {
    this.whatsDeTeste = w;
  }

  private desligada(): boolean {
    return process.env.NODE_ENV === "test" || process.env.PROSPECCAO_DISABLED === "1";
  }

  private modelo(): Anthropic | undefined {
    if (this.modeloDeTeste) return this.modeloDeTeste;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return undefined;
    this.cliente ??= trackedAnthropic("agente:vendedor", apiKey);
    return this.cliente;
  }

  private whatsapp(): EnviarWhatsapp | undefined {
    return this.whatsDeTeste ?? envioWhatsapp();
  }

  // ------------------------------------------------------------ ajustes

  async geral(): Promise<VendedoresGeral> {
    const r = await this.prisma.mktSetting.findUnique({ where: { chave: GERAL } });
    return VendedoresGeralSchema.catch({ pausarTodos: false, confirmarSaida: false }).parse(r?.valor ?? {});
  }

  async salvarGeral(raw: unknown): Promise<VendedoresGeral> {
    const valor = parseOrBadRequest(VendedoresGeralSchema as z.ZodType<VendedoresGeral>, raw);
    await this.prisma.mktSetting.upsert({ where: { chave: GERAL }, create: { chave: GERAL, valor }, update: { valor } });
    return valor;
  }

  private async vendedor(id: string): Promise<SalesAgent> {
    const v = await this.prisma.salesAgent.findUnique({ where: { id: parseOrBadRequest(IdSchema, id) } });
    if (!v) throw new NotFoundException("Vendedor não encontrado.");
    return v;
  }

  // Só o dono (permissão "equipe", conferida no controller).
  async ajustar(id: string, raw: VendedorAjustes, agora = new Date()): Promise<void> {
    const v = await this.vendedor(id);
    const a = parseOrBadRequest(VendedorAjustesSchema, raw);
    if (a.autonomia === "automatico" && v.autonomy !== "automatico" && !podeAutomatico(v.liveSince, agora)) {
      throw new BadRequestException(`O modo automático só pode ser ligado depois de 14 dias no ar (faltam ${diasParaAutomatico(v.liveSince, agora)} dia(s)).`);
    }
    await this.prisma.salesAgent.update({
      where: { id: v.id },
      data: {
        ...(a.autonomia ? { autonomy: a.autonomia } : {}),
        ...(a.pausado !== undefined ? { paused: a.pausado } : {}),
        ...(a.limiteEmailsDia ? { dailyEmailCap: a.limiteEmailsDia } : {}),
        ...(a.limiteRascunhosDia ? { dailyDraftCap: a.limiteRascunhosDia } : {}),
      },
    });
  }

  // ------------------------------------------------------------ vendedores

  // Os 5 do começo (Nina ativa com o contato@; os outros sem caixa). Idempotente.
  async garantirVendedores(agora = new Date()): Promise<void> {
    for (const v of VENDEDORES_INICIAIS) {
      const existe = await this.prisma.salesAgent.findUnique({ where: { slug: v.slug } });
      if (existe) continue;
      try {
        await this.prisma.salesAgent.create({ data: { slug: v.slug, name: v.nome, active: v.ativo, mailbox: v.caixa, liveSince: v.ativo ? agora : null } });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    const ativos = await this.prisma.salesAgent.findMany({ where: { active: true, mailbox: { not: null }, sequenceId: null }, select: { id: true } });
    for (const a of ativos) await this.garantirSequenciaDoVendedor(a.id);
  }

  async garantirSequenciaDoVendedor(id: string): Promise<string> {
    const v = await this.vendedor(id);
    if (v.sequenceId && (await this.prisma.prospectSequence.findUnique({ where: { id: v.sequenceId }, select: { id: true } }))) return v.sequenceId;
    const s = sequenciaDoVendedor({ nome: v.name, slug: v.slug });
    const criada = await this.prisma.prospectSequence.create({ data: { name: s.nome, status: "rascunho", steps: s.passos as Prisma.InputJsonValue, createdById: CRIADO_POR } });
    await this.prisma.salesAgent.update({ where: { id: v.id }, data: { sequenceId: criada.id } });
    return criada.id;
  }

  // Vendedor que pode trabalhar agora: ativo, com caixa, sem pausa (nem geral).
  private async elegiveis(escopo: Escopo = {}): Promise<SalesAgent[]> {
    if ((await this.geral()).pausarTodos) return [];
    return this.prisma.salesAgent.findMany({
      where: { active: true, paused: false, mailbox: { not: null }, ...(escopo.somenteVendedores ? { id: { in: escopo.somenteVendedores } } : {}) },
      orderBy: { createdAt: "asc" },
    });
  }

  // ------------------------------------------------------------ rodízio

  async distribuir(agora = new Date(), opcoes: Escopo & { somenteCards?: string[] } = {}): Promise<{ atribuidas: number; inscritas: number }> {
    const vendedores = await this.elegiveis(opcoes);
    if (!vendedores.length) return { atribuidas: 0, inscritas: 0 };
    const cards = await this.prisma.salesProspect.findMany({
      where: {
        salesAgentId: null,
        stage: "a_abordar",
        partnerId: null,
        email: { not: null },
        emailInvalidAt: null,
        optedOutAt: null,
        repliedAt: null,
        enrollments: { none: { activeKey: { not: null } } },
        ...(opcoes.somenteCards ? { id: { in: opcoes.somenteCards } } : {}),
      },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (!cards.length) return { atribuidas: 0, inscritas: 0 };
    const hashes = cards.map((c) => blindIndex("email", c.email!, currentDataKeys()));
    const suprimidos = new Set((await this.prisma.prospectSuppression.findMany({ where: { addressHmac: { in: hashes } }, select: { addressHmac: true } })).map((r) => r.addressHmac));
    const naoContatar = new Set((await this.prisma.hubMark.findMany({ where: { key: { in: cards.map((c) => c.id) }, naoContatar: true }, select: { key: true } })).map((m) => m.key));
    const livres = cards.filter((c, i) => !suprimidos.has(hashes[i]!) && !naoContatar.has(c.id)).map((c) => c.id);
    const carga = await this.prisma.salesProspect.groupBy({ by: ["salesAgentId"], where: { salesAgentId: { in: vendedores.map((v) => v.id) } }, _count: { _all: true } });
    const mapa = distribuirRodizio(
      livres,
      vendedores.map((v) => ({ id: v.id, carga: carga.find((c) => c.salesAgentId === v.id)?._count._all ?? 0 })),
    );
    let atribuidas = 0;
    let inscritas = 0;
    for (const v of vendedores) {
      const meus = [...mapa].filter(([, vid]) => vid === v.id).map(([cid]) => cid);
      if (!meus.length) continue;
      const r = await this.prisma.salesProspect.updateMany({ where: { id: { in: meus }, salesAgentId: null }, data: { salesAgentId: v.id } });
      atribuidas += r.count;
      const seq = await this.garantirSequenciaDoVendedor(v.id);
      inscritas += (await this.sequencias.inscrever(seq, { ids: meus }, CRIADO_POR, agora)).inscritas;
    }
    return { atribuidas, inscritas };
  }

  // ------------------------------------------------------------ caixa de entrada

  private caixa(): CaixaEntrada | undefined {
    if (this.caixaDeTeste) return this.caixaDeTeste;
    const cfg = prospeccaoImapConfig();
    return cfg ? caixaImap(cfg) : undefined;
  }

  async lerCaixa(agora = new Date(), escopo: Escopo = {}): Promise<ResultadoCaixa | "sem_caixa"> {
    const caixa = this.caixa();
    if (!caixa) return "sem_caixa";
    const estado = ((await this.prisma.mktSetting.findUnique({ where: { chave: ESTADO_IMAP } }))?.valor ?? {}) as { uid?: number; uidValidity?: string };
    const lote = await caixa.novas({ uid: estado.uid, uidValidity: estado.uidValidity, data: new Date(agora.getTime() - 14 * 86_400_000) }, LOTE_CAIXA);
    const r = await this.processarFontes(lote.emails, agora, escopo);
    const valor = { uid: lote.maiorUid, uidValidity: lote.uidValidity };
    await this.prisma.mktSetting.upsert({ where: { chave: ESTADO_IMAP }, create: { chave: ESTADO_IMAP, valor }, update: { valor } });
    return r;
  }

  async processarFontes(emails: EmailBruto[], agora = new Date(), escopo: Escopo = {}): Promise<ResultadoCaixa> {
    const r: ResultadoCaixa = { respostas: 0, aquecimento: 0, automaticas: 0, devolvidos: 0, saidas: 0, ignorados: 0, repetidos: 0 };
    for (const e of emails) {
      try {
        const lido = await lerEmail(e.fonte);
        const tipo = await this.processarEmail(lido, agora, escopo);
        r[tipo]++;
      } catch (error) {
        this.logger.warn(`E-mail ${e.uid} não pôde ser lido: ${error instanceof Error ? error.message.slice(0, 200) : error}`);
        r.ignorados++;
      }
    }
    return r;
  }

  // Card do e-mail: pela conversa (nossos Message-ID no In-Reply-To/References)
  // ou pelo remetente, só se já mandamos e-mail para ele.
  private async cardDoEmail(lido: EmailLido, devolvido: boolean): Promise<CardComVendedor | null> {
    const incluir = { salesAgent: true } as const;
    const ids = devolvido ? lido.idsNossosCitados : [lido.inReplyTo, ...lido.referencias].filter((x): x is string => Boolean(x));
    if (ids.length) {
      const log = await this.prisma.prospectEmailLog.findFirst({ where: { messageId: { in: ids } }, select: { enrollment: { select: { prospectId: true } } } });
      const msg = log ? null : await this.prisma.prospectMessage.findFirst({ where: { messageId: { in: ids }, direction: "out" }, select: { prospectId: true } });
      const id = log?.enrollment.prospectId ?? msg?.prospectId;
      if (id) return this.prisma.salesProspect.findUnique({ where: { id }, include: incluir });
    }
    const endereco = devolvido ? lido.destinatarioFalhou : lido.de;
    if (!endereco || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco)) return null;
    const card = await this.prisma.salesProspect.findFirst({ where: { email: endereco.toLowerCase() }, include: incluir, orderBy: { createdAt: "asc" } });
    if (!card) return null;
    const contatado = (await this.prisma.prospectEmailLog.count({ where: { enrollment: { prospectId: card.id }, status: "enviado" } })) + (await this.prisma.prospectMessage.count({ where: { prospectId: card.id, direction: "out" } }));
    return contatado ? card : null;
  }

  async processarEmail(lido: EmailLido, agora: Date, escopo: Escopo = {}): Promise<keyof ResultadoCaixa> {
    const etiquetas = (process.env.PROSPECCAO_WARMUP_TAGS ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const tipo = classificarEntrada({ de: lido.de, assunto: lido.assunto, texto: lido.texto, cabecalhos: lido.cabecalhos }, { etiquetasAquecimento: etiquetas });
    if (tipo === "aquecimento") return "aquecimento";
    const card = await this.cardDoEmail(lido, tipo === "devolvido");
    if (!card) return "ignorados";
    if (escopo.somenteVendedores && card.salesAgentId && !escopo.somenteVendedores.includes(card.salesAgentId)) return "ignorados";
    if (lido.messageId && (await this.prisma.prospectMessage.findUnique({ where: { messageId: lido.messageId }, select: { id: true } }))) return "repetidos";

    if (tipo === "devolvido") {
      await this.prisma.salesProspect.update({ where: { id: card.id }, data: { emailInvalidAt: card.emailInvalidAt ?? agora } });
      await this.prisma.prospectEnrollment.updateMany({ where: { prospectId: card.id, status: { in: ["agendado", "enviando"] } }, data: { status: "parou", stopReason: "email_invalido", activeKey: null, nextSendAt: null } });
      await this.nota(card.id, "note", "O e-mail de prospecção voltou (endereço inválido ou caixa cheia). Nenhum e-mail sai mais para este endereço.");
      return "devolvidos";
    }
    if (tipo === "automatica") {
      await this.nota(card.id, "note", "Chegou uma resposta automática (fora do escritório ou parecida). A sequência continua.");
      return "automaticas";
    }

    const texto = limparCorpo(lido.texto);
    const vendedorId = card.salesAgentId ?? (await this.adotar(card.id, escopo));
    const msg = await this.prisma.prospectMessage.create({
      data: {
        prospectId: card.id,
        salesAgentId: vendedorId,
        channel: "email",
        direction: "in",
        kind: "resposta",
        messageId: lido.messageId?.slice(0, 300),
        subject: lido.assunto.slice(0, 300),
        body: texto || "(mensagem sem texto)",
        references: [...lido.referencias, lido.messageId].filter(Boolean).join(" ").slice(-2000),
        receivedAt: agora,
      },
    });
    await this.respondeu(card, "email", agora);

    if (pedidoDeSaida(texto)) {
      await this.saida(card, msg, agora);
      return "saidas";
    }
    const whats = extrairWhatsapp(texto, card.phone);
    if (whats) await this.optInWhatsapp(card, whats.numero, msg, agora);
    await this.depoisDaEntrada(card.id, msg, texto, agora, escopo);
    return "respostas";
  }

  // Resposta de empresa que veio de sequência sem vendedor (ex.: a do dono):
  // fica com um vendedor elegível (o de menos carga).
  private async adotar(cardId: string, escopo: Escopo): Promise<string | null> {
    const vendedores = await this.elegiveis(escopo);
    if (!vendedores.length) return null;
    const carga = await this.prisma.salesProspect.groupBy({ by: ["salesAgentId"], where: { salesAgentId: { in: vendedores.map((v) => v.id) } }, _count: { _all: true } });
    const escolhido = distribuirRodizio([cardId], vendedores.map((v) => ({ id: v.id, carga: carga.find((c) => c.salesAgentId === v.id)?._count._all ?? 0 }))).get(cardId)!;
    await this.prisma.salesProspect.update({ where: { id: cardId }, data: { salesAgentId: escolhido } });
    return escolhido;
  }

  // Regra fixa: respondeu → para toda sequência; "a abordar" → "em contato".
  private async respondeu(card: SalesProspect, canal: string, agora: Date) {
    await this.prisma.prospectEnrollment.updateMany({ where: { prospectId: card.id, status: { in: ["agendado", "enviando"] } }, data: { status: "respondeu", stopReason: "respondeu", activeKey: null, nextSendAt: null } });
    const para = card.partnerId ? undefined : etapaDestino(card.stage, "contatado");
    await this.prisma.salesProspect.update({ where: { id: card.id }, data: { repliedAt: card.repliedAt ?? agora, ...(para ? { stage: para as SalesProspect["stage"] } : {}) } });
    if (para) await this.prisma.salesNote.create({ data: { prospectId: card.id, kind: "stage", fromStage: card.stage, toStage: para, body: `Respondeu por ${canal === "whatsapp" ? "WhatsApp" : "e-mail"}: passou para "${SALES_STAGE_LABEL[para as keyof typeof SALES_STAGE_LABEL]}".` } });
    await this.nota(card.id, canal === "whatsapp" ? "whatsapp" : "email", `A empresa respondeu por ${canal === "whatsapp" ? "WhatsApp" : "e-mail"} (mensagem em Hub → Vendedores IA). A sequência de e-mails parou.`);
  }

  private async nota(prospectId: string, kind: string, body: string) {
    await this.prisma.salesNote.create({ data: { prospectId, kind, body: body.slice(0, 2000) } });
  }

  private async saida(card: CardComVendedor, msg: ProspectMessage, agora: Date) {
    await this.prisma.salesProspect.update({
      where: { id: card.id },
      data: { optedOutAt: card.optedOutAt ?? agora, ...(card.partnerId ? {} : { stage: "perdida", lostCategory: "pediu_para_sair", lostReason: "Pediu para sair respondendo o e-mail de prospecção." }) },
    });
    if (card.email) {
      const h = blindIndex("email", card.email, currentDataKeys());
      await this.prisma.prospectSuppression.upsert({ where: { addressHmac: h }, create: { addressHmac: h, reason: "resposta" }, update: {} });
    }
    await this.prisma.prospectEnrollment.updateMany({ where: { prospectId: card.id, status: { in: ["agendado", "enviando"] } }, data: { status: "saiu", stopReason: "saiu", activeKey: null, nextSendAt: null } });
    await this.prisma.prospectReplyDraft.updateMany({ where: { prospectId: card.id, status: { in: ["pendente", "escalado", "aprovado"] } }, data: { status: "descartado" } });
    await this.prisma.prospectMessage.update({ where: { id: msg.id }, data: { kind: "saida" } });
    if (!card.partnerId && card.stage !== "perdida") await this.prisma.salesNote.create({ data: { prospectId: card.id, kind: "stage", fromStage: card.stage, toStage: "perdida", body: "Pediu para sair (respondeu o e-mail). Entrou na lista de bloqueio: nenhum e-mail de prospecção sai mais para este endereço." } });
    if ((await this.geral()).confirmarSaida && card.email && card.salesAgent) {
      const texto = `Pronto, tiramos o seu e-mail da nossa lista: você não vai mais receber e-mails de prospecção da NovoSeminovo. Obrigada pela atenção.\n\n${card.salesAgent.name}, ${VENDEDOR_TITULO}`;
      await this.enviarEmail(card, card.salesAgent, msg, texto, agora, { semRodape: true }).catch((error) => this.logger.warn(`Confirmação de saída não saiu: ${String(error).slice(0, 200)}`));
    }
  }

  private async optInWhatsapp(card: SalesProspect, numero: string, msg: ProspectMessage, agora: Date) {
    await this.prisma.salesProspect.update({ where: { id: card.id }, data: { whatsapp: numero, whatsappOptInAt: agora, whatsappOptInMessageId: msg.id } });
    await this.nota(card.id, "whatsapp", `A empresa autorizou continuar pelo WhatsApp (mensagem de ${agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}).`);
    // A primeira mensagem no WhatsApp é de uma pessoa (a API da Meta só deixa
    // o número da empresa começar conversa com modelo aprovado).
    await this.tarefa(card, `Chamar ${card.name} no WhatsApp`, "whatsapp", `A empresa pediu para continuar pelo WhatsApp: ${numero}. Mande a primeira mensagem; quando ela responder lá, a assistente continua com a sua aprovação.`, agora);
  }

  private async tarefa(card: { id: string; name: string }, titulo: string, tipo: "tarefa" | "ligacao" | "whatsapp" | "email", notas: string, agora: Date) {
    const aberta = await this.prisma.hubTask.findFirst({ where: { prospectId: card.id, title: titulo.slice(0, 200), doneAt: null }, select: { id: true } });
    if (aberta) return;
    await this.prisma.hubTask.create({ data: { title: titulo.slice(0, 200), kind: tipo, dueAt: agora, notes: notas.slice(0, 2000), prospectId: card.id, createdById: CRIADO_POR } });
  }

  private async avisarDono(titulo: string, corpo: string) {
    const donos = await this.prisma.user.findMany({ where: { status: "active", OR: [{ role: "admin" }, { hubMember: { profile: "dono", active: true } }] }, select: { id: true }, take: 10 });
    for (const d of donos) await this.notificacoes.notify(d.id, "ops_alert", { title: titulo, body: corpo }).catch(() => undefined);
  }

  private async escalar(card: SalesProspect, motivo: MotivoEscalar, agora: Date, vendedor?: { name: string } | null) {
    const rotulo = MOTIVOS_ESCALAR[motivo];
    if (motivo === "ligacao") await this.tarefa(card, `Ligar para ${card.name}`, "ligacao", "A empresa pediu ligação ou reunião. A assistente não liga: combine pelo telefone do card.", agora);
    else await this.tarefa(card, `Responder ${card.name}: ${rotulo.toLowerCase()}`, "email", `A assistente não responde sozinha neste caso (${rotulo}). Veja a mensagem em Hub → Vendedores IA → Respostas para aprovar.`, agora);
    await this.avisarDono(`${vendedor?.name ?? "Assistente comercial"} precisa de você`, `${card.name}: ${rotulo}. Abra o Hub → Vendedores IA → Respostas para aprovar.`);
  }

  // Depois de guardar a mensagem: passa para uma pessoa (regra fixa) ou pede rascunho.
  private async depoisDaEntrada(cardId: string, msg: ProspectMessage, texto: string, agora: Date, escopo: Escopo) {
    const card = await this.prisma.salesProspect.findUniqueOrThrow({ where: { id: cardId }, include: { salesAgent: true } });
    const motivo = motivoEscalar(texto);
    if (motivo) {
      if (card.salesAgentId) await this.criarRascunho(card, msg, { texto: "", objecao: "outra", etapa: "manter", escalar: motivo, followupDias: 1 }, agora);
      else await this.escalar(card, motivo, agora);
      return;
    }
    await this.prisma.prospectMessage.update({ where: { id: msg.id }, data: { needsDraft: true } });
    await this.redigir(msg.id, agora, escopo);
  }

  async redigirPendentes(agora = new Date(), escopo: Escopo = {}): Promise<number> {
    const pendentes = await this.prisma.prospectMessage.findMany({
      where: { needsDraft: true, direction: "in", ...(escopo.somenteVendedores ? { salesAgentId: { in: escopo.somenteVendedores } } : {}) },
      orderBy: { receivedAt: "asc" },
      take: 20,
      select: { id: true },
    });
    let feitos = 0;
    for (const p of pendentes) if (await this.redigir(p.id, agora, escopo)) feitos++;
    return feitos;
  }

  // Rascunho da IA. Sem vendedor elegível, sem orçamento ou no teto do dia,
  // a mensagem espera (needsDraft). Sem IA no servidor: vira resposta à mão.
  private async redigir(msgId: string, agora: Date, escopo: Escopo): Promise<boolean> {
    const msg = await this.prisma.prospectMessage.findUnique({ where: { id: msgId }, include: { prospect: { include: { salesAgent: true } }, drafts: { select: { id: true } } } });
    if (!msg || !msg.needsDraft) return false;
    if (msg.drafts.length) {
      await this.prisma.prospectMessage.update({ where: { id: msgId }, data: { needsDraft: false } });
      return false;
    }
    const card = msg.prospect;
    const v = card.salesAgent;
    if (!v || !(await this.elegiveis(escopo)).some((e) => e.id === v.id)) return false;
    if (card.optedOutAt) {
      await this.prisma.prospectMessage.update({ where: { id: msgId }, data: { needsDraft: false } });
      return false;
    }
    // Teto de rascunhos da IA por dia (os que foram para o dono por regra fixa não contam).
    const hoje = await this.prisma.prospectReplyDraft.count({ where: { salesAgentId: v.id, createdAt: { gte: brtDayStart(agora) }, OR: [{ escalateReason: null }, { escalateReason: { in: ["fora_do_roteiro", "incerto"] } }] } });
    if (hoje >= v.dailyDraftCap) return false;
    const cliente = this.modelo();
    if (!cliente) {
      await this.criarRascunho(card, msg, { texto: "", objecao: "outra", etapa: "manter", escalar: "ia_desligada", followupDias: 1 }, agora);
      return true;
    }
    if (!this.modeloDeTeste && !(await this.usage.canSpend(agora))) return false;

    const historico = await this.prisma.prospectMessage.findMany({ where: { prospectId: card.id, id: { not: msg.id } }, orderBy: { createdAt: "asc" }, take: 10 });
    const notas = (await this.prisma.prospectReplyDraft.findMany({ where: { salesAgentId: v.id, status: "rejeitado", rejectReason: { not: null } }, orderBy: { decidedAt: "desc" }, take: 10, select: { rejectReason: true } })).map((r) => r.rejectReason!);
    let bruto: unknown;
    try {
      await aiContext.run({ feature: `${AGENT_FEATURE_PREFIX}vendedor:${v.slug}` }, () =>
        runAgentTurn(
          cliente,
          {
            system: sistemaVendedor({ nome: v.name, slug: v.slug }, notas),
            maxTokens: 1200,
            maxToolRounds: 1,
            tools: [
              {
                definition: FERRAMENTA_RASCUNHO,
                run: async (input) => {
                  bruto ??= input;
                  return { ok: true, aviso: "Rascunho registrado. Responda só \"ok\"." };
                },
              },
            ],
          },
          [],
          pedidoVendedor({ nome: card.name, cidade: card.city, segmento: card.segment, etapa: card.stage }, historico.map((h) => ({ direcao: h.direction as "in" | "out", canal: h.channel, texto: h.body, quando: h.createdAt })), { assunto: msg.subject ?? undefined, texto: msg.body }),
        ),
      );
    } catch (error) {
      this.logger.warn(`IA falhou ao escrever o rascunho (${v.slug}): ${error instanceof Error ? error.message.slice(0, 200) : error}`);
      return false;
    }
    const r = finalizarRascunho(bruto, { nome: v.name, slug: v.slug, entrada: msg.body });
    await this.criarRascunho(card, msg, r, agora);
    return true;
  }

  private async criarRascunho(card: CardComVendedor, msg: ProspectMessage, r: { texto: string; objecao: Objecao; etapa: EtapaSugerida; escalar?: MotivoEscalar; followupDias: number }, agora: Date) {
    const v = card.salesAgent!;
    const auto = saiSozinho(r, v.autonomy as VendedorAutonomia);
    let d: ProspectReplyDraft;
    try {
      d = await this.prisma.prospectReplyDraft.create({
        data: {
          prospectId: card.id,
          salesAgentId: v.id,
          inboundId: msg.id,
          channel: msg.channel,
          status: r.escalar ? "escalado" : auto ? "aprovado" : "pendente",
          replyText: r.texto,
          objection: r.objecao,
          suggestedStage: r.etapa,
          escalateReason: r.escalar,
          nextFollowupDays: r.followupDias,
          autoApproved: auto,
          playbookVersion: PLAYBOOK_VERSAO,
          createdAt: agora,
          ...(auto ? { decidedAt: agora } : {}),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return;
    }
    await this.prisma.prospectMessage.update({ where: { id: msg.id }, data: { needsDraft: false } });
    if (r.objecao !== "nenhuma" || !card.objection) await this.prisma.salesProspect.update({ where: { id: card.id }, data: { objection: r.objecao } });
    if (r.escalar) await this.escalar(card, r.escalar, agora, v);
    if (auto) await this.enviarRascunho(d.id, agora);
  }

  // ------------------------------------------------------------ aprovação

  async aprovar(id: string, raw: z.input<typeof AprovarRascunhoSchema>, userId: string, agora = new Date()): Promise<{ status: "enviado" | "na_fila"; motivo?: string }> {
    const input = parseOrBadRequest(AprovarRascunhoSchema, raw);
    const d = await this.prisma.prospectReplyDraft.findUnique({ where: { id: parseOrBadRequest(IdSchema, id) } });
    if (!d) throw new NotFoundException("Rascunho não encontrado.");
    if (!["pendente", "escalado", "erro"].includes(d.status)) throw new BadRequestException("Este rascunho já foi decidido.");
    const texto = input.texto ?? d.replyText;
    if (!texto.trim()) throw new BadRequestException("Escreva a resposta antes de enviar.");
    await this.prisma.prospectReplyDraft.update({ where: { id: d.id }, data: { status: "aprovado", finalText: texto, decidedById: userId, decidedAt: agora, error: null } });
    const r = await this.enviarRascunho(d.id, agora);
    return r === "enviado" ? { status: "enviado" } : { status: "na_fila", motivo: r };
  }

  async rejeitar(id: string, raw: z.input<typeof RejeitarRascunhoSchema>, userId: string, agora = new Date()): Promise<void> {
    const input = parseOrBadRequest(RejeitarRascunhoSchema, raw);
    const d = await this.prisma.prospectReplyDraft.findUnique({ where: { id: parseOrBadRequest(IdSchema, id) } });
    if (!d) throw new NotFoundException("Rascunho não encontrado.");
    if (!["pendente", "escalado", "erro", "aprovado"].includes(d.status)) throw new BadRequestException("Este rascunho já foi decidido.");
    await this.prisma.prospectReplyDraft.update({ where: { id: d.id }, data: { status: "rejeitado", rejectReason: input.motivo || null, decidedById: userId, decidedAt: agora } });
    await this.nota(d.prospectId, "note", `Rascunho de resposta da assistente rejeitado pelo dono${input.motivo ? `: ${input.motivo}` : "."}`);
  }

  async enviarAprovados(agora = new Date(), escopo: Escopo = {}): Promise<number> {
    const fila = await this.prisma.prospectReplyDraft.findMany({ where: { status: "aprovado", ...(escopo.somenteVendedores ? { salesAgentId: { in: escopo.somenteVendedores } } : {}) }, orderBy: { decidedAt: "asc" }, take: 20, select: { id: true } });
    let n = 0;
    for (const d of fila) if ((await this.enviarRascunho(d.id, agora)) === "enviado") n++;
    return n;
  }

  private async emailsHoje(vendedorId: string, agora: Date): Promise<number> {
    const inicio = brtDayStart(agora);
    const [a, b] = await Promise.all([
      this.prisma.prospectEmailLog.count({ where: { salesAgentId: vendedorId, status: "enviado", createdAt: { gte: inicio } } }),
      this.prisma.prospectMessage.count({ where: { salesAgentId: vendedorId, direction: "out", channel: "email", createdAt: { gte: inicio } } }),
    ]);
    return a + b;
  }

  // Envia um rascunho aprovado, conferindo tudo de novo na hora: saiu, lista
  // de bloqueio, e-mail inválido, "não contatar", horário, pausa e teto.
  private async enviarRascunho(id: string, agora: Date): Promise<"enviado" | "fora_do_horario" | "pausado" | "teto_do_dia" | "descartado" | "erro"> {
    const d = await this.prisma.prospectReplyDraft.findUnique({ where: { id }, include: { inbound: true, salesAgent: true, prospect: { include: { salesAgent: true } } } });
    if (!d || d.status !== "aprovado") return "descartado";
    const card = d.prospect;
    const v = d.salesAgent;
    const bloqueado =
      card.optedOutAt ||
      (d.channel === "email" && (!card.email || card.emailInvalidAt || (await this.prisma.prospectSuppression.findUnique({ where: { addressHmac: blindIndex("email", card.email, currentDataKeys()) } })))) ||
      (await this.prisma.hubMark.findFirst({ where: { key: card.id, naoContatar: true } }));
    if (bloqueado) {
      await this.prisma.prospectReplyDraft.update({ where: { id }, data: { status: "descartado", error: "A empresa saiu da lista ou não pode ser contatada." } });
      return "descartado";
    }
    if (!dentroDoHorarioRespostas(agora)) return "fora_do_horario";
    if ((await this.geral()).pausarTodos || v.paused || !v.active || !v.mailbox) return "pausado";
    const texto = (d.finalText ?? d.replyText).trim();
    let messageId: string | undefined;
    try {
      if (d.channel === "whatsapp") {
        const enviar = this.whatsapp();
        if (!card.whatsappOptInAt || !card.whatsapp) throw new Error("A empresa não autorizou o WhatsApp.");
        if (!enviar) throw new Error("WhatsApp não configurado no servidor.");
        await enviar(card.whatsapp, texto);
      } else {
        if ((await this.emailsHoje(v.id, agora)) >= v.dailyEmailCap) return "teto_do_dia";
        messageId = await this.enviarEmail(card, v, d.inbound, texto, agora);
      }
    } catch (error) {
      const cfg = prospeccaoSmtpConfig();
      const msg = semSenha(error instanceof Error ? error.message : String(error), cfg).slice(0, 300);
      await this.prisma.prospectReplyDraft.update({ where: { id }, data: { status: "erro", error: msg } });
      if (d.channel === "whatsapp") await this.tarefa(card, `Responder ${card.name} no WhatsApp`, "whatsapp", `A resposta aprovada não saiu pelo WhatsApp (${msg}). Mande à mão.`, agora);
      return "erro";
    }
    await this.prisma.prospectMessage.create({ data: { prospectId: card.id, salesAgentId: v.id, channel: d.channel, direction: "out", kind: "resposta", messageId, subject: d.channel === "email" ? assuntoRe(d.inbound.subject) : null, body: texto, createdAt: agora, receivedAt: agora } });
    await this.prisma.prospectReplyDraft.update({ where: { id }, data: { status: "enviado", sentAt: agora } });
    await this.aplicarCrm(card, d, agora);
    return "enviado";
  }

  // Envia por e-mail na mesma conversa (In-Reply-To/References), com rodapé
  // legal e link de saída. Devolve o Message-ID.
  private async enviarEmail(card: SalesProspect, v: SalesAgent, inbound: ProspectMessage, texto: string, agora: Date, opcoes: { semRodape?: boolean } = {}): Promise<string> {
    const cfg = prospeccaoSmtpConfig();
    if (!cfg && !this.envioDeTeste) throw new Error("SMTP da prospecção não configurado.");
    if (!card.email) throw new Error("Empresa sem e-mail.");
    const linkSair = `${webOrigin()}/sair/${this.sequencias.tokenSair(card.id)}`;
    const email = renderizarEmail({ assunto: "", corpo: texto, esperaDias: 1 }, { empresa: card.name, cidade: card.city ?? undefined }, { linkSair, numero: 2, assuntoPrimeiro: semRe(inbound.subject) || "NovoSeminovo" });
    const messageId = `<resposta.${card.id}.${randomBytes(6).toString("hex")}@novoseminovo.com.br>`;
    const umClique = `${(process.env.PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/prospeccao/sair/${this.sequencias.tokenSair(card.id)}`;
    const https = /^https:\/\//.test(umClique);
    const cabecalhos: Record<string, string> = {
      "List-Unsubscribe": `${https ? `<${umClique}>, ` : ""}<mailto:${cfg?.user ?? "contato@novoseminovo.com.br"}?subject=SAIR>`,
      ...(https ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
    };
    const referencias = [...(inbound.references ?? "").split(/\s+/).filter((x) => /^<[^<>\s]+>$/.test(x)), inbound.messageId].filter((x): x is string => Boolean(x));
    const envio = this.envioDeTeste ?? criarEnvio(cfg!);
    await envio({
      para: card.email,
      assunto: email.assunto,
      texto: opcoes.semRodape ? texto : email.texto,
      html: email.html,
      messageId,
      inReplyTo: inbound.messageId ?? undefined,
      referencias: [...new Set(referencias)].slice(-20),
      deNome: `${v.name} | NovoSeminovo`,
      cabecalhos,
    });
    if (opcoes.semRodape) await this.prisma.prospectMessage.create({ data: { prospectId: card.id, salesAgentId: v.id, channel: "email", direction: "out", kind: "saida", messageId, subject: email.assunto, body: texto, createdAt: agora, receivedAt: agora } });
    return messageId;
  }

  // Depois do envio: interação na ficha, etapa (só caminhos permitidos),
  // motivo de perda estruturado e próximo contato.
  private async aplicarCrm(card: SalesProspect, d: ProspectReplyDraft & { salesAgent: SalesAgent }, agora: Date) {
    const canal = d.channel === "whatsapp" ? "WhatsApp" : "e-mail";
    await this.nota(card.id, d.channel === "whatsapp" ? "whatsapp" : "email", `${d.salesAgent.name} (assistente comercial IA) respondeu por ${canal}${d.autoApproved ? " (automático, resposta de rotina)" : " (aprovado pelo dono)"}.`);
    const atual = await this.prisma.salesProspect.findUniqueOrThrow({ where: { id: card.id } });
    const para = etapaDestino(atual.stage, d.suggestedStage as EtapaSugerida, { parceira: Boolean(atual.partnerId) });
    const perdida = para === "perdida";
    const followup = !perdida && d.nextFollowupDays > 0 ? new Date(agora.getTime() + d.nextFollowupDays * 86_400_000) : undefined;
    await this.prisma.salesProspect.update({
      where: { id: card.id },
      data: {
        ...(para ? { stage: para as SalesProspect["stage"] } : {}),
        ...(perdida ? { lostCategory: categoriaPerda(d.objection as Objecao), lostReason: `Objeção: ${OBJECOES[d.objection as Objecao] ?? d.objection}`, nextContactAt: null } : {}),
        ...(followup ? { nextContactAt: followup, nextContactKind: d.channel === "whatsapp" ? "whatsapp" : "email" } : {}),
      },
    });
    if (para) await this.prisma.salesNote.create({ data: { prospectId: card.id, kind: "stage", fromStage: atual.stage, toStage: para, body: `Etapa movida pela assistente ${d.salesAgent.name} depois da resposta enviada.` } });
    if (para === "interessada" && followup) await this.tarefa(card, `Acompanhar ${card.name} (interessada)`, "tarefa", `A empresa mostrou interesse. A assistente marcou o próximo contato para ${followup.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`, followup);
  }

  // ------------------------------------------------------------ WhatsApp

  // Mensagem de WhatsApp: só é tratada aqui se o número é de uma empresa da
  // prospecção que AUTORIZOU o WhatsApp. Gera rascunho (mesmas regras).
  async receberWhatsapp(de: string, texto: string, id: string, agora = new Date()): Promise<boolean> {
    const numero = de.replace(/\D/g, "");
    if (numero.length < 10) return false;
    const card = await this.prisma.salesProspect.findFirst({ where: { whatsapp: numero, whatsappOptInAt: { not: null } }, include: { salesAgent: true } });
    if (!card || card.optedOutAt) return false;
    const messageId = `<wa.${id.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100)}@whatsapp>`;
    if (await this.prisma.prospectMessage.findUnique({ where: { messageId }, select: { id: true } })) return true;
    const limpo = limparCorpo(texto);
    const msg = await this.prisma.prospectMessage.create({ data: { prospectId: card.id, salesAgentId: card.salesAgentId, channel: "whatsapp", direction: "in", kind: "resposta", messageId, body: limpo || "(mensagem sem texto)", receivedAt: agora } });
    await this.respondeu(card, "whatsapp", agora);
    if (pedidoDeSaida(limpo)) {
      await this.saida(card, msg, agora);
      return true;
    }
    await this.depoisDaEntrada(card.id, msg, limpo, agora, {});
    return true;
  }

  // ------------------------------------------------------------ painéis

  private vista(v: SalesAgent, seq: { id: string; name: string; status: string; approvedAt: Date | null } | null, agora: Date) {
    return {
      id: v.id,
      slug: v.slug,
      nome: v.name,
      titulo: v.displayTitle,
      ativo: v.active,
      pausado: v.paused,
      caixa: v.mailbox ?? undefined,
      autonomia: v.autonomy as VendedorAutonomia,
      noArDesde: v.liveSince?.toISOString(),
      podeAutomatico: podeAutomatico(v.liveSince, agora),
      diasParaAutomatico: diasParaAutomatico(v.liveSince, agora),
      limiteEmailsDia: v.dailyEmailCap,
      limiteRascunhosDia: v.dailyDraftCap,
      sequencia: seq ? { id: seq.id, nome: seq.name, status: seq.status, aprovada: Boolean(seq.approvedAt) && seq.status === "ativa" } : undefined,
    };
  }

  private async numeros(v: SalesAgent, agora: Date): Promise<VendedorPainel["numeros"]> {
    const inicioHoje = brtDayStart(agora);
    const l = new Date(agora.getTime() - 3 * 3_600_000);
    const inicioMes = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) + 3 * 3_600_000);
    const feature = `${AGENT_FEATURE_PREFIX}vendedor:${v.slug}`;
    const [primeiros, cards, enviadas, pendentes, custoHoje, custoMes, rascunhosHoje, emailsHoje, fila] = await Promise.all([
      this.prisma.prospectEmailLog.findMany({ where: { salesAgentId: v.id, step: 1, status: "enviado" }, select: { createdAt: true } }),
      this.prisma.salesProspect.findMany({ where: { salesAgentId: v.id }, select: { stage: true, repliedAt: true, partnerId: true, objection: true, lostCategory: true } }),
      this.prisma.prospectReplyDraft.findMany({ where: { salesAgentId: v.id, status: "enviado", sentAt: { not: null } }, select: { sentAt: true, inbound: { select: { receivedAt: true } } }, take: 500, orderBy: { sentAt: "desc" } }),
      this.prisma.prospectReplyDraft.count({ where: { salesAgentId: v.id, status: { in: ["pendente", "escalado"] } } }),
      this.prisma.agentRun.aggregate({ where: { feature, createdAt: { gte: inicioHoje } }, _sum: { costBrl: true } }),
      this.prisma.agentRun.aggregate({ where: { feature, createdAt: { gte: inicioMes } }, _sum: { costBrl: true } }),
      this.prisma.prospectReplyDraft.count({ where: { salesAgentId: v.id, createdAt: { gte: inicioHoje } } }),
      this.emailsHoje(v.id, agora),
      this.prisma.prospectEnrollment.count({ where: { prospect: { salesAgentId: v.id }, status: "agendado", stepsSent: 0 } }),
    ]);
    return numerosDoVendedor(
      {
        primeirosEnvios: primeiros.map((p) => p.createdAt),
        cards: cards.map((c) => ({ etapa: c.stage, respondeu: Boolean(c.repliedAt), parceira: Boolean(c.partnerId), objecao: c.objection, motivoPerda: c.lostCategory, contatado: true })),
        respostasEnviadas: enviadas.map((e) => ({ recebidaEm: e.inbound.receivedAt, enviadaEm: e.sentAt! })),
        aprovacoesPendentes: pendentes,
        custoHojeBrl: Number(custoHoje._sum.costBrl ?? 0),
        custoMesBrl: Number(custoMes._sum.costBrl ?? 0),
        rascunhosHoje,
        emailsHoje,
        fila,
      },
      agora,
    );
  }

  async painel(agora = new Date()): Promise<VendedoresPainel> {
    await this.garantirVendedores(agora);
    const vendedores = await this.prisma.salesAgent.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
    const seqs = await this.prisma.prospectSequence.findMany({ where: { id: { in: vendedores.map((v) => v.sequenceId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, status: true, approvedAt: true } });
    const lista: VendedorPainel[] = [];
    for (const v of vendedores) lista.push({ ...this.vista(v, seqs.find((s) => s.id === v.sequenceId) ?? null, agora), numeros: await this.numeros(v, agora) });
    return {
      geral: await this.geral(),
      iaLigada: Boolean(this.modelo()),
      caixaConfigurada: Boolean(prospeccaoSmtpConfig() || this.envioDeTeste),
      leituraConfigurada: Boolean(prospeccaoImapConfig() || this.caixaDeTeste),
      vendedores: lista,
    };
  }

  async detalhe(id: string, agora = new Date()): Promise<{ vendedor: VendedorPainel; recentes: RascunhoVista[] }> {
    const v = await this.vendedor(id);
    const seq = v.sequenceId ? await this.prisma.prospectSequence.findUnique({ where: { id: v.sequenceId }, select: { id: true, name: true, status: true, approvedAt: true } }) : null;
    const recentes = await this.rascunhos({ salesAgentId: v.id, status: { in: ["enviado", "rejeitado", "erro", "descartado", "aprovado"] } }, 30);
    return { vendedor: { ...this.vista(v, seq, agora), numeros: await this.numeros(v, agora) }, recentes };
  }

  async fila(vendedorId?: string, escopo: Escopo = {}): Promise<RascunhoVista[]> {
    const ids = vendedorId ? [parseOrBadRequest(IdSchema, vendedorId)] : escopo.somenteVendedores;
    return this.rascunhos({ status: { in: ["pendente", "escalado", "erro"] }, ...(ids ? { salesAgentId: { in: ids } } : {}) }, 100, "asc");
  }

  private async rascunhos(where: Prisma.ProspectReplyDraftWhereInput, take: number, ordem: "asc" | "desc" = "desc"): Promise<RascunhoVista[]> {
    const rows = await this.prisma.prospectReplyDraft.findMany({
      where,
      orderBy: { createdAt: ordem },
      take,
      include: { salesAgent: { select: { id: true, name: true } }, prospect: { select: { id: true, name: true, city: true, stage: true } }, inbound: { select: { subject: true, body: true, receivedAt: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      vendedor: { id: r.salesAgent.id, nome: r.salesAgent.name },
      empresa: { id: r.prospect.id, nome: r.prospect.name, cidade: r.prospect.city ?? undefined, etapa: SALES_STAGE_LABEL[r.prospect.stage as keyof typeof SALES_STAGE_LABEL] ?? r.prospect.stage },
      canal: r.channel === "whatsapp" ? "whatsapp" : "email",
      status: r.status as RascunhoVista["status"],
      mensagem: { assunto: r.inbound.subject ?? undefined, texto: r.inbound.body, recebidaEm: r.inbound.receivedAt.toISOString() },
      texto: r.finalText ?? r.replyText,
      objecao: r.objection as Objecao,
      etapaSugerida: r.suggestedStage as EtapaSugerida,
      escalar: r.escalateReason ? { motivo: r.escalateReason as MotivoEscalar, rotulo: MOTIVOS_ESCALAR[r.escalateReason as MotivoEscalar] ?? r.escalateReason } : undefined,
      proximoContatoDias: r.nextFollowupDays,
      criadoEm: r.createdAt.toISOString(),
      erro: r.error ?? undefined,
    }));
  }

  // ------------------------------------------------------------ rotina

  async rodada(agora = new Date()): Promise<void> {
    await this.garantirVendedores(agora);
    await this.distribuir(agora);
    const r = await this.lerCaixa(agora);
    if (r !== "sem_caixa" && (r.respostas || r.saidas || r.devolvidos)) this.logger.log(`Caixa: ${r.respostas} resposta(s), ${r.saidas} saída(s), ${r.devolvidos} devolvido(s).`);
    await this.redigirPendentes(agora);
    await this.enviarAprovados(agora);
  }

  // A cada 5 minutos. Desligada em teste ou com PROSPECCAO_DISABLED=1.
  onModuleInit(): void {
    registrarRotaProspeccao((de, texto, id) => this.receberWhatsapp(de, texto, id));
    if (this.desligada()) return;
    this.timer = setInterval(() => {
      if (this.rodando) return;
      this.rodando = true;
      void trackRoutine("prospeccao-respostas", ROTINA_MS, () => this.rodada()).finally(() => {
        this.rodando = false;
      });
    }, ROTINA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    registrarRotaProspeccao(undefined);
  }
}

const semRe = (s: string | null | undefined) => (s ?? "").replace(/^(\s*(re|res|resp|enc|fw|fwd)\s*:\s*)+/i, "").trim();
const assuntoRe = (s: string | null | undefined) => `Re: ${semRe(s) || "NovoSeminovo"}`.slice(0, 200);
