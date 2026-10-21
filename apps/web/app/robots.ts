import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";

// Áreas logadas e de sistema não têm o que indexar (e algumas mostram dados
// pessoais pra quem está logado) — o resto do site fica aberto ao Google.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/parceiro", "/conta", "/api/", "/entrar", "/cadastro", "/anuncio/*/fotos", "/integracoes"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
