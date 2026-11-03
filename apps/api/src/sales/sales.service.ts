import { randomInt } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import {
  AddSocioInputSchema,
  CancelReasonInputSchema,
  CreateProspectInputSchema,
  INTERACTION_KINDS,
  InteractionKindSchema,
  LOSS_CATEGORIES,
  NEXT_CONTACT_KINDS,
  ProspectProfileInputSchema,
  TicketInputSchema,
  type InteractionKind,
  type LossCategory,
  type NextContactKind,
  type ProspectProfileInput,
  isValidBirthday,
  SALES_CODE_PATTERN,
  SALES_STAGE_LABEL,
  PARTNER_TRIAL_DAYS,
  type CreateProspectInput,
  type SalesCard,
  type SalesDetail,
  type SalesGoals,
  type SalesManualStage,
  type SalesMember,
  type SalesSegment,
  type SalesStageId,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Funil comercial das empresas (área /comercial). Antes do cadastro o
// vendedor move o card à mão (a abordar → em contato → interessada /
// perdida). Quando a empresa se cadastra no site, o card é ligado a ela
// (mesmo CNPJ, link do vendedor, ou novo) e a etapa passa a vir do site.

const DAY_MS = 86_400_000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IN_EFFECT = new Set(["active", "past_due"]);

export type PartnerSnapshot = { activeListings: number; subscription?: "active" | "past_due" | "canceled" };

// Etapa mostrada no kanban.
export function cardStage(prospect: { stage: string }, partner: PartnerSnapshot | undefined, _now = new Date()): SalesStageId {
  if (!partner) return prospect.stage as SalesManualStage;
  if (partner.subscription && IN_EFFECT.has(partner.subscription)) return "assinante";
  if (partner.subscription === "canceled") return "cancelou";
  return partner.activeListings > 0 ? "publicou" : "cadastrou";
}

export function segmentOf(partnerType: string): SalesSegment | undefined {
  if (partnerType === "dealership") return "vehicle";
  if (partnerType === "real_estate_agency" || partnerType === "broker" || partnerType === "builder") return "property";
  return undefined; // oficina não assina plano
}

const digits = (value?: string | null) => (value ?? "").replace(/\D/g, "") || undefined;

const prospectInclude = {
  owner: { select: { id: true, name: true } },
  partner: {
    select: {
      id: true,
      slug: true,
      createdAt: true,
      owner: { select: { name: true, email: true, phone: true } },
      subscriptions: { orderBy: { statusChangedAt: "desc" }, take: 1, select: { status: true, plan: { select: { name: true, priceMonth: true } } } },
      _count: { select: { listings: { where: { status: "active" } } } },
    },
  },
} satisfies Prisma.SalesProspectInclude;
type ProspectRow = Prisma.SalesProspectGetPayload<{ include: typeof prospectInclude }>;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Equipe ----------------

  async createMember(input: { name: string; email: string }): Promise<SalesMember> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Já existe uma conta com este e-mail.");
    for (let attempt = 0; attempt < 5; attempt++) {
      const salesCode = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
      const clash = await this.prisma.user.findUnique({ where: { salesCode } });
      if (clash) continue;
      const user = await this.prisma.user.create({ data: { name: input.name, email: input.email, role: "sales", salesCode } });
      return { id: user.id, name: user.name, email: user.email, salesCode, status: user.status };
    }
    throw new ConflictException("Não foi possível gerar o código do vendedor. Tente de novo.");
  }

  async members(): Promise<SalesMember[]> {
    const rows = await this.prisma.user.findMany({ where: { role: "sales" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, salesCode: true, status: true } });
    return rows.map((r) => ({ ...r, salesCode: r.salesCode ?? "" }));
  }

  async me(userId: string): Promise<{ name: string; salesCode?: string; role: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, salesCode: true, role: true } });
    return { name: user.name, salesCode: user.salesCode ?? undefined, role: user.role };
  }

  // ---------------- Cards ----------------

  async createProspect(userId: string, raw: CreateProspectInput): Promise<{ id: string }> {
    const input = CreateProspectInputSchema.parse(raw);
    if (input.cnpj) {
      const clash = await this.prisma.salesProspect.findUnique({ where: { cnpj: input.cnpj } });
      if (clash) throw new ConflictException("Esta empresa já está no quadro.");
      const partner = await this.prisma.partner.findFirst({ where: { document: input.cnpj }, select: { id: true } });
      if (partner) throw new ConflictException("Esta empresa já tem cadastro no site; ela aparece sozinha no quadro.");
    }
    const created = await this.prisma.salesProspect.create({ data: { ...input, ownerId: userId, source: "manual" } });
    return { id: created.id };
  }

  // Liga empresas cadastradas no site ao quadro (sem duplicar).
  async syncPartners(): Promise<void> {
    const partners = await this.prisma.partner.findMany({
      where: { salesProspect: null, type: { not: "workshop" } },
      select: { id: true },
      take: 500,
    });
    for (const partner of partners) await this.linkSignup(partner.id);
  }

  // Chamado no cadastro da empresa (e na sincronização). salesCode = link do vendedor.
  async linkSignup(partnerId: string, salesCode?: string): Promise<void> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, include: { owner: { select: { name: true, email: true } } } });
    if (!partner) return;
    const segment = segmentOf(partner.type);
    if (!segment) return;
    const code = salesCode?.trim().toUpperCase();
    const seller =
      code && SALES_CODE_PATTERN.test(code)
        ? await this.prisma.user.findFirst({ where: { salesCode: code, role: "sales", status: "active" }, select: { id: true } })
        : null;

    const adoptLinked = async (linked: { id: string; ownerId: string | null }) => {
      if (seller && !linked.ownerId) await this.prisma.salesProspect.update({ where: { id: linked.id }, data: { ownerId: seller.id, source: "link" } });
    };
    const linked = await this.prisma.salesProspect.findUnique({ where: { partnerId } });
    if (linked) return adoptLinked(linked);
    const cnpj = digits(partner.document);
    const manual = cnpj ? await this.prisma.salesProspect.findFirst({ where: { cnpj, partnerId: null } }) : null;
    if (manual) {
      await this.prisma.salesProspect.update({
        where: { id: manual.id },
        data: { partnerId, ownerId: manual.ownerId ?? seller?.id, city: manual.city ?? partner.city, state: manual.state ?? partner.state },
      });
      await this.prisma.salesNote.create({ data: { prospectId: manual.id, kind: "stage", fromStage: manual.stage, toStage: "cadastrou", body: "A empresa se cadastrou no site." } });
      return;
    }
    // Cadastro e sincronização podem criar o card ao mesmo tempo: quem perder
    // a corrida usa o card que já existe (partnerId é único).
    await this.prisma.salesProspect.create({
      data: {
        name: partner.legalName,
        segment,
        cnpj: cnpj && !(await this.prisma.salesProspect.findUnique({ where: { cnpj } })) ? cnpj : undefined,
        city: partner.city,
        state: partner.state,
        contactName: partner.owner.name,
        email: partner.owner.email,
        partnerId,
        ownerId: seller?.id,
        source: seller ? "link" : "site",
      },
    }).catch(async (error: unknown) => {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const existing = await this.prisma.salesProspect.findUnique({ where: { partnerId } });
      if (!existing) throw error;
      await adoptLinked(existing);
    });
  }

  // Cadastro de empresa pelo site: acha a empresa recém-criada do dono e liga ao quadro.
  async linkOwnerSignup(ownerUserId: string, salesCode?: string): Promise<void> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (partner) await this.linkSignup(partner.id, salesCode);
  }

  async board(_viewerId: string, filter: { segment?: SalesSegment; mine?: boolean; viewerId?: string } = {}): Promise<{ cards: SalesCard[] }> {
    await this.syncPartners();
    const rows = await this.prisma.salesProspect.findMany({
      where: {
        ...(filter.segment ? { segment: filter.segment } : {}),
        ...(filter.mine ? { ownerId: _viewerId } : {}),
        // Card que veio do site e perdeu a empresa (conta apagada) não volta para "a abordar".
        NOT: { partnerId: null, source: { in: ["site", "link"] } },
      },
      include: prospectInclude,
      orderBy: { updatedAt: "desc" },
      take: 2000,
    });
    const now = new Date();
    return { cards: rows.map((row) => this.toCard(row, now)) };
  }

  private toCard(row: ProspectRow, now: Date): SalesCard {
    const sub = row.partner?.subscriptions[0];
    const snapshot: PartnerSnapshot | undefined = row.partner
      ? { activeListings: row.partner._count.listings, subscription: sub?.status as PartnerSnapshot["subscription"] }
      : undefined;
    const stage = cardStage(row, snapshot, now);
    const trialEnd = row.partner ? row.partner.createdAt.getTime() + PARTNER_TRIAL_DAYS * DAY_MS : undefined;
    return {
      id: row.id,
      name: row.name,
      segment: row.segment as SalesSegment,
      stage,
      source: row.source as SalesCard["source"],
      ownerId: row.ownerId ?? undefined,
      ownerName: row.owner?.name,
      partnerId: row.partnerId ?? undefined,
      partnerSlug: row.partner?.slug,
      cnpj: row.cnpj ?? undefined,
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      contactName: row.contactName ?? row.partner?.owner.name ?? undefined,
      phone: row.phone ?? row.partner?.owner.phone ?? undefined,
      email: row.email ?? row.partner?.owner.email ?? undefined,
      nextContactAt: row.nextContactAt?.toISOString(),
      nextContactKind: (row.nextContactKind as NextContactKind | null) ?? undefined,
      lostReason: row.lostReason ?? undefined,
      lostCategory: (row.lostCategory as LossCategory | null) ?? undefined,
      contactRole: row.contactRole ?? undefined,
      employeesRange: row.employeesRange ?? undefined,
      revenueRange: row.revenueRange ?? undefined,
      planName: sub?.plan.name,
      monthlyValue: sub ? Number(sub.plan.priceMonth) : undefined,
      subscriptionStatus: sub?.status as SalesCard["subscriptionStatus"],
      trialDaysLeft:
        trialEnd && stage !== "assinante" && trialEnd > now.getTime() ? Math.ceil((trialEnd - now.getTime()) / DAY_MS) : undefined,
      activeListings: row.partner?._count.listings,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async load(id: string) {
    const row = await this.prisma.salesProspect.findUnique({ where: { id }, include: prospectInclude });
    if (!row) throw new NotFoundException("Card não encontrado.");
    return row;
  }

  async detail(id: string): Promise<SalesDetail> {
    const row = await this.load(id);
    const notes = await this.prisma.salesNote.findMany({
      where: { prospectId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { author: { select: { name: true } } },
    });
    const [socios, partner] = row.partnerId
      ? await Promise.all([
          this.prisma.partnerSocio.findMany({ where: { partnerId: row.partnerId }, orderBy: { createdAt: "asc" } }),
          this.prisma.partner.findUnique({ where: { id: row.partnerId }, select: { foundedAt: true, mainActivity: true, companySize: true, shareCapital: true } }),
        ])
      : [[], null];
    const [tickets, lastNps] = await Promise.all([
      this.prisma.crmTicket.findMany({ where: { prospectId: id }, orderBy: { openedAt: "desc" }, take: 50 }),
      row.partnerId ? this.prisma.npsResponse.findFirst({ where: { partnerId: row.partnerId }, orderBy: { createdAt: "desc" } }) : null,
    ]);
    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        channel: t.channel,
        description: t.description ?? undefined,
        status: t.status as "aberto" | "resolvido",
        resolution: t.resolution ?? undefined,
        openedAt: t.openedAt.toISOString(),
        resolvedAt: t.resolvedAt?.toISOString(),
      })),
      nps: lastNps ? { score: lastNps.score, comment: lastNps.comment ?? undefined, createdAt: lastNps.createdAt.toISOString() } : undefined,
      foundedAt: partner?.foundedAt?.toISOString(),
      company: partner ? { activity: partner.mainActivity ?? undefined, size: partner.companySize ?? undefined, shareCapital: partner.shareCapital ? Number(partner.shareCapital) : undefined } : undefined,
      socios: socios.map((s) => ({ id: s.id, name: s.name, role: s.role ?? undefined, birthday: s.birthday ?? undefined, source: s.source as "receita" | "manual" })),
      card: this.toCard(row, new Date()),
      notes: notes.map((n) => ({ id: n.id, kind: n.kind as InteractionKind | "stage" | "contact", body: n.body, authorName: n.author?.name, createdAt: n.createdAt.toISOString() })),
    };
  }

  async move(userId: string, id: string, input: { stage: SalesManualStage; lostReason?: string; lostCategory?: LossCategory }): Promise<void> {
    const row = await this.load(id);
    if (row.partnerId) throw new BadRequestException("Esta empresa já se cadastrou: a etapa agora anda sozinha pelo site.");
    if (!["a_abordar", "em_contato", "interessada", "proposta", "perdida"].includes(input.stage)) {
      throw new BadRequestException("Esta etapa anda sozinha pelo site quando a empresa se cadastra.");
    }
    const category = input.lostCategory && input.lostCategory in LOSS_CATEGORIES ? input.lostCategory : undefined;
    const reason = [category ? LOSS_CATEGORIES[category] : undefined, input.lostReason?.trim()].filter(Boolean).join(" — ");
    if (input.stage === "perdida" && !category) throw new BadRequestException("Escolha o motivo da perda.");
    if (row.stage === input.stage) return;
    await this.prisma.$transaction([
      this.prisma.salesProspect.update({
        where: { id },
        data: { stage: input.stage, lostReason: input.stage === "perdida" ? input.lostReason?.trim() || null : null, lostCategory: input.stage === "perdida" ? category : null },
      }),
      this.prisma.salesNote.create({
        data: {
          prospectId: id,
          authorId: userId,
          kind: "stage",
          fromStage: row.stage,
          toStage: input.stage,
          body: `De "${SALES_STAGE_LABEL[row.stage as SalesStageId]}" para "${SALES_STAGE_LABEL[input.stage]}"${reason && input.stage === "perdida" ? `. Motivo: ${reason}` : ""}`,
        },
      }),
    ]);
  }

  async addNote(userId: string, id: string, body: string, kind: InteractionKind = "note"): Promise<void> {
    if (!InteractionKindSchema.safeParse(kind).success) throw new BadRequestException("Tipo de registro inválido.");
    await this.load(id);
    await this.prisma.$transaction([
      this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind, body: body.trim().slice(0, 2000) } }),
      this.prisma.salesProspect.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
  }

  async setNextContact(userId: string, id: string, at: Date | null, kind?: NextContactKind): Promise<void> {
    await this.load(id);
    const label = at ? at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "sem data";
    const type = kind && kind in NEXT_CONTACT_KINDS ? kind : undefined;
    await this.prisma.$transaction([
      this.prisma.salesProspect.update({ where: { id }, data: { nextContactAt: at, nextContactKind: at ? (type ?? null) : null } }),
      this.prisma.salesNote.create({
        data: { prospectId: id, authorId: userId, kind: "contact", body: `${type === "reuniao" ? "Reunião agendada" : "Próximo contato"}${type && type !== "reuniao" ? ` (${NEXT_CONTACT_KINDS[type]})` : ""}: ${label}` },
      }),
    ]);
  }

  async updateProfile(userId: string, id: string, raw: ProspectProfileInput): Promise<void> {
    const parsed = ProspectProfileInputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await this.load(id);
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === "" ? null : v]));
    if (!Object.keys(data).length) return;
    await this.prisma.$transaction([
      this.prisma.salesProspect.update({ where: { id }, data }),
      this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind: "note", body: "Dados da empresa e do contato atualizados." } }),
    ]);
  }

  async setCancelReason(userId: string, id: string, raw: { category: LossCategory; reason?: string }): Promise<void> {
    const input = CancelReasonInputSchema.parse(raw);
    const row = await this.load(id);
    if (this.toCard(row, new Date()).stage !== "cancelou") throw new BadRequestException("Só dá para registrar motivo de cancelamento em empresa que cancelou.");
    await this.prisma.$transaction([
      this.prisma.salesProspect.update({ where: { id }, data: { lostCategory: input.category, lostReason: input.reason || null } }),
      this.prisma.salesNote.create({
        data: { prospectId: id, authorId: userId, kind: "note", body: `Motivo do cancelamento: ${LOSS_CATEGORIES[input.category]}${input.reason ? ` — ${input.reason}` : ""}` },
      }),
    ]);
  }

  async assign(userId: string, id: string): Promise<void> {
    await this.load(id);
    await this.prisma.$transaction([
      this.prisma.salesProspect.update({ where: { id }, data: { ownerId: userId } }),
      this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind: "note", body: "Assumiu o card." } }),
    ]);
  }

  // ---------------- Chamados de suporte (pós-venda) ----------------

  async openTicket(userId: string, prospectId: string, raw: { subject: string; channel: string; description?: string }): Promise<{ id: string }> {
    const parsed = TicketInputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await this.load(prospectId);
    const ticket = await this.prisma.crmTicket.create({ data: { ...parsed.data, prospectId, openedById: userId } });
    await this.prisma.salesNote.create({ data: { prospectId, authorId: userId, kind: "note", body: `Chamado aberto: ${parsed.data.subject}` } });
    return { id: ticket.id };
  }

  async resolveTicket(userId: string, ticketId: string, resolution: string): Promise<void> {
    const ticket = await this.prisma.crmTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException("Chamado não encontrado.");
    if (ticket.status === "resolvido") throw new BadRequestException("Este chamado já foi resolvido.");
    await this.prisma.$transaction([
      this.prisma.crmTicket.update({ where: { id: ticketId }, data: { status: "resolvido", resolution: resolution.trim().slice(0, 2000), resolvedById: userId, resolvedAt: new Date() } }),
      this.prisma.salesNote.create({ data: { prospectId: ticket.prospectId, authorId: userId, kind: "note", body: `Chamado resolvido: ${ticket.subject}. ${resolution.trim()}`.slice(0, 2000) } }),
    ]);
  }

  // ---------------- Sócios (aniversário à mão) ----------------

  async setSocioBirthday(userId: string, socioId: string, birthday: string): Promise<void> {
    if (!isValidBirthday(birthday)) throw new BadRequestException("Use o formato DD/MM com uma data que existe.");
    const socio = await this.prisma.partnerSocio.findUnique({ where: { id: socioId }, include: { partner: { select: { salesProspect: { select: { id: true } } } } } });
    if (!socio) throw new NotFoundException("Sócio não encontrado.");
    await this.prisma.partnerSocio.update({ where: { id: socioId }, data: { birthday: birthday.trim() } });
    const prospectId = socio.partner.salesProspect?.id;
    if (prospectId) await this.prisma.salesNote.create({ data: { prospectId, authorId: userId, kind: "note", body: `Aniversário de ${socio.name}: ${birthday.trim()}` } });
  }

  async addSocio(userId: string, prospectId: string, raw: { name: string; role?: string; birthday?: string }): Promise<void> {
    const input = AddSocioInputSchema.parse(raw);
    const row = await this.load(prospectId);
    if (!row.partnerId) throw new BadRequestException("Sócios ficam disponíveis depois que a empresa se cadastra no site.");
    await this.prisma.partnerSocio.upsert({
      where: { partnerId_name: { partnerId: row.partnerId, name: input.name } },
      create: { partnerId: row.partnerId, name: input.name, role: input.role, birthday: input.birthday, source: "manual" },
      update: { role: input.role, birthday: input.birthday },
    });
    await this.prisma.salesNote.create({ data: { prospectId, authorId: userId, kind: "note", body: `Sócio/contato adicionado: ${input.name}` } });
  }

  // ---------------- Metas do mês ----------------

  async goals(userId: string, reference: Date): Promise<SalesGoals> {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
    const inMonth = { gte: start, lt: end };
    const [approaches, signups, owned] = await Promise.all([
      this.prisma.salesNote.count({ where: { authorId: userId, kind: "stage", fromStage: "a_abordar", createdAt: inMonth } }),
      this.prisma.salesProspect.count({ where: { ownerId: userId, partner: { createdAt: inMonth } } }),
      this.prisma.salesProspect.findMany({
        where: { ownerId: userId, partnerId: { not: null } },
        select: { partnerId: true, partner: { select: { subscriptions: { where: { status: { in: ["active", "past_due"] } }, select: { plan: { select: { priceMonth: true } } } } } } },
      }),
    ]);
    const partnerIds = owned.map((o) => o.partnerId!).filter(Boolean);
    const firstPayments = partnerIds.length
      ? await this.prisma.subscriptionPayment.groupBy({ by: ["partnerId"], where: { partnerId: { in: partnerIds } }, _min: { paidAt: true } })
      : [];
    const newSubscribers = firstPayments.filter((p) => p._min.paidAt && p._min.paidAt >= start && p._min.paidAt < end).length;
    const active = owned.filter((o) => (o.partner?.subscriptions.length ?? 0) > 0);
    const mrr = active.reduce((sum, o) => sum + Number(o.partner!.subscriptions[0]!.plan.priceMonth), 0);
    return {
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      approaches,
      signups,
      newSubscribers,
      activeSubscribers: active.length,
      mrr: Math.round(mrr * 100) / 100,
    };
  }
}
