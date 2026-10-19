import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Proxy server-side pros endpoints de imagem do Instagram (ver
// apps/api/src/listings/listings.controller.ts, rotas /social/*) — eles
// exigem Bearer token, que um <img src> ou <a download> do navegador não
// consegue mandar. As rotas em app/api/social/ chamam isto passando o
// caminho exato da API (ex.: "listings/ID/social/feed") e devolvem a
// imagem com o mesmo content-type, sem nunca expor o accessToken ao
// cliente.
export async function proxySocialImage(apiPath: string): Promise<Response> {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado.", { status: 401 });

  const upstream = await fetch(`${API_URL}/${apiPath}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const message = await upstream.text().catch(() => "");
    return new Response(message || "Não foi possível gerar a imagem.", { status: upstream.status });
  }

  const buffer = await upstream.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "inline",
      "Cache-Control": "no-store",
    },
  });
}
