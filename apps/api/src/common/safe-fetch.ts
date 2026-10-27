import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

// Download de URL informada por usuário (feed do CRM, foto de anúncio vinda
// do CRM). Sem isto, um parceiro poderia cadastrar "http://postgres:5432" ou
// "http://169.254.169.254/" como feed e fazer a API acessar a rede interna
// do servidor (SSRF). O IP é checado no momento da conexão (via `lookup`),
// não só antes — senão um DNS que responde um IP público na checagem e um
// privado na conexão passaria.

export class SafeFetchError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const value = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff")
    );
  }
  return true;
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as unknown as LookupAddress[];
    const blocked = list.find((entry) => isPrivateAddress(entry.address));
    if (blocked || list.length === 0) {
      return callback(new SafeFetchError(`Endereço não permitido: ${hostname}`) as NodeJS.ErrnoException, "", 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("Link inválido.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("O link precisa começar com http:// ou https://.");
  }
  if (url.username || url.password) throw new SafeFetchError("Link com usuário/senha embutidos não é aceito.");
  // IP literal não passa pelo lookup — checa aqui.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) throw new SafeFetchError("Endereço não permitido.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new SafeFetchError("Endereço não permitido.");
  }
  return url;
}

export type SafeFetchOptions = {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  accept?: string;
  // Alguns portais recusam robôs: a importação pelo link se identifica como
  // navegador comum (ver ListingImportService).
  userAgent?: string;
};

export type SafeFetchResult = { buffer: Buffer; contentType?: string; finalUrl: string };

function requestOnce(url: URL, options: SafeFetchOptions): Promise<{ status: number; location?: string; result?: SafeFetchResult }> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: options.timeoutMs,
        headers: {
          "User-Agent": options.userAgent ?? "NovoSeminovo-Integracao/1.0 (+https://novoseminovo.com.br)",
          "Accept-Language": "pt-BR,pt;q=0.9",
          Accept: options.accept ?? "*/*",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ status, location: response.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new SafeFetchError(`O servidor respondeu com erro ${status}.`));
          return;
        }
        const declared = Number(response.headers["content-length"]);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          response.destroy();
          reject(new SafeFetchError(`Arquivo grande demais (limite ${Math.round(options.maxBytes / 1_000_000)} MB).`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            response.destroy(new SafeFetchError(`Arquivo grande demais (limite ${Math.round(options.maxBytes / 1_000_000)} MB).`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status,
            result: {
              buffer: Buffer.concat(chunks),
              contentType: response.headers["content-type"],
              finalUrl: url.toString(),
            },
          }),
        );
      },
    );
    request.on("timeout", () => request.destroy(new SafeFetchError("O servidor demorou demais para responder.")));
    request.on("error", (error) =>
      reject(error instanceof SafeFetchError ? error : new SafeFetchError(`Não foi possível acessar o link: ${error.message}`)),
    );
    request.end();
  });
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  let url = assertPublicHttpUrl(raw);
  const maxRedirects = options.maxRedirects ?? 3;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await requestOnce(url, options);
    if (response.result) return response.result;
    // Cada redirecionamento passa pela mesma validação — senão um link
    // público poderia redirecionar pra um endereço interno.
    url = assertPublicHttpUrl(new URL(response.location!, url).toString());
  }
  throw new SafeFetchError("Redirecionamentos demais.");
}
