import { Injectable } from "@nestjs/common";
import {
  type CrmRevenue,
  EMPLOYEE_RANGES,
  LOSS_CATEGORIES,
  PARTNER_TRIAL_DAYS,
  PARTNER_TYPE_LABELS,
  REVENUE_RANGES,
  SALES_STAGE_LABEL,
  type SalesStageId,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService, cardStage, segmentOf } from "../sales/sales.service";
import { buildCrmRevenue } from "./crm-revenue";

// Feed do CRM geral (repositório "CRM NovoSeminovo" no Claude): a jornada de
// cada empresa num lugar só. Sem CPF, senha, cartão ou dado de comprador.

const DAY_MS = 86_400_000;
const SUB_STATUS: Record<string, "ativa" | "em_atraso" | "cancelada"> = { active: "ativa", past_due: "em_atraso", canceled: "cancelada" };
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const day = (date?: Date | null) => date?.toISOString().slice(0, 10);
const byPartnerOf = <T extends { partnerId: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.partnerId as string, r]));
const label = <T extends Record<string, string>>(map: T, key?: string | null) => (key && key in map ? map[key as keyof T] : undefined);
function chamadosResumo(list: { status: string; subject: string; openedAt: Date; resolvedAt: Date | null }[]) {
  const resolved = list.filter((t) => t.resolvedAt);
  const hours = resolved.map((t) => (t.resolvedAt!.getTime() - t.openedAt.getTime()) / 3_600_000);
  return {
    total: list.length,
    abertos: list.filter((t) => t.status === "aberto").length,
    abertoDesde: list.filter((t) => t.status === "aberto").map((t) => t.openedAt).sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString(),
    tempoMedioResolucaoHoras: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : undefined,
    ultimoAssunto: list[0]?.subject,
  };
}
const npsClass = (score: number) => (score >= 9 ? "promotor" : score >= 7 ? "neutro" : "detrator") as "promotor" | "neutro" | "detrator";

export type CrmEmpresa = {
  id: string;
  nome: string;
  tipo: string;
  segmento?: "vehicle" | "property";
  cnpj: string;
  cidade?: string;
  uf?: string;
  pagina: string;
  cadastroNoSiteEm: string;
  abertaEm?: string;
  periodoGratisAte: string;
  verificada: boolean;
  setor?: string;
  porte?: string;
  capitalSocial?: number;
  pais: "Brasil";
  perfil: { funcionarios?: string; faturamento?: string };
  responsavel: { nome: string; cargo?: string; email: string; telefone?: string };
  logo?: string;
  redesSociais: { instagram?: string; facebook?: string };
  autorizaDivulgacaoEm?: string;
  origemMarketing?: { canal: string; meio?: string; campanha?: string };
  uso: { ultimoAcesso?: string; diasSemAcesso?: number; visualizacoes: number };
  chamados: { total: number; abertos: number; abertoDesde?: string; tempoMedioResolucaoHoras?: number; ultimoAssunto?: string };
  nps?: { nota: number; data: string; comentario?: string; classificacao: "promotor" | "neutro" | "detrator" };
  motivoPerda?: { categoria?: string; texto?: string };
  socios: { nome: string; cargo?: string; aniversario?: string }[];
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  origem?: string;
  proximoContato?: string;
  proximoContatoTipo?: string;
  plano?: { nome: string; valorMensal: number; status: "ativa" | "em_atraso" | "cancelada"; mudouEm: string; periodoAte: string };
  pagamentos: { quantidade: number; totalPago: number; ticketMedio?: number; primeiro?: string; ultimo?: string };
  anuncios: { noAr: number; total: number };
  leads: { total: number; ultimos30Dias: number; vendidos: number; paradosMais3Dias: number };
  ultimasAnotacoes: { data: string; tipo: string; texto: string; autor?: string }[];
  // Última ligação, WhatsApp, e-mail ou reunião registrada (régua de relacionamento).
  ultimoContato?: { data: string; tipo: string };
  cardId?: string;
};
export type CrmProspeccao = {
  cardId: string;
  nome: string;
  segmento: string;
  cidade?: string;
  uf?: string;
  contato?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  perfil: { funcionarios?: string; faturamento?: string };
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  proximoContato?: string;
  proximoContatoTipo?: string;
  motivoPerda?: { categoria?: string; texto?: string };
  ultimoContato?: { data: string; tipo: string };
  criadoEm: string;
};
export type CrmFeed = { geradoEm: string; empresas: CrmEmpresa[]; prospeccao: CrmProspeccao[] };

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  // Último contato de verdade por card (não conta anotação de sistema).
  private async lastContacts() {
    const rows = await this.prisma.salesNote.findMany({
      where: { kind: { in: ["ligacao", "whatsapp", "email", "reuniao"] } },
      distinct: ["prospectId"],
      orderBy: [{ prospectId: "asc" }, { createdAt: "desc" }],
      select: { prospectId: true, kind: true, createdAt: true },
    });
    return new Map(rows.map((r) => [r.prospectId, { data: r.createdAt.toISOString(), tipo: r.kind }]));
  }

  async clientes(): Promise<CrmFeed> {
    await this.sales.syncPartners();
    const contatos = await this.lastContacts();
    const now = Date.now();
    const [partners, leadRows, staleRows, recentRows, payments] = await Promise.all([
      this.prisma.partner.findMany({
        take: 5000,
        orderBy: { createdAt: "asc" },
        include: {
          owner: { select: { name: true, email: true, phone: true, acqSource: true, acqMedium: true, acqCampaign: true, lastActiveAt: true } },
          socios: { orderBy: { createdAt: "asc" } },
          subscriptions: { orderBy: { statusChangedAt: "desc" }, take: 1, include: { plan: { select: { name: true, priceMonth: true } } } },
          salesProspect: {
            include: {
              owner: { select: { name: true } },
              notes: { orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: { name: true } } } },
            },
          },
          _count: { select: { listings: true } },
        },
      }),
      this.prisma.lead.groupBy({ by: ["partnerId", "status"], _count: { _all: true } }),
      this.prisma.lead.groupBy({
        by: ["partnerId"],
        where: { status: { in: ["new", "contacted", "visit_scheduled", "negotiating"] }, statusChangedAt: { lt: new Date(now - 3 * DAY_MS) } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({ by: ["partnerId"], where: { createdAt: { gte: new Date(now - 30 * DAY_MS) } }, _count: { _all: true } }),
      this.prisma.subscriptionPayment.groupBy({
        by: ["partnerId"],
        _count: { _all: true },
        _sum: { amount: true, refundedAmount: true },
        _min: { paidAt: true },
        _max: { paidAt: true },
      }),
    ]);
    const [activeListings, views, tickets, npsRows] = await Promise.all([
      this.prisma.listing.groupBy({ by: ["partnerId"], where: { status: "active", partnerId: { not: null } }, _count: { _all: true } }),
      this.prisma.listing.groupBy({ by: ["partnerId"], where: { partnerId: { not: null } }, _sum: { viewsCount: true } }),
      this.prisma.crmTicket.findMany({ select: { prospectId: true, status: true, subject: true, openedAt: true, resolvedAt: true }, orderBy: { openedAt: "desc" } }),
      this.prisma.npsResponse.findMany({ orderBy: { createdAt: "desc" }, distinct: ["partnerId"], select: { partnerId: true, score: true, comment: true, createdAt: true } }),
    ]);
    const viewsBy = byPartnerOf(views);
    const npsBy = new Map(npsRows.map((n) => [n.partnerId, n]));
    const ticketsOf = (prospectId?: string) => (prospectId ? tickets.filter((t) => t.prospectId === prospectId) : []);
    const byPartner = byPartnerOf;
    const active = byPartner(activeListings);
    const stale = byPartner(staleRows);
    const recent = byPartner(recentRows);
    const paid = byPartner(payments);

    const empresas = partners.map((p): CrmEmpresa => {
      const sub = p.subscriptions[0];
      const prospect = p.salesProspect;
      const leads = leadRows.filter((r) => r.partnerId === p.id);
      const noAr = active.get(p.id)?._count._all ?? 0;
      const stage = cardStage(prospect ?? { stage: "a_abordar" }, { activeListings: noAr, subscription: sub?.status as "active" | "past_due" | "canceled" | undefined });
      const pay = paid.get(p.id);
      return {
        id: p.id,
        nome: p.legalName,
        tipo: PARTNER_TYPE_LABELS[p.type] ?? p.type,
        segmento: segmentOf(p.type),
        cnpj: p.document,
        cidade: p.city ?? undefined,
        uf: p.state ?? undefined,
        pagina: `/lojas/${p.slug}`,
        cadastroNoSiteEm: day(p.createdAt)!,
        abertaEm: day(p.foundedAt),
        periodoGratisAte: day(new Date(p.createdAt.getTime() + PARTNER_TRIAL_DAYS * DAY_MS))!,
        verificada: Boolean(p.verifiedAt),
        setor: p.mainActivity ?? undefined,
        porte: p.companySize ?? undefined,
        capitalSocial: p.shareCapital ? money(p.shareCapital) : undefined,
        pais: "Brasil",
        perfil: { funcionarios: label(EMPLOYEE_RANGES, prospect?.employeesRange), faturamento: label(REVENUE_RANGES, prospect?.revenueRange) },
        responsavel: { nome: p.owner.name, cargo: prospect?.contactRole ?? undefined, email: p.owner.email, telefone: p.owner.phone ?? undefined },
        logo: p.logoUrl ?? undefined,
        redesSociais: { instagram: p.instagram ?? undefined, facebook: p.facebook ?? undefined },
        autorizaDivulgacaoEm: p.socialConsentAt?.toISOString(),
        origemMarketing: p.owner.acqSource ? { canal: p.owner.acqSource, meio: p.owner.acqMedium ?? undefined, campanha: p.owner.acqCampaign ?? undefined } : undefined,
        uso: {
          ultimoAcesso: p.owner.lastActiveAt?.toISOString(),
          diasSemAcesso: p.owner.lastActiveAt ? Math.floor((now - p.owner.lastActiveAt.getTime()) / DAY_MS) : undefined,
          visualizacoes: viewsBy.get(p.id)?._sum.viewsCount ?? 0,
        },
        chamados: chamadosResumo(ticketsOf(prospect?.id)),
        nps: npsBy.get(p.id)
          ? { nota: npsBy.get(p.id)!.score, data: npsBy.get(p.id)!.createdAt.toISOString(), comentario: npsBy.get(p.id)!.comment ?? undefined, classificacao: npsClass(npsBy.get(p.id)!.score) }
          : undefined,
        motivoPerda: prospect?.lostCategory || prospect?.lostReason ? { categoria: label(LOSS_CATEGORIES, prospect.lostCategory), texto: prospect.lostReason ?? undefined } : undefined,
        socios: p.socios.map((s) => ({ nome: s.name, ...(s.role ? { cargo: s.role } : {}), ...(s.birthday ? { aniversario: s.birthday } : {}) })),
        etapa: { id: stage, nome: SALES_STAGE_LABEL[stage] },
        vendedor: prospect?.owner?.name,
        origem: prospect?.source,
        proximoContato: prospect?.nextContactAt?.toISOString(),
        proximoContatoTipo: prospect?.nextContactKind ?? undefined,
        plano: sub
          ? {
              nome: sub.plan.name,
              valorMensal: money(sub.plan.priceMonth),
              status: SUB_STATUS[sub.status] ?? "ativa",
              mudouEm: sub.statusChangedAt.toISOString(),
              periodoAte: sub.currentPeriodEnd.toISOString(),
            }
          : undefined,
        pagamentos: {
          quantidade: pay?._count._all ?? 0,
          totalPago: money(Number(pay?._sum.amount ?? 0) - Number(pay?._sum.refundedAmount ?? 0)),
          ticketMedio: pay?._count._all ? money((Number(pay._sum.amount ?? 0) - Number(pay._sum.refundedAmount ?? 0)) / pay._count._all) : undefined,
          primeiro: day(pay?._min.paidAt),
          ultimo: day(pay?._max.paidAt),
        },
        anuncios: { noAr, total: p._count.listings },
        leads: {
          total: leads.reduce((sum, r) => sum + r._count._all, 0),
          ultimos30Dias: recent.get(p.id)?._count._all ?? 0,
          vendidos: leads.filter((r) => r.status === "won").reduce((sum, r) => sum + r._count._all, 0),
          paradosMais3Dias: stale.get(p.id)?._count._all ?? 0,
        },
        ultimasAnotacoes: (prospect?.notes ?? []).map((n) => ({ data: n.createdAt.toISOString(), tipo: n.kind, texto: n.body, autor: n.author?.name })),
        ultimoContato: prospect ? contatos.get(prospect.id) : undefined,
        cardId: prospect?.id,
      };
    });

    const open = await this.prisma.salesProspect.findMany({
      where: { partnerId: null, source: { in: ["manual", "prospeccao"] } },
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    const prospeccao = open.map(
      (r): CrmProspeccao => ({
        cardId: r.id,
        nome: r.name,
        segmento: r.segment,
        cidade: r.city ?? undefined,
        uf: r.state ?? undefined,
        contato: r.contactName ?? undefined,
        cargo: r.contactRole ?? undefined,
        telefone: r.phone ?? undefined,
        email: r.email ?? undefined,
        perfil: { funcionarios: label(EMPLOYEE_RANGES, r.employeesRange), faturamento: label(REVENUE_RANGES, r.revenueRange) },
        etapa: { id: r.stage as SalesStageId, nome: SALES_STAGE_LABEL[r.stage as SalesStageId] },
        vendedor: r.owner?.name,
        proximoContato: r.nextContactAt?.toISOString(),
        proximoContatoTipo: r.nextContactKind ?? undefined,
        motivoPerda: r.lostCategory || r.lostReason ? { categoria: label(LOSS_CATEGORIES, r.lostCategory), texto: r.lostReason ?? undefined } : undefined,
        ultimoContato: contatos.get(r.id),
        criadoEm: r.createdAt.toISOString(),
      }),
    );
    return { geradoEm: new Date().toISOString(), empresas, prospeccao };
  }

  // Receitas por categoria: planos e lojas parceiras (faturamento),
  // financiamentos (só acompanhamento) e o programa de afiliados.
  async receitas(): Promise<CrmRevenue> {
    const hoje = new Date();
    const since = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 11, 1));
    const last30 = new Date(hoje.getTime() - 30 * DAY_MS);
    const [subscriptionPayments, listingPlans, subscriptions, deals, leadsAbertos, storeEarnings, storeClicks30d, affiliates, clickDays, commissions] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({ where: { paidAt: { gte: since } }, select: { paidAt: true, amount: true, refundedAmount: true } }),
      this.prisma.listingBoostPurchase.findMany({ where: { status: "paid", paidAt: { gte: since } }, select: { paidAt: true, amount: true } }),
      this.prisma.subscription.findMany({ where: { status: { in: ["active", "past_due"] } }, select: { partnerId: true, plan: { select: { priceMonth: true } } } }),
      this.prisma.financingDeal.findMany({ select: { createdAt: true, financedAmount: true, commissionAmount: true, rebateAmount: true, status: true, commissionReceivedAt: true } }),
      this.prisma.financingLead.count({ where: { status: { notIn: ["converted", "lost"] } } }),
      this.prisma.storeEarning.findMany({ select: { month: true, store: true, amount: true } }),
      this.prisma.affiliateClick.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.affiliate.findMany({ select: { id: true, code: true, status: true, user: { select: { name: true } }, _count: { select: { referrals: true } } } }),
      this.prisma.affiliateClickDay.findMany({ where: { day: { gte: day(last30)! } }, select: { affiliateId: true, count: true } }),
      this.prisma.affiliateCommission.findMany({ select: { affiliateId: true, baseAmount: true, amount: true, status: true, createdAt: true } }),
    ]);
    const clicks = new Map<string, number>();
    for (const row of clickDays) clicks.set(row.affiliateId, (clicks.get(row.affiliateId) ?? 0) + row.count);
    const subscribers = new Set(subscriptions.map((sub) => sub.partnerId));
    return buildCrmRevenue(
      {
        subscriptionPayments,
        listingPlans,
        mrr: subscriptions.reduce((acc, sub) => acc + Number(sub.plan.priceMonth), 0),
        assinantes: subscribers.size,
        deals,
        leadsAbertos,
        storeEarnings,
        storeClicks30d,
        affiliates: affiliates.map((a) => ({ id: a.id, code: a.code, name: a.user.name, status: a.status, referrals: a._count.referrals, clicks30d: clicks.get(a.id) ?? 0 })),
        commissions,
      },
      hoje,
    );
  }
}
