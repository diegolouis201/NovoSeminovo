import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import {
  PROSPECCAO_MOTIVO_PARADA,
  ProspeccaoAjustesSchema,
  ProspeccaoInscreverSchema,
  ProspeccaoPassoSchema,
  ProspeccaoSequenciaSchema,
  SEQUENCIA_LOJAS_BH,
  type ProspeccaoAjustes,
  type ProspeccaoInscricao,
  type ProspeccaoPainel,
  type ProspeccaoPasso,
  type ProspeccaoSequencia,
  type ProspeccaoSequenciaInput,
} from "@novoseminovo/shared-types";
import { z } from "zod";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { parseOrBadRequest } from "../common/parse";
import { signLink, verifyLink, webOrigin } from "../marketing/links";
import { trackRoutine } from "../operations/routine-health";
import { PrismaService } from "../prisma/prisma.service";
import { agendarPasso, inicioDoDiaBr, intervaloEntreEnvios, motivoParaParar, podeEnviar, renderizarEmail, type MotivoParada } from "./sequencia-regras";
import { criarEnvio, prospeccaoSmtpConfig, semSenha, type EnviarProspeccao } from "./smtp";

// Sequências de e-mail de prospecção pelo CRM do Hub. Segurança:
// - só envia sequência aprovada pelo dono ("Aprovar e ativar"; editar tira
//   a aprovação) e com o envio geral não pausado;
// - seg–sex 9h–17h (Brasília), teto por dia (padrão 25, máx. 50), um e-mail
//   por vez com 2 a 6 minutos de intervalo sorteado;
// - antes de cada envio confere: respondeu, saiu (lista de bloqueio pelo
//   HMAC do e-mail), "não contatar" do Hub, mudou de etapa, virou parceira;
// - todo e-mail leva rodapé legal + link de saída; todo envio vira
//   interação "E-mail" na ficha da empresa.

const AJUSTES = "prospeccao";
const ESTADO = "prospeccao_estado";
const SAIR_PREFIXO = "prospeccao-sair|";
const ROTINA_MS = 60_000;
const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");
const ATIVOS = ["agendado", "enviando"];

export type ResultadoTick = "desligado" | "sem_smtp" | "pausado" | "fora_do_horario" | "teto_do_dia" | "intervalo" | "nada_para_enviar" | "enviado" | "erro";
export type ResultadoInscricao = { inscritas: number; puladas: { jaInscritas: number; emOutraSequencia: number; semEmail: number; sairam: number; parceiras: number; outraEtapa: number } };

const passosDe = (json: Prisma.JsonValue): ProspeccaoPasso[] => z.array(ProspeccaoPassoSchema).catch([]).parse(json);

@Injectable()
export class ProspeccaoSequenciasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Prospecção");
  private timer?: NodeJS.Timeout;
  private rodando = false;
  private envioDeTeste?: EnviarProspeccao;

  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ ajustes

  async ajustes(): Promise<ProspeccaoAjustes> {
    const r = await this.prisma.mktSetting.findUnique({ where: { chave: AJUSTES } });
    return ProspeccaoAjustesSchema.catch({ limiteDiario: 25, pausado: false }).parse(r?.valor ?? {});
  }

  async salvarAjustes(raw: ProspeccaoAjustes): Promise<ProspeccaoAjustes> {
    const valor = parseOrBadRequest(ProspeccaoAjustesSchema as z.ZodType<ProspeccaoAjustes>, raw);
    await this.prisma.mktSetting.upsert({ where: { chave: AJUSTES }, create: { chave: AJUSTES, valor }, update: { valor } });
    return valor;
  }

  private async liberadoApos(): Promise<Date | undefined> {
    const r = await this.prisma.mktSetting.findUnique({ where: { chave: ESTADO } });
    const v = (r?.valor as { liberadoApos?: string } | null)?.liberadoApos;
    return v ? new Date(v) : undefined;
  }

  private async liberarEm(d: Date) {
    const valor = { liberadoApos: d.toISOString() };
    await this.prisma.mktSetting.upsert({ where: { chave: ESTADO }, create: { chave: ESTADO, valor }, update: { valor } });
  }

  // ------------------------------------------------------------ sequências

  // Rascunho "Lojas BH" com os textos do Diego (nunca ativo sozinho).
  async garantirRascunhoLojasBh(): Promise<string> {
    const existe = await this.prisma.prospectSequence.findFirst({ where: { name: SEQUENCIA_LOJAS_BH.nome }, select: { id: true } });
    if (existe) return existe.id;
    const s = await this.prisma.prospectSequence.create({ data: { name: SEQUENCIA_LOJAS_BH.nome, status: "rascunho", steps: SEQUENCIA_LOJAS_BH.passos as Prisma.InputJsonValue } });
    return s.id;
  }

  async salvar(id: string | undefined, raw: ProspeccaoSequenciaInput, userId: string): Promise<{ id: string }> {
    const input = parseOrBadRequest(ProspeccaoSequenciaSchema, raw);
    const data = { name: input.nome, steps: input.passos as Prisma.InputJsonValue };
    if (!id) return this.prisma.prospectSequence.create({ data: { ...data, createdById: userId, status: "rascunho" }, select: { id: true } });
    await this.existe(id);
    // Texto mudou: volta para rascunho e precisa ser aprovado de novo.
    await this.prisma.prospectSequence.update({ where: { id }, data: { ...data, status: "rascunho", approvedAt: null, approvedById: null } });
    return { id };
  }

  private async existe(id: string) {
    const s = await this.prisma.prospectSequence.findUnique({ where: { id: parseOrBadRequest(IdSchema, id) } });
    if (!s) throw new NotFoundException("Sequência não encontrada.");
    return s;
  }

  async aprovar(id: string, userId: string): Promise<void> {
    const s = await this.existe(id);
    if (!passosDe(s.steps).length) throw new BadRequestException("Sequência sem e-mails.");
    await this.prisma.prospectSequence.update({ where: { id }, data: { status: "ativa", approvedAt: new Date(), approvedById: userId } });
  }

  async pausar(id: string): Promise<void> {
    await this.existe(id);
    await this.prisma.prospectSequence.update({ where: { id }, data: { status: "pausada" } });
  }

  async painel(): Promise<ProspeccaoPainel> {
    await this.garantirRascunhoLojasBh();
    const [ajustes, cfg, rows, contagens, enviadosHoje] = await Promise.all([
      this.ajustes(),
      Promise.resolve(prospeccaoSmtpConfig()),
      this.prisma.prospectSequence.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.prospectEnrollment.groupBy({ by: ["sequenceId", "status"], _count: { _all: true } }),
      this.prisma.prospectEmailLog.count({ where: { status: "enviado", createdAt: { gte: inicioDoDiaBr(new Date()) } } }),
    ]);
    const aprovadores = await this.nomes(rows.map((r) => r.approvedById));
    return {
      ajustes,
      enviadosHoje,
      smtpConfigurado: Boolean(cfg),
      remetente: cfg ? `${cfg.fromName} <${cfg.user}>` : undefined,
      rotinaDesligada: this.desligada(),
      sequencias: rows.map((r) => this.vista(r, aprovadores, contagens)),
    };
  }

  private async nomes(ids: (string | null)[]): Promise<Map<string, string>> {
    const lista = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = lista.length ? await this.prisma.user.findMany({ where: { id: { in: lista } }, select: { id: true, name: true } }) : [];
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private vista(r: { id: string; name: string; status: string; steps: Prisma.JsonValue; approvedById: string | null; approvedAt: Date | null; updatedAt: Date }, aprovadores: Map<string, string>, contagens: { sequenceId: string; status: string; _count: { _all: number } }[]): ProspeccaoSequencia {
    return {
      id: r.id,
      nome: r.name,
      status: r.status as ProspeccaoSequencia["status"],
      passos: passosDe(r.steps),
      aprovadaPor: r.approvedById ? aprovadores.get(r.approvedById) : undefined,
      aprovadaEm: r.approvedAt?.toISOString(),
      atualizadaEm: r.updatedAt.toISOString(),
      inscritas: Object.fromEntries(contagens.filter((c) => c.sequenceId === r.id).map((c) => [c.status, c._count._all])),
    };
  }

  async detalhe(id: string): Promise<{ sequencia: ProspeccaoSequencia; inscricoes: ProspeccaoInscricao[]; previa: { assunto: string; texto: string; html: string }[]; exemplo: string }> {
    const s = await this.existe(id);
    const [aprovadores, contagens, inscricoes] = await Promise.all([
      this.nomes([s.approvedById]),
      this.prisma.prospectEnrollment.groupBy({ by: ["sequenceId", "status"], where: { sequenceId: id }, _count: { _all: true } }),
      this.prisma.prospectEnrollment.findMany({ where: { sequenceId: id }, include: { prospect: { select: { id: true, name: true, city: true } } }, orderBy: [{ updatedAt: "desc" }], take: 500 }),
    ]);
    // Prévia com uma empresa de verdade inscrita (ou uma de exemplo).
    const amostra = inscricoes[0]?.prospect ?? { id: "exemplo", name: "Loja Exemplo Veículos", city: "Belo Horizonte" };
    const passos = passosDe(s.steps);
    const primeiro = passos[0] ? renderizarEmail(passos[0], { empresa: amostra.name, cidade: amostra.city ?? undefined }, { linkSair: this.linkSair(amostra.id), numero: 1 }).assunto : "";
    return {
      sequencia: this.vista(s, aprovadores, contagens),
      exemplo: amostra.name,
      previa: passos.map((p, i) => renderizarEmail(p, { empresa: amostra.name, cidade: amostra.city ?? undefined }, { linkSair: this.linkSair(amostra.id), numero: i + 1, assuntoPrimeiro: primeiro })),
      inscricoes: inscricoes.map((e) => ({
        id: e.id,
        empresa: e.prospect.name,
        cardId: e.prospect.id,
        status: e.status as ProspeccaoInscricao["status"],
        passosEnviados: e.stepsSent,
        proximoEnvio: ATIVOS.includes(e.status) ? e.nextSendAt?.toISOString() : undefined,
        ultimoEnvio: e.lastSentAt?.toISOString(),
        motivo: e.stopReason ? (PROSPECCAO_MOTIVO_PARADA[e.stopReason as keyof typeof PROSPECCAO_MOTIVO_PARADA] ?? e.stopReason) : undefined,
        erro: e.lastError ?? undefined,
      })),
    };
  }

  // ------------------------------------------------------------ inscrição

  private hashEmail(email: string): string {
    return blindIndex("email", email, currentDataKeys());
  }

  private async suprimidos(emails: string[]): Promise<Set<string>> {
    if (!emails.length) return new Set();
    const hashes = emails.map((e) => this.hashEmail(e));
    const rows = await this.prisma.prospectSuppression.findMany({ where: { addressHmac: { in: hashes } }, select: { addressHmac: true } });
    return new Set(rows.map((r) => r.addressHmac));
  }

  private async naoContatar(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const marcas = await this.prisma.hubMark.findMany({ where: { key: { in: ids }, naoContatar: true }, select: { key: true } });
    return new Set(marcas.map((m) => m.key));
  }

  async inscrever(id: string, raw: z.input<typeof ProspeccaoInscreverSchema>, userId: string, agora = new Date()): Promise<ResultadoInscricao> {
    await this.existe(id);
    const filtro = parseOrBadRequest(ProspeccaoInscreverSchema, raw);
    const cards = await this.prisma.salesProspect.findMany({
      where: { AND: [filtro.etiqueta ? { campaignTag: filtro.etiqueta } : {}, filtro.ids?.length ? { id: { in: filtro.ids } } : {}] },
      select: { id: true, email: true, stage: true, partnerId: true, optedOutAt: true, repliedAt: true, emailInvalidAt: true },
      take: 5000,
    });
    const r: ResultadoInscricao = { inscritas: 0, puladas: { jaInscritas: 0, emOutraSequencia: 0, semEmail: 0, sairam: 0, parceiras: 0, outraEtapa: 0 } };
    const bloqueados = await this.suprimidos(cards.map((c) => c.email).filter((e): e is string => Boolean(e)));
    const marcados = await this.naoContatar(cards.map((c) => c.id));
    const jaNesta = new Set((await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: id, prospectId: { in: cards.map((c) => c.id) } }, select: { prospectId: true } })).map((e) => e.prospectId));
    const quando = agendarPasso(agora, 0);
    for (const c of cards) {
      if (jaNesta.has(c.id)) {
        r.puladas.jaInscritas++;
        continue;
      }
      if (c.partnerId) {
        r.puladas.parceiras++;
        continue;
      }
      if (!c.email || c.emailInvalidAt) {
        r.puladas.semEmail++;
        continue;
      }
      if (c.optedOutAt || marcados.has(c.id) || bloqueados.has(this.hashEmail(c.email))) {
        r.puladas.sairam++;
        continue;
      }
      if (c.stage !== "a_abordar" || c.repliedAt) {
        r.puladas.outraEtapa++;
        continue;
      }
      try {
        // activeKey único: a empresa não fica em duas sequências ativas.
        await this.prisma.prospectEnrollment.create({ data: { sequenceId: id, prospectId: c.id, activeKey: c.id, status: "agendado", nextSendAt: quando, enrolledById: userId } });
        r.inscritas++;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        const mesma = await this.prisma.prospectEnrollment.findUnique({ where: { sequenceId_prospectId: { sequenceId: id, prospectId: c.id } }, select: { id: true } });
        if (mesma) r.puladas.jaInscritas++;
        else r.puladas.emOutraSequencia++;
      }
    }
    return r;
  }

  // ------------------------------------------------------------ parar

  private async parar(prospectId: string, status: "respondeu" | "saiu" | "parou", motivo: MotivoParada | "removida") {
    await this.prisma.prospectEnrollment.updateMany({ where: { prospectId, status: { in: ATIVOS } }, data: { status, stopReason: motivo, activeKey: null, nextSendAt: null } });
  }

  async respondeu(prospectId: string, userId: string): Promise<void> {
    const id = parseOrBadRequest(IdSchema, prospectId);
    const card = await this.prisma.salesProspect.findUnique({ where: { id }, select: { id: true } });
    if (!card) throw new NotFoundException("Empresa não encontrada.");
    await this.prisma.salesProspect.update({ where: { id }, data: { repliedAt: new Date() } });
    await this.parar(id, "respondeu", "respondeu");
    await this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind: "email", body: "Respondeu o e-mail de prospecção. A sequência de e-mails parou para esta empresa." } });
  }

  // Token do link de saída: id do card + assinatura (HMAC).
  tokenSair(prospectId: string): string {
    return `${prospectId}.${signLink(`${SAIR_PREFIXO}${prospectId}`)}`;
  }

  private linkSair(prospectId: string): string {
    return `${webOrigin()}/sair/${this.tokenSair(prospectId)}`;
  }

  async sair(token: string): Promise<boolean> {
    const m = /^([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
    if (!m || !verifyLink(`${SAIR_PREFIXO}${m[1]}`, m[2]!)) return false;
    const card = await this.prisma.salesProspect.findUnique({ where: { id: m[1]! }, select: { id: true, email: true, optedOutAt: true } });
    if (!card) return false;
    if (!card.optedOutAt) {
      await this.prisma.salesProspect.update({ where: { id: card.id }, data: { optedOutAt: new Date() } });
      await this.prisma.salesNote.create({ data: { prospectId: card.id, kind: "note", body: "Pediu para sair dos e-mails de prospecção (link do e-mail). Nenhum e-mail de sequência será enviado para este endereço." } });
    }
    if (card.email) await this.prisma.prospectSuppression.upsert({ where: { addressHmac: this.hashEmail(card.email) }, create: { addressHmac: this.hashEmail(card.email), reason: "link" }, update: {} });
    await this.parar(card.id, "saiu", "saiu");
    return true;
  }

  // ------------------------------------------------------------ envio

  // Testes trocam o envio (sem SMTP de verdade).
  usarEnvio(envio: EnviarProspeccao | undefined) {
    this.envioDeTeste = envio;
  }

  private desligada(): boolean {
    return process.env.NODE_ENV === "test" || process.env.PROSPECCAO_DISABLED === "1";
  }

  // Um e-mail por vez. somenteSequencias: só para os testes isolarem os dados.
  async tick(agora = new Date(), opcoes: { somenteSequencias?: string[] } = {}): Promise<ResultadoTick> {
    const cfg = prospeccaoSmtpConfig();
    if (!cfg && !this.envioDeTeste) return "sem_smtp";
    const ajustes = await this.ajustes();
    const enviadosHoje = await this.prisma.prospectEmailLog.count({ where: { status: "enviado", createdAt: { gte: inicioDoDiaBr(agora), lte: agora } } });
    const pode = podeEnviar({ agora, enviadosHoje, limite: ajustes.limiteDiario, pausado: ajustes.pausado, liberadoApos: await this.liberadoApos() });
    if (!pode.ok) return pode.motivo;

    // Vendedores IA que não podem mandar agora (pausados, sem caixa, fora do
    // ar, teto do dia deles, pausa geral): os cards deles esperam.
    const bloqueados = await this.vendedoresBloqueados(agora);
    for (let tentativas = 0; tentativas < 25; tentativas++) {
      const e = await this.prisma.prospectEnrollment.findFirst({
        where: {
          status: "agendado",
          nextSendAt: { lte: agora },
          sequence: { status: "ativa", approvedAt: { not: null } },
          ...(opcoes.somenteSequencias ? { sequenceId: { in: opcoes.somenteSequencias } } : {}),
          ...(bloqueados.length ? { prospect: { OR: [{ salesAgentId: null }, { salesAgentId: { notIn: bloqueados } }] } } : {}),
        },
        orderBy: [{ nextSendAt: "asc" }, { createdAt: "asc" }],
        include: { sequence: true, prospect: { select: { id: true, name: true, city: true, email: true, stage: true, repliedAt: true, optedOutAt: true, partnerId: true, emailInvalidAt: true, salesAgent: { select: { id: true, name: true } } } } },
      });
      if (!e) return "nada_para_enviar";
      const p = e.prospect;
      const motivo = p.emailInvalidAt ? "sem_email" : motivoParaParar(p, {
        suprimido: p.email ? (await this.suprimidos([p.email])).size > 0 : false,
        naoContatar: (await this.naoContatar([p.id])).size > 0,
      });
      if (motivo) {
        const status = motivo === "respondeu" ? "respondeu" : motivo === "saiu" ? "saiu" : motivo === "sem_email" ? (p.emailInvalidAt ? "parou" : "erro") : "parou";
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status, stopReason: motivo, activeKey: null, nextSendAt: null } });
        continue;
      }
      const passos = passosDe(e.sequence.steps);
      const n = e.stepsSent;
      const passo = passos[n];
      if (!passo) {
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "concluido", activeKey: null, nextSendAt: null } });
        continue;
      }
      // Trava: só um envio por inscrição, mesmo com duas rotinas ao mesmo tempo.
      const trava = await this.prisma.prospectEnrollment.updateMany({ where: { id: e.id, status: "agendado", stepsSent: n }, data: { status: "enviando" } });
      if (trava.count !== 1) continue;
      return this.enviar(e, passos, n, agora, cfg);
    }
    return "nada_para_enviar";
  }

  private async enviar(
    e: { id: string; firstMessageId: string | null; firstSubject: string | null; sequence: { name: string }; prospect: { id: string; name: string; city: string | null; email: string | null; salesAgent: { id: string; name: string } | null } },
    passos: ProspeccaoPasso[],
    n: number,
    agora: Date,
    cfg: ReturnType<typeof prospeccaoSmtpConfig>,
  ): Promise<ResultadoTick> {
    const p = e.prospect;
    const email = renderizarEmail(passos[n]!, { empresa: p.name, cidade: p.city ?? undefined }, { linkSair: this.linkSair(p.id), numero: n + 1, assuntoPrimeiro: e.firstSubject ?? undefined });
    const messageId = `<prospeccao.${e.id}.${n + 1}.${randomBytes(6).toString("hex")}@novoseminovo.com.br>`;
    const umClique = `${(process.env.PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/prospeccao/sair/${this.tokenSair(p.id)}`;
    const remetente = cfg?.user ?? "contato@novoseminovo.com.br";
    // Descadastro de um clique (Gmail/Yahoo) só com o endereço https da API.
    const https = /^https:\/\//.test(umClique);
    const cabecalhos: Record<string, string> = {
      "List-Unsubscribe": `${https ? `<${umClique}>, ` : ""}<mailto:${remetente}?subject=SAIR>`,
      ...(https ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
    };
    await this.liberarEm(new Date(agora.getTime() + intervaloEntreEnvios()));
    try {
      const envio = this.envioDeTeste ?? criarEnvio(cfg!);
      await envio({ para: p.email!, assunto: email.assunto, texto: email.texto, html: email.html, messageId, inReplyTo: n > 0 ? (e.firstMessageId ?? undefined) : undefined, cabecalhos, deNome: p.salesAgent ? `${p.salesAgent.name} | NovoSeminovo` : undefined });
    } catch (error) {
      const msg = semSenha(error instanceof Error ? error.message : String(error), cfg).slice(0, 300);
      this.logger.warn(`Falha ao enviar e-mail de prospecção (inscrição ${e.id}, passo ${n + 1}): ${msg}`);
      await this.prisma.prospectEmailLog.create({ data: { enrollmentId: e.id, step: n + 1, status: "erro", error: msg, createdAt: agora, salesAgentId: p.salesAgent?.id } });
      await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "erro", lastError: msg, activeKey: null, nextSendAt: null } });
      return "erro";
    }
    const ultimo = n + 1 >= passos.length;
    await this.prisma.prospectEmailLog.create({ data: { enrollmentId: e.id, step: n + 1, status: "enviado", messageId, createdAt: agora, salesAgentId: p.salesAgent?.id } });
    await this.prisma.prospectEnrollment.update({
      where: { id: e.id },
      data: {
        stepsSent: n + 1,
        lastSentAt: agora,
        lastError: null,
        ...(n === 0 ? { firstMessageId: messageId, firstSubject: email.assunto } : {}),
        ...(ultimo ? { status: "concluido", activeKey: null, nextSendAt: null } : { status: "agendado", nextSendAt: agendarPasso(agora, passos[n + 1]!.esperaDias) }),
      },
    });
    await this.prisma.salesNote.create({ data: { prospectId: p.id, kind: "email", body: `E-mail de prospecção enviado${p.salesAgent ? ` por ${p.salesAgent.name} (assistente comercial IA)` : ""} (sequência "${e.sequence.name}", passo ${n + 1}/${passos.length}): "${email.assunto}".`.slice(0, 2000) } });
    return "enviado";
  }

  // Vendedores IA que não mandam e-mail agora: fora do ar, sem caixa,
  // pausados (ou pausa geral) ou que já bateram o teto do dia deles.
  async vendedoresBloqueados(agora: Date): Promise<string[]> {
    const geral = await this.prisma.mktSetting.findUnique({ where: { chave: "vendedores_ia" } });
    const pausarTodos = Boolean((geral?.valor as { pausarTodos?: boolean } | null)?.pausarTodos);
    const vendedores = await this.prisma.salesAgent.findMany({ select: { id: true, active: true, paused: true, mailbox: true, dailyEmailCap: true } });
    if (!vendedores.length) return [];
    const inicio = inicioDoDiaBr(agora);
    const [logs, respostas] = await Promise.all([
      this.prisma.prospectEmailLog.groupBy({ by: ["salesAgentId"], where: { status: "enviado", createdAt: { gte: inicio, lte: agora }, salesAgentId: { not: null } }, _count: { _all: true } }),
      this.prisma.prospectMessage.groupBy({ by: ["salesAgentId"], where: { direction: "out", channel: "email", createdAt: { gte: inicio, lte: agora }, salesAgentId: { not: null } }, _count: { _all: true } }),
    ]);
    const hoje = new Map<string, number>();
    for (const r of [...logs, ...respostas]) hoje.set(r.salesAgentId!, (hoje.get(r.salesAgentId!) ?? 0) + r._count._all);
    return vendedores.filter((v) => pausarTodos || !v.active || v.paused || !v.mailbox || (hoje.get(v.id) ?? 0) >= v.dailyEmailCap).map((v) => v.id);
  }

  // A cada minuto (um e-mail por vez). Desligada em teste ou com PROSPECCAO_DISABLED=1.
  onModuleInit(): void {
    if (this.desligada()) return;
    this.timer = setInterval(() => {
      if (this.rodando) return;
      this.rodando = true;
      void trackRoutine("prospeccao-emails", ROTINA_MS, () => this.tick()).finally(() => {
        this.rodando = false;
      });
    }, ROTINA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
