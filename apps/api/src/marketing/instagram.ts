// Publicação no Instagram pela API oficial da Meta (Instagram Graph API,
// "content publishing"). Precisa de uma conta Instagram profissional e de um
// token com instagram_content_publish (e instagram_manage_insights para as
// métricas). Ver docs/marketing.md.
//
// INSTAGRAM_ACCESS_TOKEN  token de longa duração
// INSTAGRAM_ACCOUNT_ID    id da conta profissional (ig-user-id)
// INSTAGRAM_GRAPH_HOST    graph.facebook.com (login pelo Facebook, padrão) ou graph.instagram.com (login pelo Instagram)
// INSTAGRAM_GRAPH_VERSION v23.0 (padrão)
// Em testes, INSTAGRAM_GRAPH_HOST pode ser http://127.0.0.1:porta.

const TIMEOUT_MS = 30_000;

export function instagramEnabled(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID);
}

function baseUrl(): string {
  const host = process.env.INSTAGRAM_GRAPH_HOST || "graph.facebook.com";
  const version = process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";
  return `${host.startsWith("http") ? host : `https://${host}`}/${version}`;
}

export class InstagramError extends Error {}

// O token vai no corpo/consulta e nunca aparece em log ou mensagem de erro.
async function call(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new InstagramError("Instagram não configurado (INSTAGRAM_ACCESS_TOKEN)");
  const query = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${baseUrl()}${path}?${query}` : `${baseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(method === "POST" ? { body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
  }).catch((error: Error) => {
    throw new InstagramError(`Instagram fora do ar: ${error.message}`);
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const message = (body.error?.message ?? `HTTP ${res.status}`).replace(token, "***");
    throw new InstagramError(`Instagram recusou (${body.error?.code ?? res.status}): ${message}`);
  }
  return body;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cria o contêiner com a imagem (URL pública JPEG) e a legenda, espera a Meta
// processar e publica. Devolve o id da mídia e o link do post.
export async function publishImage(imageUrl: string, caption: string, pollMs = 3000): Promise<{ mediaId: string; permalink?: string }> {
  const account = process.env.INSTAGRAM_ACCOUNT_ID as string;
  const container = await call("POST", `/${account}/media`, { image_url: imageUrl, caption });
  const creationId = String(container.id ?? "");
  if (!creationId) throw new InstagramError("Instagram não devolveu o contêiner da mídia");
  for (let attempt = 0; attempt < 10; attempt++) {
    const status = await call("GET", `/${creationId}`, { fields: "status_code" });
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new InstagramError(`Instagram não processou a imagem (${status.status_code})`);
    if (attempt === 9) throw new InstagramError("Instagram demorou demais para processar a imagem");
    await wait(pollMs);
  }
  const published = await call("POST", `/${account}/media_publish`, { creation_id: creationId });
  const mediaId = String(published.id ?? "");
  if (!mediaId) throw new InstagramError("Instagram não devolveu o id do post publicado");
  const details = await call("GET", `/${mediaId}`, { fields: "permalink" }).catch(() => ({}) as Record<string, unknown>);
  return { mediaId, permalink: typeof details.permalink === "string" ? details.permalink : undefined };
}

export const INSIGHT_METRICS = ["reach", "likes", "comments", "saved", "shares"] as const;

// Métricas de um post publicado. Métrica que a conta ainda não libera fica de fora.
export async function mediaInsights(mediaId: string): Promise<Record<string, number>> {
  const body = await call("GET", `/${mediaId}/insights`, { metric: INSIGHT_METRICS.join(",") });
  const data = (body.data ?? []) as { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[];
  const metrics: Record<string, number> = {};
  for (const item of data) {
    const value = item.total_value?.value ?? item.values?.[0]?.value;
    if (item.name && typeof value === "number") metrics[item.name] = value;
  }
  return metrics;
}
