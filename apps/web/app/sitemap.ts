import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Gerado a cada pedido (o Google passa poucas vezes por dia): sempre com os
// anúncios ativos de agora. Se a API estiver fora, sai só com as páginas fixas.
export const dynamic = "force-dynamic";

const STATIC_PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/carros", priority: 0.9, changeFrequency: "daily" },
  { path: "/imoveis", priority: 0.9, changeFrequency: "daily" },
  { path: "/busca", priority: 0.7, changeFrequency: "daily" },
  { path: "/anunciar", priority: 0.6, changeFrequency: "monthly" },
  { path: "/assistente-compra", priority: 0.6, changeFrequency: "monthly" },
  { path: "/consultar-veiculo", priority: 0.5, changeFrequency: "monthly" },
  { path: "/recompensas", priority: 0.5, changeFrequency: "monthly" },
  { path: "/como-funciona", priority: 0.6, changeFrequency: "monthly" },
  { path: "/para-lojas", priority: 0.7, changeFrequency: "monthly" },
  { path: "/quem-somos", priority: 0.4, changeFrequency: "monthly" },
  { path: "/perguntas-frequentes", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contato", priority: 0.4, changeFrequency: "monthly" },
  { path: "/privacidade", priority: 0.2, changeFrequency: "monthly" },
  { path: "/termos", priority: 0.2, changeFrequency: "monthly" },
];

type SitemapEntries = { listings: { id: string; updatedAt: string }[]; storefronts: { slug: string }[] };

async function loadEntries(): Promise<SitemapEntries> {
  try {
    const res = await fetch(`${API_URL}/listings/sitemap`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as SitemapEntries;
  } catch {
    return { listings: [], storefronts: [] };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { listings, storefronts } = await loadEntries();
  return [
    ...STATIC_PAGES.map((page) => ({
      url: `${SITE_URL}${page.path === "/" ? "" : page.path}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...storefronts.map((storefront) => ({
      url: `${SITE_URL}/lojas/${storefront.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...listings.map((listing) => ({
      url: `${SITE_URL}/anuncio/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
