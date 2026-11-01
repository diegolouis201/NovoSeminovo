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

// Fotos e arquivos em /uploads: só o próprio site (mesmo domínio-base) pode
// embutir; outro site não usa a API como hospedagem de imagem.
export const STATIC_FILE_HEADERS = {
  "Cross-Origin-Resource-Policy": "same-site",
  "X-Content-Type-Options": "nosniff",
} as const;
