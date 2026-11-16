import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";

// Áreas logadas e de sistema não têm o que indexar (e algumas mostram dados
// pessoais pra quem está logado) — o resto do site fica aberto ao Google.
const PRIVATE_PATHS = ["/admin", "/comercial", "/parceiro", "/conta", "/api/", "/entrar", "/cadastro", "/anuncio/*/fotos", "/integracoes"];

// GEO (16/11/2026): robôs de busca e de assistentes de IA citados pelo nome,
// para ninguém fechar o site para eles por engano. Robô com grupo próprio
// ignora o "*", então cada grupo repete as áreas privadas.
const SEARCH_AND_AI_BOTS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...SEARCH_AND_AI_BOTS.map((bot) => ({ userAgent: bot, allow: "/", disallow: PRIVATE_PATHS })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
