import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, ProspectMessage, ProspectReplyDraft, SalesAgent, SalesProspect } from "@novoseminovo/db";
import {
  AprovarRascunhoSchema,
  CAIXAS_EMAIL,
  PARTNER_TRIAL_DAYS,
  VENDEDOR_CAIXAS,
  VENDEDOR_SEGMENTOS,
  SEQUENCIAS_DOS_VENDEDORES,
  assinaturaPadrao,
  assinaturaValida,
  segmentoImoveis,
  vendedorFeminino,
  type ArrumacaoSequencias,
  type CaixaStatus,
  type VendedorCaixa,
  type VendedorSegmento,
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
import { caixaImap, caixaImapConfig, etiquetasAquecimento, lerEmail, type CaixaEntrada, type EmailBruto, type EmailLido } from "../prospeccao/caixa-entrada";
import { renderizarEmail } from "../prospeccao/sequencia-regras";
import { ProspeccaoSequenciasService } from "../prospeccao/sequencias.service";
import { caixaConhecida, caixaSmtpConfig, criarEnvio, nomeRemetente, semSenha, statusCaixaEmail, type EnviarProspeccao } from "../prospeccao/smtp";
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
//   ativos com caixa configurada e do MESMO SEGMENTO do card: Nina = lojas de
//   veículos, Caio = imobiliárias; sem vendedor do segmento, o card espera)
//   e a primeira sequência de e-mails (aprovada pelo dono);
// - cada vendedor tem a sua caixa (contato@, atendimento@...), nunca
//   dividida entre dois vendedores ativos; cada caixa é lida pela sua rotina;
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
const ATIVOS = ["agendado", "enviando"];
export type NomesArrumacao = { lojasBh: string; caioLojas: string; ninaImoveis: string; caio: string; nina: string };
const [SEQ_LOJAS_BH, SEQ_CAIO, SEQ_NINA] = SEQUENCIAS_DOS_VENDEDORES;
export const ARRUMACAO_PADRAO: NomesArrumacao = { lojasBh: SEQ_LOJAS_BH.nome, caioLojas: SEQ_CAIO.nome, ninaImoveis: SEQ_NINA.nome, caio: "caio", nina: "nina" };
const ROTINA_MS = 5 * 60_000;
const LOTE_CAIXA = 50;
const CRIADO_POR = "vendedor-ia";
const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");

export type ResultadoCaixa = { respostas: number; aquecimento: number; automaticas: number; devolvidos: number; saidas: number; ignorados: number; repetidos: number };
type Escopo = { somenteVendedores?: string[] };
type CardComVendedor = SalesProspect & { salesAgent: SalesAgent | null };

// Texto da primeira abordagem de cada vendedor (assinada por ele, nunca pelo
// dono). Passa pela aprovação do dono como qualquer sequência. Vendedor de
// imobiliárias (só "property") recebe o texto de imóveis; o resto, o de lojas.
export function sequenciaDoVendedor(v: { nome: string; slug: string; segmentos?: readonly string[]; assinatura?: string | null }): ProspeccaoSequenciaInput {
  const link = linkComecar(v.slug);
  const assinatura = v.assinatura?.trim() || assinaturaPadrao(v.nome);
  const fem = vendedorFeminino(v.slug);
  const artigo = fem ? "a" : "o";
  const obrigado = fem ? "Obrigada" : "Obrigado";
  const meses = `${Math.round(PARTNER_TRIAL_DAYS / 30)} meses grátis`;
  const imoveis = Boolean(v.segmentos?.some(segmentoImoveis)) && !v.segmentos?.includes("vehicle");
  if (imoveis) {
    return {
      nome: `${v.nome}: imobiliárias e corretores`,
      passos: [
        {
          assunto: `Imóveis da {{empresa}} no NovoSeminovo, ${meses}`,
          corpo: `Olá, tudo bem?\n\nSou ${artigo} ${v.nome}, assistente comercial (virtual) da NovoSeminovo, um marketplace nacional de imóveis e veículos. Encontrei a {{empresa}} no Google Maps e queria fazer um convite rápido.\n\nEstamos abrindo espaço para imobiliárias e corretores anunciarem os imóveis ${meses}, sem limite de anúncios e sem fidelidade. Além do anúncio, cada imóvel ganha:\n- Vitrine pronta: imagem para Instagram e WhatsApp e cartaz com QR code para imprimir;\n- Importação pelo link: se vocês já anunciam em outro site, é só colar o link que a gente organiza tudo;\n- Arquiteto NovoSeminovo: quem se interessa pelo imóvel pode pedir ideias de reforma dos cômodos a partir das fotos do anúncio, com lista de compras;\n- Painel de leads, para ver quem chamou e responder rápido.\n\nDá uma olhada aqui: ${link}\n\nSe fizer sentido, é só responder este e-mail que a nossa equipe ajuda a subir os primeiros imóveis.\n\n${assinatura}`,
          esperaDias: 0,
        },
        {
          assunto: "",
          corpo: `Oi, passando só para facilitar: se quiserem testar, a nossa equipe ajuda a subir os primeiros imóveis a partir do link de outro site. Vocês só revisam e aprovam.\n\nÉ só responder este e-mail.\n\n${assinatura}`,
          esperaDias: 3,
        },
        {
          assunto: "",
          corpo: `Último contato sobre isso. Se agora não for o momento, sem problema: os ${meses} continuam valendo quando quiserem começar: ${link}\n\n${obrigado} pela atenção,\n${assinatura}`,
          esperaDias: 4,
        },
      ],
    };
  }
  return {
    nome: `${v.nome}: lojas de veículos`,
    passos: [
      {
        assunto: `Estoque da {{empresa}} no NovoSeminovo, ${meses}`,
        corpo: `Olá, tudo bem?\n\nSou ${artigo} ${v.nome}, assistente comercial (virtual) da NovoSeminovo, um marketplace nacional de carros e imóveis. Encontrei a {{empresa}} no Google Maps e queria fazer um convite rápido.\n\nEstamos abrindo espaço para lojas anunciarem o estoque ${meses}, sem limite de anúncios e sem fidelidade. Além do anúncio, cada carro ganha:\n- Vitrine pronta: imagem para Instagram e WhatsApp e cartaz com QR code para o vidro;\n- Importação pelo link: se vocês já anunciam em outro site, é só colar o link que a gente organiza tudo;\n- Painel de leads, para ver quem chamou e responder rápido.\n\nDá uma olhada aqui: ${link}\n\nSe fizer sentido, é só responder este e-mail que a nossa equipe ajuda a subir os primeiros carros.\n\n${assinatura}`,
        esperaDias: 0,
      },
      {
        assunto: "",
        corpo: `Oi, passando só para facilitar: se quiserem testar, a nossa equipe ajuda a subir os primeiros carros a partir do link de outro site. Vocês só revisam e aprovam.\n\nÉ só responder este e-mail.\n\n${assinatura}`,
        esperaDias: 3,
      },
      {
        assunto: "",
        corpo: `Último contato sobre isso. Se agora não for o momento, sem problema: os ${meses} continuam valendo quando quiserem começar: ${link}\n\n${obrigado} pela atenção,\n${assinatura}`,
        esperaDias: 4,
      },
    ],
  };
}

const assinaturaDe = (v: { name: string; signature: string | null }) => v.signature?.trim() || assinaturaPadrao(v.name);
const atende = (v: { segments: string[] }, segmento: string) => !v.segments.length || v.segments.includes(segmento);
const estadoImap = (caixa: VendedorCaixa) => (caixa === "prospeccao" ? ESTADO_IMAP : `${ESTADO_IMAP}:${caixa}`);

@Injectable()
export class VendedoresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Vendedores IA");
  private readonly usage: UsageService;
  private timer?: NodeJS.Timeout;
  private rodando = false;
  private readonly caixasDeTeste = new Map<VendedorCaixa, CaixaEntrada>();
  private leituras: NodeJS.Timeout[] = [];
  private lendo = new Set<VendedorCaixa>();
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
  usarCaixa(c: CaixaEntrada | undefined, chave: VendedorCaixa = "prospeccao") {
    if (c) this.caixasDeTeste.set(chave, c);
    else this.caixasDeTeste.delete(chave);
  }

  // A caixa pode mandar e-mail? (configurada; nos testes, o SMTP falso vale para todas)
  private caixaPronta(chave: string | null | undefined): chave is VendedorCaixa {
    return Boolean(chave && caixaConhecida(chave) && (this.envioDeTeste || caixaSmtpConfig(chave)));
  }

  private statusCaixas(vendedores: SalesAgent[]): CaixaStatus[] {
    return VENDEDOR_CAIXAS.map((chave) => {
      const st: CaixaStatus = this.envioDeTeste ? { chave, endereco: CAIXAS_EMAIL[chave].endereco, configurada: true, leitura: this.caixasDeTeste.has(chave) || Boolean(caixaImapConfig(chave)) } : statusCaixaEmail(chave);
      const dono = vendedores.find((v) => v.active && v.mailbox === chave);
      return dono ? { ...st, vendedorAtivo: dono.name } : st;
    });
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

  // Só o dono (permissão "equipe", conferida no controller). Ativar (ou
  // trocar a caixa de um ativo) exige: caixa da lista fixa, configurada, sem
  // outro vendedor ativo nela e a primeira abordagem aprovada.
  async ajustar(id: string, raw: VendedorAjustes, agora = new Date()): Promise<void> {
    const v = await this.vendedor(id);
    const a = parseOrBadRequest(VendedorAjustesSchema, raw);
    if (a.autonomia === "automatico" && v.autonomy !== "automatico" && !podeAutomatico(v.liveSince, agora)) {
      throw new BadRequestException(`O modo automático só pode ser ligado depois de 14 dias no ar (faltam ${diasParaAutomatico(v.liveSince, agora)} dia(s)).`);
    }
    if (a.assinatura && !assinaturaValida(v.name, a.assinatura)) throw new BadRequestException(`A assinatura precisa ter o nome "${v.name}" e a palavra "assistente" (ninguém pode achar que é uma pessoa), numa linha só, sem link nem e-mail.`);
    const caixa = a.caixa !== undefined ? a.caixa : (v.mailbox as VendedorCaixa | null);
    const ativo = a.ativo ?? v.active;
    const trocouCaixa = a.caixa !== undefined && a.caixa !== v.mailbox;
    if (ativo && ((a.ativo === true && !v.active) || trocouCaixa)) await this.conferirAtivacao(v, caixa, trocouCaixa && v.active);
    await this.prisma.salesAgent.update({
      where: { id: v.id },
      data: {
        ...(a.autonomia ? { autonomy: a.autonomia } : {}),
        ...(a.pausado !== undefined ? { paused: a.pausado } : {}),
        ...(a.limiteEmailsDia ? { dailyEmailCap: a.limiteEmailsDia } : {}),
        ...(a.limiteRascunhosDia ? { dailyDraftCap: a.limiteRascunhosDia } : {}),
        ...(a.segmentos ? { segments: a.segmentos } : {}),
        ...(a.assinatura !== undefined ? { signature: a.assinatura && a.assinatura !== assinaturaPadrao(v.name) ? a.assinatura : null } : {}),
        ...(a.caixa !== undefined ? { mailbox: a.caixa } : {}),
        ...(a.ativo !== undefined ? { active: a.ativo, ...(a.ativo && !v.liveSince ? { liveSince: agora } : {}) } : {}),
      },
    });
    if (caixa && caixa !== v.mailbox) await this.garantirSequenciaDoVendedor(v.id);
  }

  private async conferirAtivacao(v: SalesAgent, caixa: VendedorCaixa | null, trocouCaixa: boolean): Promise<void> {
    if (!caixa) throw new BadRequestException(`${v.name} não tem caixa de e-mail: escolha uma antes de ativar.`);
    const endereco = CAIXAS_EMAIL[caixa].endereco;
    if (!this.caixaPronta(caixa)) {
      const st = statusCaixaEmail(caixa);
      throw new BadRequestException(`A caixa ${endereco} não está configurada no servidor${st.motivo ? ` (${st.motivo})` : ""}. Veja DEPLOY.md.`);
    }
    const outro = await this.prisma.salesAgent.findFirst({ where: { active: true, mailbox: caixa, id: { not: v.id } }, select: { name: true } });
    if (outro) throw new BadRequestException(`A caixa ${endereco} já é usada por ${outro.name}. Pause e desative ${outro.name} ou escolha outra caixa.`);
    if (trocouCaixa) return;
    const seq = v.sequenceId ? await this.prisma.prospectSequence.findUnique({ where: { id: v.sequenceId }, select: { status: true, approvedAt: true } }) : null;
    if (!seq || seq.status !== "ativa" || !seq.approvedAt) throw new BadRequestException(`Aprove a primeira abordagem de ${v.name} (Vendas → Sequências de prospecção) antes de ativar.`);
  }

  // ------------------------------------------------------------ vendedores

  // Os 5 do começo (Nina ativa com o contato@ para lojas; Caio inativo com o
  // atendimento@ para imobiliárias; os outros sem caixa). Idempotente.
  async garantirVendedores(agora = new Date()): Promise<void> {
    for (const v of VENDEDORES_INICIAIS) {
      const existe = await this.prisma.salesAgent.findUnique({ where: { slug: v.slug } });
      if (existe) continue;
      try {
        await this.prisma.salesAgent.create({ data: { slug: v.slug, name: v.nome, active: v.ativo, mailbox: v.caixa, segments: [...v.segmentos], liveSince: v.ativo ? agora : null } });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    const comCaixa = await this.prisma.salesAgent.findMany({ where: { mailbox: { not: null }, sequenceId: null }, select: { id: true } });
    for (const a of comCaixa) await this.garantirSequenciaDoVendedor(a.id);
  }

  async garantirSequenciaDoVendedor(id: string): Promise<string> {
    const v = await this.vendedor(id);
    if (v.sequenceId && (await this.prisma.prospectSequence.findUnique({ where: { id: v.sequenceId }, select: { id: true } }))) return v.sequenceId;
    const s = sequenciaDoVendedor({ nome: v.name, slug: v.slug, segmentos: v.segments, assinatura: v.signature });
    // Já existe com esse nome (ex.: criada pelo marketing no Hub)? Usa ela, sem
    // mexer no texto. Senão, cria o rascunho (nunca ativo).
    const existe = await this.prisma.prospectSequence.findFirst({ where: { name: s.nome, OR: [{ salesAgentId: null }, { salesAgentId: v.id }] }, select: { id: true, salesAgentId: true } });
    const seqId = existe
      ? existe.id
      : (await this.prisma.prospectSequence.create({ data: { name: s.nome, status: "rascunho", steps: s.passos as Prisma.InputJsonValue, createdById: CRIADO_POR, salesAgentId: v.id } })).id;
    if (existe && !existe.salesAgentId) await this.prisma.prospectSequence.update({ where: { id: seqId }, data: { salesAgentId: v.id } });
    await this.prisma.salesAgent.update({ where: { id: v.id }, data: { sequenceId: seqId } });
    return seqId;
  }

  // Vendedor que pode trabalhar agora: ativo, com caixa configurada, sem pausa (nem geral).
  private async elegiveis(escopo: Escopo = {}): Promise<SalesAgent[]> {
    if ((await this.geral()).pausarTodos) return [];
    const lista = await this.prisma.salesAgent.findMany({
      where: { active: true, paused: false, mailbox: { not: null }, ...(escopo.somenteVendedores ? { id: { in: escopo.somenteVendedores } } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return lista.filter((v) => this.caixaPronta(v.mailbox));
  }

  // ------------------------------------------------------------ arrumação (dono)

  // Arruma as sequências do marketing para a divisão de 18/11/2026 (Caio =
  // lojas de veículos no atendimento@; Nina = imobiliárias e corretores no
  // contato@). aplicar=false só mostra a prévia. Nada é enviado; rodar de
  // novo não muda nada. Inscrição que já recebeu e-mail nunca é mexida:
  // vira conflito para o dono decidir.
  async arrumarSequencias(aplicar: boolean, userId: string, n: NomesArrumacao = ARRUMACAO_PADRAO, agora = new Date()): Promise<ArrumacaoSequencias> {
    await this.garantirVendedores(agora);
    const [caio, nina] = await Promise.all([this.prisma.salesAgent.findUnique({ where: { slug: n.caio } }), this.prisma.salesAgent.findUnique({ where: { slug: n.nina } })]);
    if (!caio || !nina) throw new NotFoundException("Vendedores Caio e Nina não encontrados.");
    const nomes = [n.lojasBh, n.caioLojas, n.ninaImoveis];
    const seqs = await this.prisma.prospectSequence.findMany({ where: { name: { in: nomes } }, include: { salesAgent: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
    const seq = (nome: string) => seqs.find((x) => x.name === nome);
    const [sB, sC, sN] = [seq(n.lojasBh), seq(n.caioLojas), seq(n.ninaImoveis)];
    const contar = async () => {
      const g = await this.prisma.prospectEnrollment.groupBy({ by: ["sequenceId"], where: { sequenceId: { in: seqs.map((x) => x.id) }, activeKey: { not: null } }, _count: { _all: true } });
      return Object.fromEntries(nomes.map((nome) => [nome, g.find((x) => x.sequenceId === seq(nome)?.id)?._count._all ?? 0]));
    };
    const antes = await contar();
    const conflitos: ArrumacaoSequencias["conflitos"] = [];
    const destino: Record<string, string> = { [n.lojasBh]: caio.name, [n.caioLojas]: caio.name, [n.ninaImoveis]: nina.name };
    const r: ArrumacaoSequencias = {
      aplicada: aplicar,
      remetentes: nomes.map((nome) => ({ sequencia: nome, existe: Boolean(seq(nome)), vendedorAntes: seq(nome)?.salesAgent?.name, vendedorDepois: destino[nome]! })),
      vendedores: [
        { nome: caio.name, caixaAntes: caio.mailbox ?? undefined, caixaDepois: caio.mailbox ?? "atendimento", segmentosAntes: caio.segments, segmentosDepois: ["vehicle"] },
        { nome: nina.name, caixaAntes: nina.mailbox ?? undefined, caixaDepois: nina.mailbox ?? "prospeccao", segmentosAntes: nina.segments, segmentosDepois: ["property", "broker"] },
      ],
      movidasParaNina: 0,
      tiradasPorLojasBh: 0,
      cardsTrocados: 0,
      inscritasAntes: antes,
      inscritasDepois: { ...antes },
      conflitos,
    };
    for (const x of nomes) if (!seq(x)) conflitos.push({ empresa: "—", motivo: `A sequência "${x}" não existe no Hub.` });
    const paraCaio = new Set<string>();
    const paraNina = new Set<string>();

    if (sC) {
      const doCaio = await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: sC.id, status: { in: ATIVOS } }, include: { prospect: { select: { id: true, name: true, email: true, segment: true } } } });
      const daLojasBh = sB ? await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: sB.id }, select: { prospectId: true, prospect: { select: { email: true } } } }) : [];
      const cardsB = new Set(daLojasBh.map((e) => e.prospectId));
      const emailsB = new Set(daLojasBh.map((e) => e.prospect.email?.toLowerCase()).filter(Boolean));
      const naNina = sN ? new Set((await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: sN.id }, select: { prospectId: true } })).map((e) => e.prospectId)) : new Set<string>();
      for (const e of doCaio) {
        const p = e.prospect;
        const emLojasBh = cardsB.has(p.id) || (p.email ? emailsB.has(p.email.toLowerCase()) : false);
        if (emLojasBh) {
          if (e.stepsSent > 0) {
            conflitos.push({ empresa: p.name, motivo: `Está em "${n.lojasBh}" e já recebeu e-mail de "${n.caioLojas}": decida à mão.` });
            continue;
          }
          r.tiradasPorLojasBh++;
          if (aplicar) await this.prisma.prospectEnrollment.deleteMany({ where: { id: e.id, stepsSent: 0 } });
          continue;
        }
        if (!segmentoImoveis(p.segment)) {
          paraCaio.add(p.id);
          continue;
        }
        if (!sN) continue;
        if (e.stepsSent > 0) {
          conflitos.push({ empresa: p.name, motivo: `Imobiliária/corretor que já recebeu e-mail de "${n.caioLojas}": não dá para mover sem misturar remetentes.` });
          continue;
        }
        r.movidasParaNina++;
        paraNina.add(p.id);
        if (aplicar) {
          await this.prisma.$transaction(async (tx) => {
            const apagada = await tx.prospectEnrollment.deleteMany({ where: { id: e.id, stepsSent: 0 } });
            if (!apagada.count || naNina.has(p.id)) return;
            await tx.prospectEnrollment.create({ data: { sequenceId: sN.id, prospectId: p.id, activeKey: p.id, status: "agendado", nextSendAt: e.nextSendAt ?? agora, enrolledById: userId } });
          });
        }
      }
    }
    if (sB) {
      const lojasBh = await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: sB.id, status: { in: ATIVOS } }, select: { stepsSent: true, prospect: { select: { id: true, name: true, segment: true } } } });
      for (const e of lojasBh) {
        if (e.stepsSent > 0 && sB.salesAgentId !== caio.id) conflitos.push({ empresa: e.prospect.name, motivo: `Já recebeu e-mail de "${n.lojasBh}" por outra caixa: com o Caio (atendimento@) ela não recebe mais nada (o mesmo e-mail nunca fala com duas caixas).` });
        if (segmentoImoveis(e.prospect.segment)) conflitos.push({ empresa: e.prospect.name, motivo: `Imobiliária/corretor em "${n.lojasBh}" (sequência de lojas de veículos): tire ou troque o tipo da empresa.` });
        else paraCaio.add(e.prospect.id);
      }
    }
    // Cards do Caio que não são lojas de veículos (e não seguem numa sequência dele) vão para a Nina.
    const ativosCaio = new Set((await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: { in: [sB?.id, sC?.id].filter((x): x is string => Boolean(x)) }, activeKey: { not: null } }, select: { prospectId: true } })).map((e) => e.prospectId));
    for (const c of await this.prisma.salesProspect.findMany({ where: { salesAgentId: caio.id, segment: { not: "vehicle" } }, select: { id: true } })) if (!ativosCaio.has(c.id) || paraNina.has(c.id)) paraNina.add(c.id);
    for (const id of paraNina) paraCaio.delete(id);
    r.cardsTrocados =
      (await this.prisma.salesProspect.count({ where: { id: { in: [...paraCaio] }, NOT: { salesAgentId: caio.id } } })) + (await this.prisma.salesProspect.count({ where: { id: { in: [...paraNina] }, NOT: { salesAgentId: nina.id } } }));

    if (aplicar) {
      await this.prisma.salesProspect.updateMany({ where: { id: { in: [...paraCaio] } }, data: { salesAgentId: caio.id } });
      await this.prisma.salesProspect.updateMany({ where: { id: { in: [...paraNina] } }, data: { salesAgentId: nina.id } });
      if (sB) await this.prisma.prospectSequence.update({ where: { id: sB.id }, data: { salesAgentId: caio.id } });
      if (sC) await this.prisma.prospectSequence.update({ where: { id: sC.id }, data: { salesAgentId: caio.id } });
      if (sN) await this.prisma.prospectSequence.update({ where: { id: sN.id }, data: { salesAgentId: nina.id } });
      const outroNoAtendimento = !caio.mailbox && (await this.prisma.salesAgent.findFirst({ where: { active: true, mailbox: "atendimento", id: { not: caio.id } }, select: { name: true } }));
      if (outroNoAtendimento) conflitos.push({ empresa: "—", motivo: `A caixa atendimento@ já é de ${outroNoAtendimento.name}: o Caio ficou sem caixa.` });
      await this.prisma.salesAgent.update({ where: { id: caio.id }, data: { segments: ["vehicle"], ...(caio.mailbox || outroNoAtendimento ? {} : { mailbox: "atendimento" }), ...(sC ? { sequenceId: sC.id } : {}) } });
      await this.prisma.salesAgent.update({ where: { id: nina.id }, data: { segments: ["property", "broker"], ...(sN ? { sequenceId: sN.id } : {}) } });
      r.inscritasDepois = await contar();
    } else {
      r.inscritasDepois[n.caioLojas] = Math.max(0, (antes[n.caioLojas] ?? 0) - r.tiradasPorLojasBh - r.movidasParaNina);
      r.inscritasDepois[n.ninaImoveis] = (antes[n.ninaImoveis] ?? 0) + r.movidasParaNina;
    }
    // Mesmo e-mail ativo em sequências de caixas diferentes depois da arrumação.
    const ativos = await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: { in: seqs.map((x) => x.id) }, activeKey: { not: null } }, select: { sequenceId: true, prospect: { select: { name: true, email: true } } } });
    const caixaSeq = (id: string) => (id === sN?.id ? "nina" : "caio");
    const porEmail = new Map<string, Set<string>>();
    for (const a of ativos) {
      const e = a.prospect.email?.toLowerCase();
      if (!e) continue;
      const set = porEmail.get(e) ?? new Set<string>();
      set.add(caixaSeq(a.sequenceId));
      porEmail.set(e, set);
      if (set.size > 1) conflitos.push({ empresa: a.prospect.name, motivo: "O mesmo e-mail está nas sequências do Caio e da Nina: só a primeira caixa que mandar fala com ele; tire de uma delas." });
    }
    if (aplicar) this.logger.log(`Arrumação das sequências aplicada: ${r.movidasParaNina} levadas para a Nina, ${r.tiradasPorLojasBh} tiradas por já estarem em "${n.lojasBh}", ${r.cardsTrocados} cards trocaram de vendedor.`);
    return r;
  }

  // ------------------------------------------------------------ rodízio

  // Rodízio por segmento: cada card vai para o vendedor elegível do segmento
  // dele com menos carga. Sem vendedor para o segmento, o card espera.
  async distribuir(agora = new Date(), opcoes: Escopo & { somenteCards?: string[] } = {}): Promise<{ atribuidas: number; inscritas: number; semVendedor: number }> {
    const vendedores = await this.elegiveis(opcoes);
    const cards = await this.prisma.salesProspect.findMany({
      where: { ...this.filtroSemVendedor(), ...(opcoes.somenteCards ? { id: { in: opcoes.somenteCards } } : {}) },
      select: { id: true, email: true, segment: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (!cards.length) return { atribuidas: 0, inscritas: 0, semVendedor: 0 };
    const hashes = cards.map((c) => blindIndex("email", c.email!, currentDataKeys()));
    const suprimidos = new Set((await this.prisma.prospectSuppression.findMany({ where: { addressHmac: { in: hashes } }, select: { addressHmac: true } })).map((r) => r.addressHmac));
    const naoContatar = new Set((await this.prisma.hubMark.findMany({ where: { key: { in: cards.map((c) => c.id) }, naoContatar: true }, select: { key: true } })).map((m) => m.key));
    const livres = cards.filter((c, i) => !suprimidos.has(hashes[i]!) && !naoContatar.has(c.id));
    const carga = new Map<string, number>();
    if (vendedores.length) {
      for (const c of await this.prisma.salesProspect.groupBy({ by: ["salesAgentId"], where: { salesAgentId: { in: vendedores.map((v) => v.id) } }, _count: { _all: true } })) carga.set(c.salesAgentId!, c._count._all);
    }
    const mapa = new Map<string, string>();
    let semVendedor = 0;
    for (const segmento of [...new Set(livres.map((c) => c.segment))]) {
      const doSegmento = vendedores.filter((v) => atende(v, segmento));
      const ids = livres.filter((c) => c.segment === segmento).map((c) => c.id);
      if (!doSegmento.length) {
        semVendedor += ids.length;
        continue;
      }
      for (const [cid, vid] of distribuirRodizio(ids, doSegmento.map((v) => ({ id: v.id, carga: carga.get(v.id) ?? 0 })))) {
        mapa.set(cid, vid);
        carga.set(vid, (carga.get(vid) ?? 0) + 1);
      }
    }
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
    return { atribuidas, inscritas, semVendedor };
  }

  // Cards "a abordar" com e-mail válido, ainda sem vendedor e fora de sequência.
  private filtroSemVendedor(): Prisma.SalesProspectWhereInput {
    return { salesAgentId: null, stage: "a_abordar", partnerId: null, email: { not: null }, emailInvalidAt: null, optedOutAt: null, repliedAt: null, enrollments: { none: { activeKey: { not: null } } } };
  }

  // Para o Hub: quantas empresas esperam porque nenhum vendedor ativo atende o segmento.
  private async semVendedorPorSegmento(vendedores: SalesAgent[]): Promise<VendedoresPainel["semVendedor"]> {
    const ativos = vendedores.filter((v) => v.active && !v.paused && this.caixaPronta(v.mailbox));
    const grupos = await this.prisma.salesProspect.groupBy({ by: ["segment"], where: this.filtroSemVendedor(), _count: { _all: true } });
    return (Object.keys(VENDEDOR_SEGMENTOS) as VendedorSegmento[])
      .filter((seg) => !ativos.some((v) => atende(v, seg)))
      .map((seg) => ({ segmento: seg, rotulo: `${VENDEDOR_SEGMENTOS[seg]}: sem vendedor para este segmento`, quantidade: grupos.find((g) => g.segment === seg)?._count._all ?? 0 }));
  }

  // ------------------------------------------------------------ caixa de entrada

  private caixa(chave: VendedorCaixa): CaixaEntrada | undefined {
    const teste = this.caixasDeTeste.get(chave);
    if (teste) return teste;
    if (this.caixasDeTeste.size) return undefined;
    const cfg = caixaImapConfig(chave);
    return cfg ? caixaImap(cfg) : undefined;
  }

  async lerCaixa(agora = new Date(), escopo: Escopo = {}, chave: VendedorCaixa = "prospeccao"): Promise<ResultadoCaixa | "sem_caixa"> {
    const caixa = this.caixa(chave);
    if (!caixa) return "sem_caixa";
    const estado = ((await this.prisma.mktSetting.findUnique({ where: { chave: estadoImap(chave) } }))?.valor ?? {}) as { uid?: number; uidValidity?: string };
    const lote = await caixa.novas({ uid: estado.uid, uidValidity: estado.uidValidity, data: new Date(agora.getTime() - 14 * 86_400_000) }, LOTE_CAIXA);
    const r = await this.processarFontes(lote.emails, agora, escopo, chave);
    const valor = { uid: lote.maiorUid, uidValidity: lote.uidValidity };
    await this.prisma.mktSetting.upsert({ where: { chave: estadoImap(chave) }, create: { chave: estadoImap(chave), valor }, update: { valor } });
    return r;
  }

  // Uma rotina de leitura por caixa que dá para ler (IMAP configurado).
  rotinasDeLeitura(): { caixa: VendedorCaixa; nome: string }[] {
    return VENDEDOR_CAIXAS.filter((c) => this.caixa(c)).map((caixa) => ({ caixa, nome: `prospeccao-caixa-${caixa}` }));
  }

  private async lerUma(caixa: VendedorCaixa, agora: Date): Promise<void> {
    if (this.lendo.has(caixa)) return;
    this.lendo.add(caixa);
    try {
      await trackRoutine(`prospeccao-caixa-${caixa}`, ROTINA_MS, async () => {
        const r = await this.lerCaixa(agora, {}, caixa);
        if (r !== "sem_caixa" && (r.respostas || r.saidas || r.devolvidos)) this.logger.log(`Caixa ${CAIXAS_EMAIL[caixa].endereco}: ${r.respostas} resposta(s), ${r.saidas} saída(s), ${r.devolvidos} devolvido(s).`);
      });
    } finally {
      this.lendo.delete(caixa);
    }
  }

  // Lê todas as caixas uma vez (cada uma com o seu registro de rotina).
  async lerTodasAsCaixas(agora = new Date()): Promise<void> {
    for (const r of this.rotinasDeLeitura()) await this.lerUma(r.caixa, agora);
  }

  async processarFontes(emails: EmailBruto[], agora = new Date(), escopo: Escopo = {}, chave: VendedorCaixa = "prospeccao"): Promise<ResultadoCaixa> {
    const r: ResultadoCaixa = { respostas: 0, aquecimento: 0, automaticas: 0, devolvidos: 0, saidas: 0, ignorados: 0, repetidos: 0 };
    for (const e of emails) {
      try {
        const lido = await lerEmail(e.fonte);
        const tipo = await this.processarEmail(lido, agora, escopo, chave);
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

  async processarEmail(lido: EmailLido, agora: Date, escopo: Escopo = {}, chave: VendedorCaixa = "prospeccao"): Promise<keyof ResultadoCaixa> {
    const etiquetas = etiquetasAquecimento(chave);
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
    const vendedorId = card.salesAgentId ?? (await this.adotar(card.id, card.segment, escopo));
    const msg = await this.prisma.prospectMessage.create({
      data: {
        prospectId: card.id,
        salesAgentId: vendedorId,
        channel: "email",
        direction: "in",
        kind: "resposta",
        mailbox: chave,
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
  // fica com um vendedor elegível do segmento (o de menos carga).
  private async adotar(cardId: string, segmento: string, escopo: Escopo): Promise<string | null> {
    const vendedores = (await this.elegiveis(escopo)).filter((v) => atende(v, segmento));
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
      const texto = `Pronto, tiramos o seu e-mail da nossa lista: você não vai mais receber e-mails de prospecção da NovoSeminovo. ${vendedorFeminino(card.salesAgent.slug) ? "Obrigada" : "Obrigado"} pela atenção.\n\n${assinaturaDe(card.salesAgent)}`;
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
            system: sistemaVendedor({ nome: v.name, slug: v.slug }, notas, card.segment),
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
    const r = finalizarRascunho(bruto, { nome: v.name, slug: v.slug, entrada: msg.body, assinatura: assinaturaDe(v) });
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
    if ((await this.geral()).pausarTodos || v.paused || !v.active || !this.caixaPronta(v.mailbox)) return "pausado";
    // Toda resposta sai com a assinatura do vendedor (o dono pode ter escrito à mão sem ela).
    const assinatura = assinaturaDe(v);
    const corpo = (d.finalText ?? d.replyText).trim();
    const texto = corpo.includes(assinatura) ? corpo : `${corpo}\n\n${assinatura}`;
    let messageId: string | undefined;
    let caixa: VendedorCaixa | undefined;
    try {
      if (d.channel === "whatsapp") {
        const enviar = this.whatsapp();
        if (!card.whatsappOptInAt || !card.whatsapp) throw new Error("A empresa não autorizou o WhatsApp.");
        if (!enviar) throw new Error("WhatsApp não configurado no servidor.");
        await enviar(card.whatsapp, texto);
      } else {
        if ((await this.emailsHoje(v.id, agora)) >= v.dailyEmailCap) return "teto_do_dia";
        ({ messageId, caixa } = await this.enviarEmail(card, v, d.inbound, texto, agora));
      }
    } catch (error) {
      let msg = error instanceof Error ? error.message : String(error);
      for (const c of VENDEDOR_CAIXAS) msg = semSenha(msg, caixaSmtpConfig(c));
      msg = msg.slice(0, 300);
      await this.prisma.prospectReplyDraft.update({ where: { id }, data: { status: "erro", error: msg } });
      if (d.channel === "whatsapp") await this.tarefa(card, `Responder ${card.name} no WhatsApp`, "whatsapp", `A resposta aprovada não saiu pelo WhatsApp (${msg}). Mande à mão.`, agora);
      return "erro";
    }
    await this.prisma.prospectMessage.create({ data: { prospectId: card.id, salesAgentId: v.id, channel: d.channel, direction: "out", kind: "resposta", messageId, mailbox: caixa, subject: d.channel === "email" ? assuntoRe(d.inbound.subject) : null, body: texto, createdAt: agora, receivedAt: agora } });
    await this.prisma.prospectReplyDraft.update({ where: { id }, data: { status: "enviado", sentAt: agora } });
    await this.aplicarCrm(card, d, agora);
    return "enviado";
  }

  // Envia por e-mail na mesma conversa (In-Reply-To/References), com rodapé
  // legal e link de saída, pela caixa onde a mensagem chegou (se ela pode
  // mandar) ou pela caixa do vendedor. Devolve o Message-ID e a caixa.
  private async enviarEmail(card: SalesProspect, v: SalesAgent, inbound: ProspectMessage, texto: string, agora: Date, opcoes: { semRodape?: boolean } = {}): Promise<{ messageId: string; caixa: VendedorCaixa }> {
    const chegou = inbound.mailbox ?? (inbound.channel === "email" ? "prospeccao" : null);
    const caixa = this.caixaPronta(chegou) ? chegou : this.caixaPronta(v.mailbox) ? v.mailbox : undefined;
    if (!caixa) throw new Error("SMTP da prospecção não configurado.");
    const cfg = caixaSmtpConfig(caixa);
    if (!card.email) throw new Error("Empresa sem e-mail.");
    const linkSair = `${webOrigin()}/sair/${this.sequencias.tokenSair(card.id)}`;
    const email = renderizarEmail({ assunto: "", corpo: texto, esperaDias: 1 }, { empresa: card.name, cidade: card.city ?? undefined }, { linkSair, numero: 2, assuntoPrimeiro: semRe(inbound.subject) || "NovoSeminovo" });
    const messageId = `<resposta.${card.id}.${randomBytes(6).toString("hex")}@novoseminovo.com.br>`;
    const umClique = `${(process.env.PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/prospeccao/sair/${this.sequencias.tokenSair(card.id)}`;
    const https = /^https:\/\//.test(umClique);
    const cabecalhos: Record<string, string> = {
      "List-Unsubscribe": `${https ? `<${umClique}>, ` : ""}<mailto:${cfg?.user ?? CAIXAS_EMAIL[caixa].endereco}?subject=SAIR>`,
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
      deNome: nomeRemetente(caixa) ?? `${v.name} | NovoSeminovo`,
      caixa,
      cabecalhos,
    });
    if (opcoes.semRodape) await this.prisma.prospectMessage.create({ data: { prospectId: card.id, salesAgentId: v.id, channel: "email", direction: "out", kind: "saida", messageId, mailbox: caixa, subject: email.assunto, body: texto, createdAt: agora, receivedAt: agora } });
    return { messageId, caixa };
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

  private vista(v: SalesAgent, seq: { id: string; name: string; status: string; approvedAt: Date | null } | null, agora: Date, caixas: CaixaStatus[]) {
    return {
      id: v.id,
      slug: v.slug,
      nome: v.name,
      titulo: v.displayTitle,
      ativo: v.active,
      pausado: v.paused,
      caixa: v.mailbox ?? undefined,
      segmentos: v.segments.filter((x): x is VendedorSegmento => x in VENDEDOR_SEGMENTOS),
      assinatura: assinaturaDe(v),
      caixaStatus: v.mailbox && caixaConhecida(v.mailbox) ? caixas.find((c) => c.chave === v.mailbox) : undefined,
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
    const caixas = this.statusCaixas(vendedores);
    for (const v of vendedores) lista.push({ ...this.vista(v, seqs.find((s) => s.id === v.sequenceId) ?? null, agora, caixas), numeros: await this.numeros(v, agora) });
    return {
      geral: await this.geral(),
      iaLigada: Boolean(this.modelo()),
      caixaConfigurada: caixas.some((c) => c.configurada),
      leituraConfigurada: caixas.some((c) => c.leitura),
      caixas,
      semVendedor: await this.semVendedorPorSegmento(vendedores),
      vendedores: lista,
    };
  }

  async detalhe(id: string, agora = new Date()): Promise<{ vendedor: VendedorPainel; recentes: RascunhoVista[] }> {
    const v = await this.vendedor(id);
    const seq = v.sequenceId ? await this.prisma.prospectSequence.findUnique({ where: { id: v.sequenceId }, select: { id: true, name: true, status: true, approvedAt: true } }) : null;
    const recentes = await this.rascunhos({ salesAgentId: v.id, status: { in: ["enviado", "rejeitado", "erro", "descartado", "aprovado"] } }, 30);
    const caixas = this.statusCaixas(await this.prisma.salesAgent.findMany({ where: { active: true } }));
    return { vendedor: { ...this.vista(v, seq, agora, caixas), numeros: await this.numeros(v, agora) }, recentes };
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

  // Distribuir, escrever rascunhos e mandar os aprovados (a leitura das
  // caixas tem rotinas próprias, uma por caixa).
  async rodada(agora = new Date()): Promise<void> {
    await this.garantirVendedores(agora);
    await this.distribuir(agora);
    await this.redigirPendentes(agora);
    await this.enviarAprovados(agora);
  }

  // A cada 5 minutos: a rodada e a leitura de cada caixa configurada (cada
  // uma com o seu nome no painel de rotinas). Desligadas em teste ou com
  // PROSPECCAO_DISABLED=1.
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
    for (const r of this.rotinasDeLeitura()) {
      const t = setInterval(() => void this.lerUma(r.caixa, new Date()), ROTINA_MS);
      t.unref();
      this.leituras.push(t);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    for (const t of this.leituras) clearInterval(t);
    this.leituras = [];
    registrarRotaProspeccao(undefined);
  }
}

const semRe = (s: string | null | undefined) => (s ?? "").replace(/^(\s*(re|res|resp|enc|fw|fwd)\s*:\s*)+/i, "").trim();
const assuntoRe = (s: string | null | undefined) => `Re: ${semRe(s) || "NovoSeminovo"}`.slice(0, 200);
