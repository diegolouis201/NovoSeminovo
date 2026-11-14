import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ACQUISITION_SOURCES,
  type HubAccess,
  type HubBuyerLead,
  type HubBuyerLeads,
  type HubBuyerLeadsQuery,
  type HubBuyerLeadType,
  campaignKey,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Leads de compradores no Hub: contatos de anúncio que chegaram pelo site
// (chat, WhatsApp, formulário — os leads cadastrados à mão pela loja ficam de
// fora), pedidos de financiamento e inscrições de novidades por e-mail.
// Marketing vê a origem e os números; o contato (nome completo, telefone,
// e-mail) só para quem tem acesso ao CRM.

const DAY_MS = 86_400_000;
const LIMIT = 2000;
const SITE_LEAD_SOURCES = ["chat", "whatsapp", "form"] as const;
// Contato criado por um formulário de Lead Ads da Meta (meta/meta-leads.service.ts).
const META_LEAD_SOURCE = "meta_lead_ads";
const brasiliaDay = (date: Date) => new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const startOf = (day: string) => new Date(`${day}T00:00:00-03:00`);
const label = (canal?: string | null) => (canal ? (ACQUISITION_SOURCES[canal as keyof typeof ACQUISITION_SOURCES] ?? canal) : undefined);

function origem(canal?: string | null, campanha?: string | null, anuncio?: string | null): HubBuyerLead["origem"] {
  const o: HubBuyerLead["origem"] = {};
  if (canal) Object.assign(o, { canal, canalRotulo: label(canal) });
  if (campanha) o.campanha = campanha;
  if (anuncio) o.anuncio = anuncio;
  return o;
}

@Injectable()
export class BuyerLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: HubAccess, query: HubBuyerLeadsQuery, now = new Date()): Promise<HubBuyerLeads> {
    const canSee = access.permissions.includes("marketing") || access.permissions.includes("crm.ver");
    if (!canSee) throw new ForbiddenException("Seu perfil não tem permissão para isto.");
    const contatosVisiveis = access.permissions.includes("crm.ver");
    const ate = query.ate ?? brasiliaDay(now);
    const de = query.de ?? brasiliaDay(new Date(startOf(ate).getTime() - 29 * DAY_MS));
    const createdAt = { gte: startOf(de), lt: new Date(startOf(ate).getTime() + DAY_MS) };

    const [leads, financing, contacts] = await Promise.all([
      query.tipo && query.tipo !== "contato_anuncio"
        ? []
        : this.prisma.lead.findMany({
            where: { createdAt, source: { in: [...SITE_LEAD_SOURCES] } },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              createdAt: true,
              contactName: true,
              contactPhone: true,
              contactEmail: true,
              acqSource: true,
              acqCampaign: true,
              acqContent: true,
              listing: { select: { id: true, title: true } },
              buyer: { select: { name: true, phone: true, email: true } },
            },
          }),
      query.tipo && query.tipo !== "financiamento"
        ? []
        : this.prisma.financingLead.findMany({
            where: { createdAt },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: { id: true, createdAt: true, name: true, phone: true, email: true, channel: true, acqSource: true, acqCampaign: true, acqContent: true, listing: { select: { id: true, title: true } } },
          }),
      query.tipo && query.tipo !== "novidades" && query.tipo !== "formulario_meta"
        ? []
        : this.prisma.marketingContact.findMany({
            where: {
              createdAt,
              ...(query.tipo === "formulario_meta"
                ? { source: META_LEAD_SOURCE }
                : query.tipo === "novidades"
                  ? { sourceDetail: { startsWith: "formulario" }, source: { not: META_LEAD_SOURCE } }
                  : { sourceDetail: { startsWith: "formulario" } }),
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: { id: true, createdAt: true, name: true, email: true, phone: true, source: true, sourceDetail: true, acqSource: true, acqCampaign: true, acqContent: true },
          }),
    ]);

    const all: (HubBuyerLead & { at: number })[] = [
      ...leads.map((l) => ({
        id: `lead:${l.id}`,
        tipo: "contato_anuncio" as const,
        at: l.createdAt.getTime(),
        criadoEm: l.createdAt.toISOString(),
        nome: l.contactName ?? l.buyer?.name ?? undefined,
        telefone: l.contactPhone ?? l.buyer?.phone ?? undefined,
        email: l.contactEmail ?? l.buyer?.email ?? undefined,
        anuncio: l.listing ? { id: l.listing.id, titulo: l.listing.title } : undefined,
        origem: origem(l.acqSource, l.acqCampaign, l.acqContent),
      })),
      ...financing.map((f) => ({
        id: `fin:${f.id}`,
        tipo: "financiamento" as const,
        at: f.createdAt.getTime(),
        criadoEm: f.createdAt.toISOString(),
        nome: f.name,
        telefone: f.phone,
        email: f.email ?? undefined,
        anuncio: f.listing ? { id: f.listing.id, titulo: f.listing.title } : undefined,
        origem: origem(f.acqSource ?? (f.channel === "whatsapp" ? "whatsapp" : null), f.acqCampaign, f.acqContent),
      })),
      ...contacts.map((c) =>
        c.source === META_LEAD_SOURCE
          ? {
              // Formulário de Lead Ads (Instagram/Facebook): origem do anúncio nas colunas acq*.
              id: `meta:${c.id}`,
              tipo: "formulario_meta" as const,
              at: c.createdAt.getTime(),
              criadoEm: c.createdAt.toISOString(),
              nome: c.name ?? undefined,
              telefone: c.phone ?? undefined,
              email: c.email ?? undefined,
              origem: origem(c.acqSource ?? "meta_ads", c.acqCampaign ?? (c.sourceDetail?.split(":")[1] || null), c.acqContent),
            }
          : {
              id: `news:${c.id}`,
              tipo: "novidades" as const,
              at: c.createdAt.getTime(),
              criadoEm: c.createdAt.toISOString(),
              nome: c.name ?? undefined,
              email: c.email ?? undefined,
              // sourceDetail = "formulario" ou "formulario:<campanha>"
              origem: origem(c.source, c.sourceDetail?.split(":")[1] || null),
            },
      ),
    ];

    const wanted = campaignKey(query.campanha);
    const filtered = all
      .filter((i) => !query.canal || i.origem.canal === query.canal)
      .filter((i) => !wanted || campaignKey(i.origem.campanha) === wanted)
      .sort((a, b) => b.at - a.at);

    const porTipo: Record<HubBuyerLeadType, number> = { contato_anuncio: 0, financiamento: 0, novidades: 0, formulario_meta: 0 };
    const canais = new Map<string, number>();
    const campanhas = new Map<string, number>();
    for (const i of filtered) {
      porTipo[i.tipo]++;
      const canal = i.origem.canal ?? "sem_origem";
      canais.set(canal, (canais.get(canal) ?? 0) + 1);
      if (i.origem.campanha) campanhas.set(i.origem.campanha, (campanhas.get(i.origem.campanha) ?? 0) + 1);
    }

    const itens = filtered.slice(0, 500).map(({ at: _at, ...i }) =>
      contatosVisiveis ? i : { ...i, nome: i.nome?.trim().split(/\s+/)[0], telefone: undefined, email: undefined },
    );
    return {
      de,
      ate,
      contatosVisiveis,
      itens,
      totais: {
        total: filtered.length,
        porTipo,
        porCanal: [...canais.entries()].map(([canal, total]) => ({ canal, rotulo: canal === "sem_origem" ? "Sem origem registrada" : (label(canal) ?? canal), total })).sort((a, b) => b.total - a.total),
        porCampanha: [...campanhas.entries()].map(([campanha, total]) => ({ campanha, total })).sort((a, b) => b.total - a.total),
      },
    };
  }
}
