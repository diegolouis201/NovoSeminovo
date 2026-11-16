import { readSecret } from "../auth/secret-file";
import { contagem } from "./jornada-seguidores";

// Inscritos do canal do YouTube pela YouTube Data API v3 (para a Jornada do
// Hub). Configuração:
//   - chave: arquivo secrets/youtube_api_key (readSecret; nunca no .env de
//     produção). Vai só no cabeçalho x-goog-api-key, nunca na URL.
//   - canal: YOUTUBE_CHANNEL no .env, "UC..." (id) ou "@handle" (ou o link
//     do canal). Ver DEPLOY.md, "Seguidores da Jornada".
// Sem chave ou sem canal: a rede não tem leitura automática (o dono digita).

type Env = Record<string, string | undefined>;
export type CanalYoutube = { id: string } | { handle: string };
export type YoutubeConfig = { chave: string; canal: CanalYoutube; url: string; timeoutMs: number };

const ID = /^UC[\w-]{22}$/;
const HANDLE = /^[\w.-]{3,100}$/;

// Id do canal ou handle (a API aceita o handle sem o @). Só letras, números,
// ponto, traço e sublinhado: nada que vire parâmetro extra na URL.
export function canalYoutube(texto: string | undefined): CanalYoutube | null {
  let v = (texto ?? "").trim();
  if (!v) return null;
  const link = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(.+?)\/?$/i.exec(v);
  if (link) {
    v = link[1]!.replace(/^channel\//, "");
  } else if (/^[a-z]+:\/\//i.test(v)) {
    return null;
  }
  if (ID.test(v)) return { id: v };
  if (v.startsWith("@") && HANDLE.test(v.slice(1))) return { handle: v.slice(1) };
  return null;
}

// Resposta de channels?part=statistics. Contagem oculta pelo dono do canal =
// sem número (null). Lista vazia = canal não existe (erro, fica o último valor).
// O YouTube arredonda o total (ex.: 1.230 em vez de 1.234).
export function seguidoresYoutube(body: unknown): number | null {
  const item = (body as { items?: unknown })?.items;
  const primeiro = Array.isArray(item) ? (item[0] as { statistics?: { subscriberCount?: unknown; hiddenSubscriberCount?: unknown } } | undefined) : undefined;
  if (!primeiro) throw new Error("canal não encontrado (confira YOUTUBE_CHANNEL)");
  if (primeiro.statistics?.hiddenSubscriberCount === true) return null;
  return contagem(primeiro.statistics?.subscriberCount);
}

// null = não configurado. Chave ausente (ou arquivo com permissão aberta)
// não derruba nada: a rede só deixa de ser automática.
export function youtubeConfig(env: Env = process.env): YoutubeConfig | null {
  const canal = canalYoutube(env.YOUTUBE_CHANNEL);
  if (!canal) return null;
  let chave: string;
  try {
    chave = readSecret("YOUTUBE_API_KEY", env, undefined, { minLength: 30, howTo: "crie a chave no Google Cloud (DEPLOY.md, \"Seguidores da Jornada\")" });
  } catch {
    return null;
  }
  const url = (env.YOUTUBE_API_URL || "https://www.googleapis.com/youtube/v3").replace(/\/+$/, "");
  return { chave, canal, url, timeoutMs: 10_000 };
}

export async function fetchYoutubeSubscribers(config: YoutubeConfig): Promise<number | null> {
  const params = new URLSearchParams({ part: "statistics" });
  if ("id" in config.canal) params.set("id", config.canal.id);
  else params.set("forHandle", config.canal.handle);
  const esconder = (t: string) => t.split(config.chave).join("***");
  let res: Response;
  try {
    res = await fetch(`${config.url}/channels?${params.toString()}`, {
      signal: AbortSignal.timeout(config.timeoutMs),
      headers: { "x-goog-api-key": config.chave, Accept: "application/json" },
    });
  } catch (erro) {
    const nome = (erro as Error).name;
    throw new Error(nome === "TimeoutError" || nome === "AbortError" ? "tempo esgotado" : esconder(`sem conexão (${(erro as Error).message})`));
  }
  const raw = await res.text().catch(() => "");
  if (raw.length > 1_000_000) throw new Error("resposta grande demais");
  if (!res.ok) {
    // Só o código e o motivo curto do Google; a mensagem pode ecoar a chave.
    let motivo = "";
    try {
      const e = (JSON.parse(raw) as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } }).error;
      motivo = [e?.status, e?.errors?.[0]?.reason].filter((v): v is string => typeof v === "string" && /^[\w.-]{1,60}$/.test(v)).join(" ");
    } catch {
      motivo = "";
    }
    throw new Error(`HTTP ${res.status}${motivo ? ` (${motivo})` : ""}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("resposta inválida");
  }
  return seguidoresYoutube(body);
}
