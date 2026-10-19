import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const upstream = await fetch(`${API_URL}/listings/${params.id}/social/carousel/count`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) {
    const message = await upstream.text().catch(() => "");
    return Response.json({ error: message || "Não foi possível consultar as fotos." }, { status: upstream.status });
  }
  const data = (await upstream.json()) as { length: number };
  return Response.json(data);
}
