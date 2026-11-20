import { Injectable, NotFoundException } from "@nestjs/common";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  PAINEL_DIAS_FUNIL,
  PAINEL_DIAS_LEADS,
  PAINEL_MIN_DESCRICAO,
  PAINEL_MIN_FOTOS,
  formatBRL,
  photoVariantUrl,
  type LeadStatus,
  type PartnerDashboard,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { visibleReviewWhere } from "../reviews/review-moderation.service";
import {
  LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA,
  SUBSCRIPTION_STATUSES_IN_EFFECT,
  highlightAllowanceFor,
  highlightUsageFor,
  listingLimitFor,
  planAudienceFor,
  requiresPlan,
  trialEndsAt,
} from "./partners.service";
import {
  analisarCarros,
  analisarImoveis,
  funilDosLeads,
  inicioDoDia,
  leadsPorDia,
  notaDaLoja,
  situacaoDoPlano,
  tempoDeResposta,
  ultimosDias,
  type AnuncioParaAnalise,
} from "./dashboard";

const HORA_MS = 60 * 60 * 1000;

// Tela inicial do painel do parceiro (GET /partners/mine/dashboard). Tudo é
// filtrado pelo partnerId da loja de quem pede (dono ou equipe) — nenhuma
// consulta aceita id vindo da tela. Consultas agregadas e em lote (sem uma
// consulta por anúncio/lead).
@Injectable()
export class PartnerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, agora = new Date()): Promise<PartnerDashboard> {
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");
    const partnerId = partner.id;
    const segmento = planAudienceFor(partner.type);
    const ehCarro = segmento === "vehicle";

    const inicioLeads = inicioDoDia(ultimosDias(agora, PAINEL_DIAS_LEADS)[0]!);
    const inicioFunil = inicioDoDia(ultimosDias(agora, PAINEL_DIAS_FUNIL)[0]!);
    const umDiaAtras = new Date(agora.getTime() - 24 * HORA_MS);

    const [subscription, emUso, leads15, funilPorStatus, paraResponder, respondidos, recentes, ativos, avaliacoes, limite] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { partnerId, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
        include: { plan: true },
        orderBy: { currentPeriodEnd: "desc" },
      }),
      this.prisma.listing.count({ where: { partnerId, status: { in: [...LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA] } } }),
      this.prisma.lead.findMany({
        where: { partnerId, createdAt: { gte: inicioLeads } },
        select: { createdAt: true, status: true, source: true, listingId: true, buyerId: true },
      }),
      this.prisma.lead.groupBy({ by: ["status"], where: { partnerId, createdAt: { gte: inicioFunil } }, _count: true }),
      this.prisma.lead.count({ where: { partnerId, createdAt: { gte: inicioFunil, lte: umDiaAtras } } }),
      this.prisma.lead.count({ where: { partnerId, createdAt: { gte: inicioFunil, lte: umDiaAtras }, status: { not: "new" } } }),
      this.prisma.lead.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          source: true,
          status: true,
          createdAt: true,
          contactName: true,
          buyer: { select: { name: true } },
          listing: { select: { title: true } },
        },
      }),
      this.prisma.listing.findMany({
        where: { partnerId, status: "active" },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          viewsCount: true,
          videoUrl: true,
          coverPhotoId: true,
          publishedAt: true,
          createdAt: true,
          vehicleDetails: { select: { fipePrice: true } },
          _count: { select: { photos: true } },
        },
      }),
      this.prisma.review.aggregate({ where: { reviewedPartnerId: partnerId, ...visibleReviewWhere }, _avg: { rating: true }, _count: true }),
      listingLimitFor(this.prisma, partner),
    ]);

    // ---------- Sinais de interesse (30 dias, só números) ----------
    const diasFunil = ultimosDias(agora, PAINEL_DIAS_FUNIL);
    const [assistente, arquiteto] = await Promise.all([
      this.prisma.listingDailyCount.aggregate({
        where: { kind: "assistente_abriu", day: { gte: new Date(`${diasFunil[0]}T00:00:00Z`) }, listing: { partnerId } },
        _sum: { count: true },
      }),
      // Arquiteto é só de imóvel: loja de veículos nem consulta.
      ehCarro
        ? Promise.resolve(undefined)
        : this.prisma.architectSession.groupBy({ by: ["userId"], where: { listing: { partnerId }, createdAt: { gte: inicioFunil } } }),
    ]);
    const sinais = { assistente: assistente._sum.count ?? 0, arquiteto: arquiteto ? arquiteto.length : undefined };

    // ---------- Plano ----------
    const precisaPlano = requiresPlan(partner.type);
    const situacao = situacaoDoPlano({ precisaPlano, trialAte: trialEndsAt(partner), assinatura: subscription ?? undefined, agora });
    const highlights = precisaPlano
      ? { ...(await highlightUsageFor(this.prisma, partnerId)), ...(await highlightAllowanceFor(this.prisma, partner)) }
      : undefined;
    // Próxima cobrança: só assinatura paga pelo Stripe (paymentProviderRef)
    // e em dia; valor = preço do plano, data = fim do período guardado.
    const preco = subscription ? Number(subscription.plan.priceMonth) : 0;
    const proximaCobranca =
      subscription && subscription.status === "active" && subscription.paymentProviderRef && subscription.currentPeriodEnd > agora
        ? { valor: { value: preco, label: formatBRL(preco) }, data: subscription.currentPeriodEnd.toISOString() }
        : undefined;

    // ---------- Leads 15 dias + tempo de resposta no chat ----------
    const chats = leads15.filter((l) => l.source === "chat" && l.listingId && l.buyerId);
    const pares = new Set(chats.map((l) => `${l.listingId}:${l.buyerId}`));
    const conversas = chats.length
      ? await this.prisma.conversation.findMany({
          where: {
            listing: { partnerId },
            listingId: { in: [...new Set(chats.map((l) => l.listingId!))] },
            buyerId: { in: [...new Set(chats.map((l) => l.buyerId!))] },
          },
          select: {
            listingId: true,
            buyerId: true,
            messages: { where: { createdAt: { gte: inicioLeads } }, select: { senderId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          },
        })
      : [];
    const tempoResposta = tempoDeResposta(
      conversas
        .filter((c) => pares.has(`${c.listingId}:${c.buyerId}`))
        .map((c) => ({ compradorId: c.buyerId, mensagens: c.messages.map((m) => ({ autorId: m.senderId, em: m.createdAt })) })),
    );

    // ---------- Funil ----------
    const porStatus: Partial<Record<LeadStatus, number>> = {};
    for (const row of funilPorStatus) porStatus[row.status] = row._count;
    const visualizacoes = ativos.reduce((s, a) => s + a.viewsCount, 0);

    // ---------- Top 5 anúncios ----------
    const top = [...ativos].sort((a, b) => b.viewsCount - a.viewsCount || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
    const topIds = top.map((a) => a.id);
    const [leadsPorAnuncio, fotos] = topIds.length
      ? await Promise.all([
          this.prisma.lead.groupBy({ by: ["listingId"], where: { partnerId, listingId: { in: topIds } }, _count: true }),
          this.prisma.photo.findMany({
            where: { listingId: { in: topIds } },
            select: { id: true, listingId: true, url: true, isCover: true, position: true, variantWidths: true },
            orderBy: { position: "asc" },
          }),
        ])
      : [[], []];
    const leadsDoAnuncio = new Map(leadsPorAnuncio.map((r) => [r.listingId, r._count]));
    const fotoDoAnuncio = (anuncio: (typeof top)[number]) => {
      const doAnuncio = fotos.filter((f) => f.listingId === anuncio.id);
      const capa = doAnuncio.find((f) => f.id === anuncio.coverPhotoId) ?? doAnuncio.find((f) => f.isCover) ?? doAnuncio[0];
      if (!capa) return undefined;
      const menor = [...capa.variantWidths].sort((a, b) => a - b).find((w) => w >= 160);
      return menor ? photoVariantUrl(capa.url, menor) : capa.url;
    };
    const topAnuncios = top
      .map((a) => ({
        id: a.id,
        titulo: a.title,
        preco: { value: Number(a.price), label: formatBRL(Number(a.price)) },
        visualizacoes: a.viewsCount,
        leads: leadsDoAnuncio.get(a.id) ?? 0,
        fotoUrl: fotoDoAnuncio(a),
      }))
      .sort((a, b) => b.visualizacoes - a.visualizacoes || b.leads - a.leads);

    // ---------- Análise e qualidade ----------
    const paraAnalise: AnuncioParaAnalise[] = ativos.map((a) => ({
      preco: Number(a.price),
      fipe: a.vehicleDetails?.fipePrice != null ? Number(a.vehicleDetails.fipePrice) : undefined,
      fotos: a._count.photos,
      descricao: a.description.trim().length,
      temVideo: Boolean(a.videoUrl),
      visualizacoes: a.viewsCount,
      noArDesde: a.publishedAt ?? a.createdAt,
    }));
    const analise = ehCarro ? analisarCarros(paraAnalise, agora) : analisarImoveis(paraAnalise, agora);
    const qualidade = notaDaLoja({
      verificada: Boolean(partner.verifiedAt),
      temLogo: Boolean(partner.logoUrl),
      anunciosAtivos: paraAnalise.length,
      comFotosSuficientes: paraAnalise.filter((a) => a.fotos >= PAINEL_MIN_FOTOS).length,
      comDescricaoCompleta: paraAnalise.filter((a) => a.descricao >= PAINEL_MIN_DESCRICAO).length,
      avaliacoes: avaliacoes._count,
      avaliacaoMedia: avaliacoes._avg.rating ?? undefined,
      leadsParaResponder: paraResponder,
      leadsRespondidos: respondidos,
    });

    return {
      segmento,
      plano: {
        situacao,
        planName: subscription?.plan.name,
        trialEndsAt: precisaPlano ? trialEndsAt(partner).toISOString() : undefined,
        proximaCobranca,
        anunciosEmUso: emUso,
        // Com plano, o limite do plano (o mesmo número do menu lateral), mesmo
        // no período grátis; sem plano, o que vale agora (grátis = sem limite).
        limiteAnuncios: subscription?.plan.maxActiveListings ?? limite?.max,
        destaques: highlights
          ? { usados: highlights.used, max: highlights.max, superUsados: highlights.superUsed, superMax: highlights.superMax }
          : undefined,
      },
      leads: {
        total: leads15.length,
        aguardando: leads15.filter((l) => l.status === "new").length,
        emContato: leads15.filter((l) => l.status === "contacted").length,
        porDia: leadsPorDia(leads15.map((l) => l.createdAt), agora, PAINEL_DIAS_LEADS),
        tempoResposta,
      },
      funil: { ...funilDosLeads(porStatus, ehCarro), visualizacoesAnunciosAtivos: visualizacoes, sinais },
      novosLeads: recentes.map((l) => ({
        id: l.id,
        nome: l.buyer?.name ?? l.contactName ?? "Contato anônimo",
        anuncio: l.listing?.title,
        origem: LEAD_SOURCE_LABELS[l.source],
        status: l.status,
        statusLabel: l.status === "visit_scheduled" ? (ehCarro ? "Visita / test-drive" : "Visita agendada") : LEAD_STATUS_LABELS[l.status],
        criadoEm: l.createdAt.toISOString(),
      })),
      topAnuncios,
      analise,
      qualidade,
      geradoEm: agora.toISOString(),
    };
  }
}
