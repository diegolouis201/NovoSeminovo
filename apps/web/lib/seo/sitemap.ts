// Montagem do sitemap.xml (app/sitemap.ts busca anúncios e lojas na API e
// chama buildSitemap). Auditoria de SEO 21/11/2026, item 11: toda URL com a
// data real da última alteração (<lastmod>). Testado em sitemap.test.ts.
//
// COMO MANTER AS DATAS (importante):
// - Página fixa: `updatedAt` abaixo é a data da última mudança de TEXTO da
//   página. Mudou o conteúdo de uma página? Troque a data dela aqui, no mesmo
//   commit. Não atualize "por atualizar": o Google para de confiar na data.
//   (Datas de partida, 21/11/2026: último commit que mudou cada página.)
// - Início, /carros, /imoveis e /busca mostram anúncios: vale a data mais nova
//   entre a da tabela e a do anúncio alterado por último.
// - Guias: a data do guia (`publishedAt`) ou GUIDES_UPDATED_AT (lib/guias.ts),
//   a mais nova; os índices de guia usam a mais nova dos seus guias.
// - Anúncio: `updatedAt` do anúncio. Loja: alteração mais recente entre os
//   anúncios ativos dela (GET /listings/sitemap).
import type { MetadataRoute } from "next";
import { GUIDE_TOPICS, GUIDES, GUIDES_UPDATED_AT, guideUrl, topicUrl } from "../guias";

type Frequency = "daily" | "weekly" | "monthly";

export const STATIC_PAGES: { path: string; priority: number; changeFrequency: Frequency; updatedAt: string; withListings?: boolean }[] = [
  { path: "/", priority: 1, changeFrequency: "daily", updatedAt: "2026-11-21", withListings: true },
  { path: "/carros", priority: 0.9, changeFrequency: "daily", updatedAt: "2026-11-21", withListings: true },
  { path: "/imoveis", priority: 0.9, changeFrequency: "daily", updatedAt: "2026-11-21", withListings: true },
  { path: "/busca", priority: 0.7, changeFrequency: "daily", updatedAt: "2026-11-21", withListings: true },
  { path: "/anunciar", priority: 0.6, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/assistente-compra", priority: 0.6, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/como-funciona", priority: 0.6, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/para-lojas", priority: 0.7, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/para-lojas/comecar", priority: 0.6, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/quem-somos", priority: 0.4, changeFrequency: "monthly", updatedAt: "2026-11-22" },
  { path: "/perguntas-frequentes", priority: 0.5, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/contato", priority: 0.4, changeFrequency: "monthly", updatedAt: "2026-11-21" },
  { path: "/privacidade", priority: 0.2, changeFrequency: "monthly", updatedAt: "2026-11-22" },
  { path: "/termos", priority: 0.2, changeFrequency: "monthly", updatedAt: "2026-11-22" },
];

export type SitemapInput = {
  siteUrl: string;
  listings: { id: string; updatedAt: string }[];
  storefronts: { slug: string; updatedAt?: string }[];
};

// Datas em ISO (só dia ou com hora): comparação pelo instante.
function latest(...dates: (string | undefined)[]): string {
  return dates.filter((date): date is string => Boolean(date)).reduce((a, b) => (new Date(b) > new Date(a) ? b : a));
}

function guideDate(guide: { publishedAt: string }): string {
  return latest(guide.publishedAt, GUIDES_UPDATED_AT);
}

export function buildSitemap({ siteUrl, listings, storefronts }: SitemapInput): MetadataRoute.Sitemap {
  const newestListing = listings.length ? latest(...listings.map((listing) => listing.updatedAt)) : undefined;
  const allGuides = GUIDES.map(guideDate);
  return [
    ...STATIC_PAGES.map((page) => ({
      url: `${siteUrl}${page.path === "/" ? "" : page.path}`,
      lastModified: page.withListings ? latest(page.updatedAt, newestListing) : page.updatedAt,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    { url: `${siteUrl}/guia`, lastModified: latest(...allGuides), changeFrequency: "monthly" as const, priority: 0.5 },
    ...GUIDE_TOPICS.map((topic) => ({
      url: `${siteUrl}${topicUrl(topic.slug)}`,
      lastModified: latest(...GUIDES.filter((guide) => guide.topic === topic.slug).map(guideDate)),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...GUIDES.map((guide) => ({
      url: `${siteUrl}${guideUrl(guide)}`,
      lastModified: guideDate(guide),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...storefronts.map((storefront) => ({
      url: `${siteUrl}/lojas/${encodeURIComponent(storefront.slug)}`,
      lastModified: storefront.updatedAt ?? newestListing ?? STATIC_PAGES[0]!.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...listings.map((listing) => ({
      url: `${siteUrl}/anuncio/${encodeURIComponent(listing.id)}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
