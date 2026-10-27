import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Foto do anúncio importado de outro site: o navegador não pode buscar direto
// lá, então passa pela API (que baixa com proteção contra endereço interno).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.accessToken) return new Response("Entre na sua conta.", { status: 401 });
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const upstream = await fetch(`${API_URL}/listing-import/photo?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Foto indisponível.", { status: upstream.status });
  return new Response(upstream.body, {
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=600" },
  });
}
