// Publicação no Instagram e no Facebook pela API oficial da Meta (Graph API).
// Mesmo código que o antigo módulo de marketing usava (Instagram), agora com
// carrossel e com a página do Facebook.
//
// INSTAGRAM_ACCESS_TOKEN  token com instagram_content_publish (+ insights)
// INSTAGRAM_ACCOUNT_ID    id da conta profissional (ig-user-id)
// FACEBOOK_PAGE_ID        id da página do Facebook
// FACEBOOK_PAGE_TOKEN     token da página (pages_manage_posts)
// INSTAGRAM_GRAPH_HOST    graph.facebook.com (padrão); em testes, http://127.0.0.1:porta
// INSTAGRAM_GRAPH_VERSION v23.0 (padrão)
// Os tokens vão no corpo/consulta e nunca aparecem em log ou mensagem de erro.

const TIMEOUT_MS = 30_000;
export class MetaError extends Error {}

export const instagramEnabled = () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID);
export const facebookEnabled = () => Boolean(process.env.FACEBOOK_PAGE_TOKEN && process.env.FACEBOOK_PAGE_ID);

function baseUrl(): string {
  const host = process.env.INSTAGRAM_GRAPH_HOST || "graph.facebook.com";
  const version = process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";
  return `${host.startsWith("http") ? host : `https://${host}`}/${version}`;
}

async function call(token: string | undefined, method: "GET" | "POST", path: string, params: Record<string, string>, quem: string): Promise<Record<string, unknown>> {
  if (!token) throw new MetaError(`${quem} não configurado no servidor`);
  const query = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${baseUrl()}${path}?${query}` : `${baseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(method === "POST" ? { body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
  }).catch((error: Error) => {
    throw new MetaError(`${quem} fora do ar: ${error.message}`);
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const message = (body.error?.message ?? `HTTP ${res.status}`).split(token).join("***");
    throw new MetaError(`${quem} recusou (${body.error?.code ?? res.status}): ${message}`);
  }
  return body;
}

const ig = (method: "GET" | "POST", path: string, params: Record<string, string>) => call(process.env.INSTAGRAM_ACCESS_TOKEN, method, path, params, "Instagram");
const fb = (method: "GET" | "POST", path: string, params: Record<string, string>) => call(process.env.FACEBOOK_PAGE_TOKEN, method, path, params, "Facebook");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function esperarPronto(creationId: string, pollMs: number) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const status = await ig("GET", `/${creationId}`, { fields: "status_code" });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new MetaError(`Instagram não processou a imagem (${status.status_code})`);
    await wait(pollMs);
  }
  throw new MetaError("Instagram demorou demais para processar a imagem");
}

// Uma imagem: post comum. Duas a dez: carrossel. URLs públicas de JPEG.
export async function publicarInstagram(imagens: string[], legenda: string, pollMs = 3000): Promise<{ mediaId: string; link?: string }> {
  const conta = process.env.INSTAGRAM_ACCOUNT_ID as string;
  let creationId: string;
  if (imagens.length === 1) {
    creationId = String((await ig("POST", `/${conta}/media`, { image_url: imagens[0], caption: legenda })).id ?? "");
  } else {
    const filhos: string[] = [];
    for (const url of imagens) filhos.push(String((await ig("POST", `/${conta}/media`, { image_url: url, is_carousel_item: "true" })).id ?? ""));
    creationId = String((await ig("POST", `/${conta}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda })).id ?? "");
  }
  if (!creationId) throw new MetaError("Instagram não devolveu o contêiner da mídia");
  await esperarPronto(creationId, pollMs);
  const mediaId = String((await ig("POST", `/${conta}/media_publish`, { creation_id: creationId })).id ?? "");
  if (!mediaId) throw new MetaError("Instagram não devolveu o id do post publicado");
  const details = await ig("GET", `/${mediaId}`, { fields: "permalink" }).catch(() => ({}) as Record<string, unknown>);
  return { mediaId, link: typeof details.permalink === "string" ? details.permalink : undefined };
}

export async function publicarFacebook(imagens: string[], legenda: string): Promise<{ postId: string; link: string }> {
  const pagina = process.env.FACEBOOK_PAGE_ID as string;
  let postId: string;
  if (imagens.length === 1) {
    const r = await fb("POST", `/${pagina}/photos`, { url: imagens[0], caption: legenda });
    postId = String(r.post_id ?? r.id ?? "");
  } else {
    const ids: string[] = [];
    for (const url of imagens) ids.push(String((await fb("POST", `/${pagina}/photos`, { url, published: "false" })).id ?? ""));
    const params: Record<string, string> = { message: legenda };
    ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    postId = String((await fb("POST", `/${pagina}/feed`, params)).id ?? "");
  }
  if (!postId) throw new MetaError("Facebook não devolveu o id do post");
  return { postId, link: `https://www.facebook.com/${postId}` };
}

export const INSIGHT_METRICS = ["reach", "likes", "comments", "saved", "shares"] as const;

export async function metricasInstagram(mediaId: string): Promise<Record<string, number>> {
  const body = await ig("GET", `/${mediaId}/insights`, { metric: INSIGHT_METRICS.join(",") });
  const data = (body.data ?? []) as { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[];
  const out: Record<string, number> = {};
  for (const item of data) {
    const value = item.total_value?.value ?? item.values?.[0]?.value;
    if (item.name && typeof value === "number") out[item.name] = value;
  }
  return out;
}
