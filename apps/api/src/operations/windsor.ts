// Leitura de dados de marketing pelo Windsor.ai (Google Analytics 4 e
// Instagram já conectados na conta do NovoSeminovo; Meta Ads e Google Ads
// entram do mesmo jeito quando forem conectados lá). Só leitura.
// WINDSOR_API_KEY no .env liga; WINDSOR_API_URL só pra teste local.
const BASE_URL = (process.env.WINDSOR_API_URL ?? "https://connectors.windsor.ai").replace(/\/$/, "");
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; rows: Record<string, unknown>[] }>();

export function windsorEnabled(): boolean {
  return Boolean(process.env.WINDSOR_API_KEY);
}

export async function windsorRows(connector: string, fields: string[], datePreset: string): Promise<Record<string, unknown>[]> {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error("Windsor.ai não configurado (WINDSOR_API_KEY)");
  const url = `${BASE_URL}/${encodeURIComponent(connector)}?fields=${encodeURIComponent(fields.join(","))}&date_preset=${encodeURIComponent(datePreset)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    // A chave vai no cabeçalho, não na URL: assim ela não aparece em log de acesso.
    const res = await fetch(url, { headers: { "X-Api-Key": key }, signal: controller.signal });
    if (!res.ok) throw new Error(`Windsor.ai respondeu ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown>[] } | Record<string, unknown>[];
    const rows = Array.isArray(body) ? body : (body.data ?? []);
    cache.set(url, { at: Date.now(), rows });
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}
