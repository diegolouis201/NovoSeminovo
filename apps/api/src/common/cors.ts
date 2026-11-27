import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

// CORS da API: o navegador só conversa com a API a partir do próprio site
// (WEB_ORIGIN). Chamadas sem Origin — o servidor do site, CRMs pela API de
// integração, webhooks, curl — não passam por CORS e seguem normais; a
// proteção delas é o login/chave de cada rota.

type Env = { WEB_ORIGIN?: string; NODE_ENV?: string };

export function allowedOrigins(env: Env = process.env): string[] {
  const configured = env.WEB_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return [configured];
  if (env.NODE_ENV === "production") {
    throw new Error("WEB_ORIGIN precisa estar configurado em produção (CORS da API só libera o site).");
  }
  return ["http://localhost:3000"];
}

// Comparação exata: nada de "termina com", que deixaria passar
// novoseminovo.com.br.golpe.com ou golpenovoseminovo.com.br.
export function isAllowedOrigin(origin: string, env: Env = process.env): boolean {
  return allowedOrigins(env).includes(origin);
}

export function corsOptions(env: Env = process.env): CorsOptions {
  const origins = allowedOrigins(env);
  return {
    origin: (origin, callback) => callback(null, origin === undefined || origins.includes(origin)),
    // O login vai no cabeçalho Authorization, não em cookie da API.
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  };
}

// Socket.IO (chat ao vivo): CORS não se aplica a WebSocket, então a origem
// é conferida no aperto de mão, com a mesma regra acima (sem Origin = não é
// navegador; o login vem no token do aperto de mão).
export function socketAllowRequest(env: Env = process.env) {
  const origins = allowedOrigins(env);
  return (request: { headers: { origin?: string } }, callback: (error: string | null | undefined, allow: boolean) => void) => {
    const origin = request.headers.origin;
    callback(null, origin === undefined || origins.includes(origin));
  };
}

// Fotos e arquivos em /uploads: só o próprio site (mesmo domínio-base) pode
// embutir; outro site não usa a API como hospedagem de imagem.
export const STATIC_FILE_HEADERS = {
  "Cross-Origin-Resource-Policy": "same-site",
  "X-Content-Type-Options": "nosniff",
} as const;

// Opções do express.static de /uploads (main.ts). Toda foto tem nome único
// (uuid gerado no envio, ver common/storage.ts; a cópia menor tem nome
// derivado e é gravada uma vez) e nunca é regravada com outro conteúdo:
// o navegador pode guardar por 1 ano sem perguntar de novo (auditoria web,
// item 8). Arquivo apagado some do servidor; o anúncio deixa de apontar
// para ele.
export const UPLOADS_STATIC_OPTIONS = {
  maxAge: "365d",
  immutable: true,
  setHeaders: (res: { setHeader(name: string, value: string): unknown }) => {
    for (const [name, value] of Object.entries(STATIC_FILE_HEADERS)) res.setHeader(name, value);
  },
};
