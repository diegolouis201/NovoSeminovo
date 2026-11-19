// Endereços do WordPress que existia antes neste domínio (com o plugin WP
// Directory Kit, que criava /wdk-listing/...). O Google ainda os conhece; o
// site responde 410 (Gone) para eles saírem do índice. Lista fechada: só
// caminhos que nenhuma página atual usa (ver app/).

const LEGACY_PATH_PATTERNS: RegExp[] = [
  /^\/wdk-[^/]+(\/|$)/,
  /^\/wp-(content|admin|includes|json)(\/|$)/,
  /^\/wp-login\.php$/,
  /^\/xmlrpc\.php$/,
  /^\/listings?(\/|$)/,
  /^\/(author|category|tag)(\/|$)/,
  /^\/feed$/,
  /^\/index\.php(\/|$)/,
];

// "/qualquer-coisa/feed" era o RSS de post, categoria, comentários... — menos
// as rotas do próprio site que terminam em /feed (ex.: /api/social/[id]/feed).
const NESTED_FEED = /^\/(?!api\/|_next\/).+\/feed$/;

// Post e página do WordPress pelo número: /?p=123 e /?page_id=45.
const LEGACY_QUERY = /^\d+$/;

export function isLegacyWordPress(pathname: string, searchParams: URLSearchParams): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") {
    return LEGACY_QUERY.test(searchParams.get("p") ?? "") || LEGACY_QUERY.test(searchParams.get("page_id") ?? "");
  }
  return LEGACY_PATH_PATTERNS.some((pattern) => pattern.test(path)) || NESTED_FEED.test(path);
}

// Página curta e fixa (nada vindo do endereço entra no HTML).
export const GONE_HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Página removida | NovoSeminovo</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.4rem">Esta página não existe mais.</h1>
<p><a href="/">Ir para o NovoSeminovo</a></p>
</body>
</html>`;
