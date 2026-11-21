import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";
import { buildSitemap, type SitemapInput } from "@/lib/seo/sitemap";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Gerado a cada pedido (o Google passa poucas vezes por dia): sempre com os
// anúncios ativos e as lojas de agora. Se a API estiver fora, sai só com as
// páginas fixas e os guias. Datas (<lastmod>) e a lista de páginas fixas:
// lib/seo/sitemap.ts — mudou o texto de uma página, atualize a data dela lá.
export const dynamic = "force-dynamic";

async function loadEntries(): Promise<Omit<SitemapInput, "siteUrl">> {
  try {
    const res = await fetch(`${API_URL}/listings/sitemap`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as Omit<SitemapInput, "siteUrl">;
  } catch {
    return { listings: [], storefronts: [] };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap({ siteUrl: SITE_URL, ...(await loadEntries()) });
}
