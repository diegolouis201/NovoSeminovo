import { buildLlmsTxt } from "@/lib/geo";

// Resumo do site para assistentes de IA (formato llmstxt.org). Conteúdo fixo
// (lib/geo.ts + lib/guias.ts): gerado no build, guia novo entra sozinho.
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
