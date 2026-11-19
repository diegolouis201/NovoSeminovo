import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  NpsEmailFollowUpSchema,
  NpsHubQuerySchema,
  npsFaixa,
  NPS_TIPOS,
  PARTNER_TYPE_LABELS,
  type NpsDashboard,
  type NpsEmailClickResult,
  type NpsEmailConfig,
  type NpsEmailFollowUpInput,
} from "@novoseminovo/shared-types";
import type { PartnerType, Prisma } from "@novoseminovo/db";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { EmailService } from "../email/email.service";
import { webOrigin } from "../marketing/links";
import { trackRoutine } from "../operations/routine-health";
import { PrismaService } from "../prisma/prisma.service";
import { addBusinessDays, computeNps, firstName, isSendWindow, renderNpsEmail, signNpsToken, spDayStart, verifyNpsToken } from "./nps-email";

// Pesquisa NPS por e-mail (pedido do Diego, 11/2026). Uma vez a cada 6 meses
// para lojas, imobiliárias e corretores com conta ativa, 1 lembrete 5 dias
// depois, só em horário comercial e com limite por dia. Fica DESLIGADA até o
// dono aprovar no Hub (NpsEmailSettings.approvedAt); botão de pausa no Hub e
// NPS_EMAIL_DISABLED=1 também param tudo. A resposta vai para a mesma tabela
// do NPS do painel do parceiro (NpsResponse, source "email").

export type NpsEmailMessage = { to: string; subject: string; html: string; text: string; headers: Record<string, string> };
type Sender = (m: NpsEmailMessage) => Promise<{ id: string }>;
type Candidate = { partnerId: string; userId: string; email: string; nome?: string; empresa: string; prospectId?: string };

const DAY_MS = 86_400_000;
export const NPS_EMAIL_EVERY_DAYS = 182; // 6 meses
export const NPS_EMAIL_REMINDER_DAYS = 5;
export const NPS_EMAIL_LINK_DAYS = 30; // validade dos botões de nota
export const NPS_EMAIL_CHANGE_DAYS = 7; // dá para trocar a nota por 7 dias
const UNSUB_DAYS = 3650;
const ROTINA_MS = 10 * 60_000;
const POR_RODADA = 2; // 2 a cada 10 min, no máximo o limite do dia
const TIPOS: PartnerType[] = ["dealership", "real_estate_agency", "broker"];
const TIPO_DE: Partial<Record<PartnerType, keyof typeof NPS_TIPOS>> = { dealership: "loja", real_estate_agency: "imobiliaria", broker: "corretor" };
const TIPO_PRISMA: Record<keyof typeof NPS_TIPOS, PartnerType> = { loja: "dealership", imobiliaria: "real_estate_agency", corretor: "broker" };
const PERIODO_DIAS: Record<string, number | null> = { "90": 90, "180": 180, "365": 365, tudo: null };
export const NPS_TASK_AUTHOR = "nps-email";

const ownerAtivo = { status: "active", blockedAt: null, moderationHoldAt: null, npsEmailOptOutAt: null } satisfies Prisma.UserWhereInput;

@Injectable()
export class NpsEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NpsEmailService.name);
  private sender?: Sender;
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // Testes trocam o envio (nenhum e-mail de verdade sai).
  usarEnvio(fn: Sender | undefined) {
    this.sender = fn;
  }

  private podeEnviar(): boolean {
    return Boolean(this.sender) || this.email.isEnabled();
  }

  private async enviar(m: NpsEmailMessage): Promise<{ id: string }> {
    if (this.sender) return this.sender(m);
    return this.email.sendTransactional(m, "nps");
  }

  // ------------------------------------------------------------ quem recebe

  // Bloqueios além do cadastro: descadastro de e-mails (contatos de
  // marketing), lista de bloqueio da prospecção, "não contatar" do Hub e
  // saída da prospecção no card.
  private async bloqueados(rows: { partnerId: string; userId: string; email: string; prospectId?: string; prospectOptedOut?: boolean }[]): Promise<Set<string>> {
    if (!rows.length) return new Set();
    const keys = currentDataKeys();
    const hmacs = rows.map((r) => blindIndex("email", r.email, keys));
    const [mkt, sup, marks] = await Promise.all([
      this.prisma.marketingContact.findMany({
        where: { userId: { in: rows.map((r) => r.userId) }, OR: [{ unsubscribedAt: { not: null } }, { status: { not: "active" } }] },
        select: { userId: true },
      }),
      this.prisma.prospectSuppression.findMany({ where: { addressHmac: { in: hmacs } }, select: { addressHmac: true } }),
      this.prisma.hubMark.findMany({
        where: { naoContatar: true, key: { in: rows.flatMap((r) => [r.partnerId, ...(r.prospectId ? [r.prospectId] : [])]) } },
        select: { key: true },
      }),
    ]);
    const semEmail = new Set(mkt.map((m) => m.userId));
    const suprimidos = new Set(sup.map((s) => s.addressHmac));
    const naoContatar = new Set(marks.map((m) => m.key));
    const out = new Set<string>();
    rows.forEach((r, i) => {
      if (r.prospectOptedOut || semEmail.has(r.userId) || suprimidos.has(hmacs[i]!) || naoContatar.has(r.partnerId) || (r.prospectId && naoContatar.has(r.prospectId))) out.add(r.partnerId);
    });
    return out;
  }

  async candidates(now: Date, scope?: string[]): Promise<Candidate[]> {
    const desde = new Date(now.getTime() - NPS_EMAIL_EVERY_DAYS * DAY_MS);
    const partners = await this.prisma.partner.findMany({
      where: {
        ...(scope ? { id: { in: scope } } : {}),
        type: { in: TIPOS },
        createdAt: { lte: desde },
        owner: ownerAtivo,
        npsResponses: { none: { createdAt: { gte: desde } } },
        npsEmailSurveys: { none: { test: false, sentAt: { gte: desde } } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, legalName: true, ownerUserId: true, owner: { select: { name: true, email: true } }, salesProspect: { select: { id: true, optedOutAt: true } } },
    });
    const rows = partners.map((p) => ({
      partnerId: p.id,
      userId: p.ownerUserId,
      email: p.owner.email,
      nome: firstName(p.owner.name),
      empresa: p.legalName,
      prospectId: p.salesProspect?.id,
      prospectOptedOut: Boolean(p.salesProspect?.optedOutAt),
    }));
    const fora = await this.bloqueados(rows);
    return rows.filter((r) => !fora.has(r.partnerId)).map(({ prospectOptedOut: _, ...r }) => r);
  }

  private async lembretesPendentes(now: Date, scope?: string[]) {
    const ate = new Date(now.getTime() - NPS_EMAIL_REMINDER_DAYS * DAY_MS);
    const desde = new Date(now.getTime() - (NPS_EMAIL_LINK_DAYS - 1) * DAY_MS);
    const surveys = await this.prisma.npsEmailSurvey.findMany({
      where: {
        test: false,
        reminderSentAt: null,
        response: null,
        sentAt: { lte: ate, gte: desde },
        partner: { ...(scope ? { id: { in: scope } } : {}), type: { in: TIPOS }, owner: ownerAtivo },
      },
      orderBy: { sentAt: "asc" },
      select: { id: true, sentAt: true, partner: { select: { id: true, legalName: true, ownerUserId: true, owner: { select: { name: true, email: true } }, salesProspect: { select: { id: true, optedOutAt: true } } } } },
    });
    const rows = surveys.filter((s) => s.partner).map((s) => ({ s, partner: s.partner! }));
    // Respondeu pelo painel depois do e-mail: sem lembrete.
    const respondidos = new Set(
      (
        await this.prisma.npsResponse.findMany({
          where: { partnerId: { in: rows.map((r) => r.partner.id) }, createdAt: { gte: rows.reduce((min, r) => (r.s.sentAt < min ? r.s.sentAt : min), now) } },
          select: { partnerId: true, createdAt: true },
        })
      )
        .filter((r) => rows.some((x) => x.partner.id === r.partnerId && r.createdAt >= x.s.sentAt))
        .map((r) => r.partnerId),
    );
    const fora = await this.bloqueados(
      rows.map((r) => ({ partnerId: r.partner.id, userId: r.partner.ownerUserId, email: r.partner.owner.email, prospectId: r.partner.salesProspect?.id, prospectOptedOut: Boolean(r.partner.salesProspect?.optedOutAt) })),
    );
    return rows
      .filter((r) => !respondidos.has(r.partner.id) && !fora.has(r.partner.id))
      .map((r) => ({ surveyId: r.s.id, partnerId: r.partner.id, email: r.partner.owner.email, nome: firstName(r.partner.owner.name), empresa: r.partner.legalName }));
  }

  // ------------------------------------------------------------ envio

  private mensagem(surveyId: string, para: { email: string; nome?: string; empresa: string }, now: Date): NpsEmailMessage {
    const exp = new Date(now.getTime() + NPS_EMAIL_LINK_DAYS * DAY_MS);
    const site = webOrigin();
    const notas = Array.from({ length: 11 }, (_, n) => `${site}/nps/r/${signNpsToken(surveyId, n, exp)}`);
    const sairToken = signNpsToken(surveyId, "s", new Date(now.getTime() + UNSUB_DAYS * DAY_MS));
    const m = renderNpsEmail({ nome: para.nome, empresa: para.empresa, notas, sair: `${site}/nps/sair/${sairToken}` });
    const api = (process.env.PUBLIC_API_URL ?? "").replace(/\/+$/, "");
    const headers: Record<string, string> = /^https?:\/\//.test(api)
      ? { "List-Unsubscribe": `<${api}/nps/sair/${sairToken}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : { "List-Unsubscribe": `<${site}/nps/sair/${sairToken}>` };
    return { to: para.email, ...m, headers };
  }

  private async settings() {
    return this.prisma.npsEmailSettings.upsert({ where: { id: "geral" }, create: { id: "geral" }, update: {} });
  }

  private async enviadosHoje(now: Date): Promise<number> {
    const inicio = spDayStart(now);
    const dia = { gte: inicio, lt: new Date(inicio.getTime() + DAY_MS) };
    const [primeiros, lembretes] = await Promise.all([
      this.prisma.npsEmailSurvey.count({ where: { test: false, sentAt: dia } }),
      this.prisma.npsEmailSurvey.count({ where: { test: false, reminderSentAt: dia } }),
    ]);
    return primeiros + lembretes;
  }

  private async motivoDesligado(now: Date): Promise<string | undefined> {
    if (process.env.NPS_EMAIL_DISABLED === "1") return "Desligado no servidor (NPS_EMAIL_DISABLED=1).";
    const s = await this.settings();
    if (!s.approvedAt) return "Aguardando aprovação do dono no Hub.";
    if (s.pausedAt) return "Envio pausado no Hub.";
    if (!this.podeEnviar()) return "E-mail do site não configurado (RESEND_API_KEY).";
    if (!isSendWindow(now)) return "Fora do horário de envio (segunda a sexta, 9h às 18h).";
    return undefined;
  }

  async tick(now = new Date(), opts: { scope?: string[]; budget?: number } = {}): Promise<{ enviados: number; lembretes: number; motivo?: string }> {
    const motivo = await this.motivoDesligado(now);
    if (motivo) return { enviados: 0, lembretes: 0, motivo };
    const { dailyCap } = await this.settings();
    let vagas = Math.min(opts.budget ?? POR_RODADA, Math.max(0, dailyCap - (await this.enviadosHoje(now))));
    if (vagas <= 0) return { enviados: 0, lembretes: 0, motivo: "Limite do dia atingido." };
    let lembretes = 0;
    let enviados = 0;

    for (const r of await this.lembretesPendentes(now, opts.scope)) {
      if (vagas <= 0) break;
      // Marca antes de enviar: nunca dois lembretes, mesmo com rodadas juntas.
      const { count } = await this.prisma.npsEmailSurvey.updateMany({ where: { id: r.surveyId, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!count) continue;
      vagas--;
      try {
        await this.enviar(this.mensagem(r.surveyId, r, now));
        lembretes++;
      } catch (error) {
        this.logger.warn(`Lembrete do NPS não saiu (${r.partnerId}): ${error instanceof Error ? error.message : error}`);
      }
    }

    for (const c of await this.candidates(now, opts.scope)) {
      if (vagas <= 0) break;
      const survey = await this.prisma.npsEmailSurvey.create({ data: { partnerId: c.partnerId, userId: c.userId, sentAt: now } });
      vagas--;
      try {
        await this.enviar(this.mensagem(survey.id, c, now));
        enviados++;
      } catch (error) {
        // Não saiu: apaga para tentar de novo numa próxima rodada.
        await this.prisma.npsEmailSurvey.delete({ where: { id: survey.id } }).catch(() => undefined);
        this.logger.warn(`Pesquisa NPS não saiu (${c.partnerId}): ${error instanceof Error ? error.message : error}`);
      }
    }
    return { enviados, lembretes };
  }

  // ------------------------------------------------------------ resposta

  private async nota(prospectId: string | undefined, body: string) {
    if (prospectId) await this.prisma.salesNote.create({ data: { prospectId, kind: "note", body: body.slice(0, 1900) } });
  }

  async click(token: string, now = new Date()): Promise<NpsEmailClickResult> {
    const v = verifyNpsToken(token, now);
    if (v === "expirado") return { status: "expirado" };
    if (!v || v.kind !== "nota" || v.score === undefined) return { status: "invalido" };
    const score = v.score;
    const survey = await this.prisma.npsEmailSurvey.findUnique({
      where: { id: v.surveyId },
      include: { response: true, partner: { select: { legalName: true, salesProspect: { select: { id: true } } } } },
    });
    if (!survey) return { status: "invalido" };
    const followToken = signNpsToken(survey.id, "c", new Date(now.getTime() + NPS_EMAIL_CHANGE_DAYS * DAY_MS));
    const faixa = npsFaixa(score);

    if (survey.test) {
      if (survey.testAnsweredAt && now.getTime() - survey.testAnsweredAt.getTime() > NPS_EMAIL_CHANGE_DAYS * DAY_MS) {
        return { status: "ja_respondida", score: survey.testScore ?? score, faixa: npsFaixa(survey.testScore ?? score) };
      }
      await this.prisma.npsEmailSurvey.update({ where: { id: survey.id }, data: { testScore: score, testAnsweredAt: survey.testAnsweredAt ?? now } });
      return { status: "ok", score, faixa, followToken, empresa: "Loja Exemplo (e-mail de teste)", teste: true, comment: survey.testComment ?? undefined, wantsContact: survey.testWantsContact ?? undefined, atualizada: survey.testScore !== null };
    }
    if (!survey.partnerId || !survey.partner) return { status: "invalido" };

    let resp = survey.response;
    if (resp && now.getTime() - resp.createdAt.getTime() > NPS_EMAIL_CHANGE_DAYS * DAY_MS) {
      return { status: "ja_respondida", score: resp.score, faixa: npsFaixa(resp.score) };
    }
    const prospectId = survey.partner.salesProspect?.id;
    if (!resp) {
      try {
        resp = await this.prisma.npsResponse.create({ data: { partnerId: survey.partnerId, userId: survey.userId, score, source: "email", surveyId: survey.id, createdAt: now } });
        await this.nota(prospectId, `NPS por e-mail: nota ${score} (${faixa}).`);
        return { status: "ok", score, faixa, followToken, empresa: survey.partner.legalName, teste: false, atualizada: false };
      } catch (error) {
        // Dois cliques ao mesmo tempo: o segundo vira atualização.
        if ((error as { code?: string }).code !== "P2002") throw error;
        resp = await this.prisma.npsResponse.findUniqueOrThrow({ where: { surveyId: survey.id } });
      }
    }
    if (resp.score !== score) {
      await this.prisma.npsResponse.update({ where: { id: resp.id }, data: { score, updatedAt: now, ...(score > 6 ? { wantsContact: null } : {}) } });
      await this.nota(prospectId, `NPS por e-mail: nota ${score} (${faixa}), trocada de ${resp.score}.`);
    }
    return { status: "ok", score, faixa, followToken, empresa: survey.partner.legalName, teste: false, comment: resp.comment ?? undefined, wantsContact: resp.wantsContact ?? undefined, atualizada: true };
  }

  async followUp(raw: NpsEmailFollowUpInput, now = new Date()): Promise<{ ok: true }> {
    const parsed = NpsEmailFollowUpSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const input = parsed.data;
    const v = verifyNpsToken(input.token, now);
    if (v === "expirado") throw new BadRequestException("Link expirado. Obrigado pela nota!");
    if (!v || v.kind !== "acompanhamento") throw new BadRequestException("Link inválido.");
    const survey = await this.prisma.npsEmailSurvey.findUnique({
      where: { id: v.surveyId },
      include: { response: true, partner: { select: { legalName: true, salesProspect: { select: { id: true, ownerId: true } } } } },
    });
    if (!survey) throw new BadRequestException("Link inválido.");
    const comment = input.comment === undefined ? undefined : input.comment || null;

    if (survey.test) {
      const detrator = (survey.testScore ?? 10) <= 6;
      await this.prisma.npsEmailSurvey.update({ where: { id: survey.id }, data: { ...(comment !== undefined ? { testComment: comment } : {}), testWantsContact: detrator ? (input.wantsContact ?? null) : null } });
      return { ok: true };
    }
    const resp = survey.response;
    if (!resp || !survey.partner) throw new BadRequestException("Escolha uma nota no e-mail primeiro.");
    const detrator = resp.score <= 6;
    const wantsContact = detrator ? (input.wantsContact ?? resp.wantsContact ?? null) : null;
    await this.prisma.npsResponse.update({ where: { id: resp.id }, data: { ...(comment !== undefined ? { comment } : {}), wantsContact, updatedAt: now } });
    const prospect = survey.partner.salesProspect;
    const textoNota = [`NPS por e-mail: nota ${resp.score} (${npsFaixa(resp.score)}).`, comment ? `Comentário: “${comment}”.` : "", detrator && wantsContact !== null ? `Quer que a equipe fale com a empresa: ${wantsContact ? "sim" : "não"}.` : ""]
      .filter(Boolean)
      .join(" ");
    await this.nota(prospect?.id, textoNota);

    if (detrator && wantsContact === true && !resp.taskId) {
      const empresa = survey.partner.legalName;
      const task = await this.prisma.hubTask.create({
        data: {
          title: `Ligar para ${empresa} (NPS ${resp.score})`.slice(0, 200),
          kind: "ligacao",
          dueAt: addBusinessDays(now, 2),
          notes: [`Respondeu a pesquisa NPS por e-mail com nota ${resp.score} e pediu que a equipe fale com a empresa.`, comment ? `Comentário: “${comment}”` : ""].filter(Boolean).join("\n").slice(0, 2000),
          prospectId: prospect?.id,
          assigneeId: prospect?.ownerId ?? undefined,
          createdById: NPS_TASK_AUTHOR,
        },
        select: { id: true },
      });
      const { count } = await this.prisma.npsResponse.updateMany({ where: { id: resp.id, taskId: null }, data: { taskId: task.id } });
      if (!count) await this.prisma.hubTask.delete({ where: { id: task.id } });
    }
    return { ok: true };
  }

  // Descadastro (LGPD): vale para a conta inteira, inclusive o lembrete.
  async unsubscribe(token: string, now = new Date()): Promise<boolean> {
    const v = verifyNpsToken(token, now);
    if (!v || v === "expirado" || v.kind !== "sair") return false;
    const survey = await this.prisma.npsEmailSurvey.findUnique({ where: { id: v.surveyId }, select: { userId: true, partner: { select: { salesProspect: { select: { id: true } } } } } });
    if (!survey) return false;
    const { count } = await this.prisma.user.updateMany({ where: { id: survey.userId, npsEmailOptOutAt: null }, data: { npsEmailOptOutAt: now } });
    if (count) await this.nota(survey.partner?.salesProspect?.id, "Pediu para não receber mais a pesquisa NPS por e-mail (link do e-mail). Nenhuma pesquisa por e-mail será enviada.");
    return true;
  }

  // ------------------------------------------------------------ Hub

  async sendTest(userId: string, now = new Date()): Promise<{ para: string; enviado: boolean; motivo?: string; previa: { subject: string; html: string; text: string } }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw new NotFoundException("Conta não encontrada.");
    const survey = await this.prisma.npsEmailSurvey.create({ data: { userId, test: true, sentAt: now } });
    const m = this.mensagem(survey.id, { email: user.email, nome: firstName(user.name), empresa: "Loja Exemplo (e-mail de teste)" }, now);
    const previa = { subject: m.subject, html: m.html, text: m.text };
    if (!this.podeEnviar()) return { para: user.email, enviado: false, motivo: "E-mail do site não configurado (RESEND_API_KEY): veja a prévia abaixo.", previa };
    try {
      await this.enviar(m);
      return { para: user.email, enviado: true, previa };
    } catch (error) {
      return { para: user.email, enviado: false, motivo: `Não foi possível enviar: ${error instanceof Error ? error.message.slice(0, 200) : "erro"}`, previa };
    }
  }

  async approve(userId: string) {
    await this.prisma.npsEmailSettings.upsert({
      where: { id: "geral" },
      create: { id: "geral", approvedAt: new Date(), approvedById: userId },
      update: { approvedAt: new Date(), approvedById: userId, pausedAt: null, pausedById: null },
    });
  }

  async setPaused(userId: string, paused: boolean) {
    await this.settings();
    await this.prisma.npsEmailSettings.update({ where: { id: "geral" }, data: paused ? { pausedAt: new Date(), pausedById: userId } : { pausedAt: null, pausedById: null } });
  }

  async config(now = new Date()): Promise<NpsEmailConfig> {
    const s = await this.settings();
    const [aprovador, enviadosHoje, testes, motivo] = await Promise.all([
      s.approvedById ? this.prisma.user.findUnique({ where: { id: s.approvedById }, select: { name: true } }) : null,
      this.enviadosHoje(now),
      this.prisma.npsEmailSurvey.findMany({ where: { test: true }, orderBy: { sentAt: "desc" }, take: 5, select: { sentAt: true, testScore: true, testAnsweredAt: true } }),
      this.motivoDesligado(now),
    ]);
    const ligado = Boolean(s.approvedAt && !s.pausedAt && process.env.NPS_EMAIL_DISABLED !== "1");
    return {
      aprovadoEm: s.approvedAt?.toISOString(),
      aprovadoPor: aprovador?.name,
      pausadoEm: s.pausedAt?.toISOString(),
      limiteDiario: s.dailyCap,
      ligado,
      motivoDesligado: motivo,
      enviadosHoje,
      testes: testes.map((t) => ({ enviadoEm: t.sentAt.toISOString(), nota: t.testScore ?? undefined, respondidoEm: t.testAnsweredAt?.toISOString() })),
    };
  }

  async dashboard(raw: unknown, now = new Date()): Promise<NpsDashboard> {
    const q = NpsHubQuerySchema.parse(raw ?? {});
    const dias = PERIODO_DIAS[q.periodo];
    const desde = dias ? new Date(now.getTime() - dias * DAY_MS) : new Date(0);
    const tipoFiltro = q.tipo !== "todos" ? TIPO_PRISMA[q.tipo as keyof typeof NPS_TIPOS] : undefined;
    const partnerWhere: Prisma.PartnerWhereInput = tipoFiltro ? { type: tipoFiltro } : {};
    const [respostas, surveys] = await Promise.all([
      this.prisma.npsResponse.findMany({
        where: { createdAt: { gte: desde, lte: now }, partner: partnerWhere },
        orderBy: { createdAt: "desc" },
        select: { id: true, partnerId: true, score: true, comment: true, source: true, wantsContact: true, createdAt: true, partner: { select: { legalName: true, type: true, salesProspect: { select: { id: true } } } } },
      }),
      this.prisma.npsEmailSurvey.findMany({
        where: { test: false, sentAt: { gte: desde, lte: now }, partner: partnerWhere },
        select: { reminderSentAt: true, response: { select: { id: true } } },
      }),
    ]);
    // Uma nota por empresa no período: a mais recente (painel ou e-mail).
    const ultima = new Map<string, (typeof respostas)[number]>();
    for (const r of respostas) if (!ultima.has(r.partnerId)) ultima.set(r.partnerId, r);
    const ultimas = [...ultima.values()];
    const porTipo = (Object.keys(NPS_TIPOS) as (keyof typeof NPS_TIPOS)[])
      .filter((t) => !tipoFiltro || TIPO_PRISMA[t] === tipoFiltro)
      .map((t) => ({ tipo: t, rotulo: NPS_TIPOS[t], ...computeNps(ultimas.filter((r) => TIPO_DE[r.partner.type] === t).map((r) => r.score)) }));
    const respondidos = surveys.filter((s) => s.response).length;
    return {
      periodo: q.periodo,
      tipo: q.tipo,
      geral: computeNps(ultimas.map((r) => r.score)),
      porTipo,
      porOrigem: { painel: respostas.filter((r) => r.source !== "email").length, email: respostas.filter((r) => r.source === "email").length },
      email: { enviados: surveys.length, respondidos, taxaResposta: surveys.length ? Math.round((respondidos / surveys.length) * 100) : null, lembretes: surveys.filter((s) => s.reminderSentAt).length },
      comentarios: respostas
        .filter((r) => r.comment)
        .slice(0, 40)
        .map((r) => ({
          id: r.id,
          empresa: r.partner.legalName,
          empresaId: r.partnerId,
          cardId: r.partner.salesProspect?.id,
          tipo: PARTNER_TYPE_LABELS[r.partner.type] ?? r.partner.type,
          nota: r.score,
          faixa: npsFaixa(r.score),
          comentario: r.comment!,
          origem: r.source === "email" ? "email" : "painel",
          querContato: r.wantsContact ?? undefined,
          data: r.createdAt.toISOString(),
        })),
    };
  }

  // ------------------------------------------------------------ rotina

  private desligada(): boolean {
    return process.env.NODE_ENV === "test" || process.env.NPS_EMAIL_DISABLED === "1";
  }

  // A cada 10 minutos, 2 e-mails no máximo (o limite do dia vale por cima).
  onModuleInit(): void {
    if (this.desligada()) return;
    this.timer = setInterval(() => {
      if (this.rodando) return;
      this.rodando = true;
      void trackRoutine("nps-email", ROTINA_MS, () => this.tick(new Date())).finally(() => {
        this.rodando = false;
      });
    }, ROTINA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
