import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

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
  // Só tipos de imagem conhecidos: outro tipo poderia ser lido como página
  // no domínio do site (script injection).
  const type = (upstream.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return new Response("Foto indisponível.", { status: 415 });
  return new Response(upstream.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
