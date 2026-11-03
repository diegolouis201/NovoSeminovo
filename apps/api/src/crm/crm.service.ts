import { Injectable } from "@nestjs/common";
import { PARTNER_TRIAL_DAYS, PARTNER_TYPE_LABELS, SALES_STAGE_LABEL, type SalesStageId } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService, cardStage, segmentOf } from "../sales/sales.service";

// Feed do CRM geral (repositório "CRM NovoSeminovo" no Claude): a jornada de
// cada empresa num lugar só. Sem CPF, senha, cartão ou dado de comprador.

const DAY_MS = 86_400_000;
const SUB_STATUS: Record<string, "ativa" | "em_atraso" | "cancelada"> = { active: "ativa", past_due: "em_atraso", canceled: "cancelada" };
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const day = (date?: Date | null) => date?.toISOString().slice(0, 10);

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
  responsavel: { nome: string; email: string; telefone?: string };
  socios: { nome: string; cargo?: string; aniversario?: string }[];
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  origem?: string;
  proximoContato?: string;
  plano?: { nome: string; valorMensal: number; status: "ativa" | "em_atraso" | "cancelada"; mudouEm: string; periodoAte: string };
  pagamentos: { quantidade: number; totalPago: number; primeiro?: string; ultimo?: string };
  anuncios: { noAr: number; total: number };
  leads: { total: number; ultimos30Dias: number; vendidos: number; paradosMais3Dias: number };
  ultimasAnotacoes: { data: string; tipo: string; texto: string; autor?: string }[];
  cardId?: string;
};
export type CrmProspeccao = {
  cardId: string;
  nome: string;
  segmento: string;
  cidade?: string;
  uf?: string;
  contato?: string;
  telefone?: string;
  email?: string;
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  proximoContato?: string;
  motivoPerda?: string;
  criadoEm: string;
};
export type CrmFeed = { geradoEm: string; empresas: CrmEmpresa[]; prospeccao: CrmProspeccao[] };

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async clientes(): Promise<CrmFeed> {
    await this.sales.syncPartners();
    const now = Date.now();
    const [partners, leadRows, staleRows, recentRows, payments] = await Promise.all([
      this.prisma.partner.findMany({
        take: 5000,
        orderBy: { createdAt: "asc" },
        include: {
          owner: { select: { name: true, email: true, phone: true } },
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
    const activeListings = await this.prisma.listing.groupBy({ by: ["partnerId"], where: { status: "active", partnerId: { not: null } }, _count: { _all: true } });
    const byPartner = <T extends { partnerId: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.partnerId as string, r]));
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
        responsavel: { nome: p.owner.name, email: p.owner.email, telefone: p.owner.phone ?? undefined },
        socios: p.socios.map((s) => ({ nome: s.name, ...(s.role ? { cargo: s.role } : {}), ...(s.birthday ? { aniversario: s.birthday } : {}) })),
        etapa: { id: stage, nome: SALES_STAGE_LABEL[stage] },
        vendedor: prospect?.owner?.name,
        origem: prospect?.source,
        proximoContato: prospect?.nextContactAt?.toISOString(),
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
        cardId: prospect?.id,
      };
    });

    const open = await this.prisma.salesProspect.findMany({
      where: { partnerId: null, source: "manual" },
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
        telefone: r.phone ?? undefined,
        email: r.email ?? undefined,
        etapa: { id: r.stage as SalesStageId, nome: SALES_STAGE_LABEL[r.stage as SalesStageId] },
        vendedor: r.owner?.name,
        proximoContato: r.nextContactAt?.toISOString(),
        motivoPerda: r.lostReason ?? undefined,
        criadoEm: r.createdAt.toISOString(),
      }),
    );
    return { geradoEm: new Date().toISOString(), empresas, prospeccao };
  }
}
