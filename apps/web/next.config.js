/** @type {import('next').NextConfig} */
// Páginas públicas, iguais para todo visitante (o máximo de pessoal é o menu
// com o nome de quem entrou): sem "no-store", o navegador pode guardar a
// página no "voltar instantâneo" (bfcache) — quem abre um anúncio e volta
// para a busca não espera a busca carregar de novo (auditoria web, item 8).
// "private" (nada de cache compartilhado no caminho) e "no-cache" (sempre
// confere com o servidor antes de reusar) continuam. Conta, painel, admin,
// anunciar, entrar e o resto seguem com o padrão do Next (no-store).
const PUBLIC_PAGE_CACHE = "private, no-cache, max-age=0, must-revalidate";
const PUBLIC_PAGES = ["/", "/busca", "/carros", "/carros/:path*", "/imoveis", "/imoveis/:path*", "/anuncio/:id", "/guia", "/guia/:path*"];

const nextConfig = {
  reactStrictMode: true,
  // Não anunciar a tecnologia do site (cabeçalho X-Powered-By: Next.js).
  poweredByHeader: false,
  transpilePackages: ["@novoseminovo/shared-types"],
  // Fotos do anúncio passam por Server Action (ver uploadWizardPhotosAction):
  // o padrão de 1 MB barraria até uma foto só.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // Cabeçalhos de segurança em toda resposta do site, também fora do Caddy
  // (ex.: deploy alternativo da DEPLOY.md). Outro site não abre o nosso dentro
  // de um iframe; o navegador não "adivinha" tipo de arquivo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
        ],
      },
      ...PUBLIC_PAGES.map((source) => ({ source, headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }] })),
    ];
  },
  // O cashback no financiamento acabou (06/11/2026): links antigos (Google,
  // e-mails, avisos) caem numa página que existe.
  async redirects() {
    return [
      { source: "/recompensas", destination: "/como-funciona", statusCode: 301 },
      { source: "/conta/recompensas", destination: "/conta", statusCode: 301 },
      { source: "/admin/recompensas", destination: "/admin/comissoes", statusCode: 301 },
      // Passaporte Digital / Diário do Carro descontinuado (08/11/2026,
      // decisão do Diego): consulta por placa, página do carro, ficha técnica,
      // "Meus veículos" e a fila de serviços da oficina saíram do ar.
      { source: "/consultar-veiculo", destination: "/carros", statusCode: 301 },
      { source: "/veiculo/:path*", destination: "/carros", statusCode: 301 },
      { source: "/ficha-tecnica", destination: "/carros", statusCode: 301 },
      { source: "/conta/veiculos/:path*", destination: "/conta", statusCode: 301 },
      { source: "/parceiro/servicos", destination: "/parceiro", statusCode: 301 },
    ];
  },
  // Links do site abrindo direto no app do celular (ver mobile/README.md).
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/app-links/assetlinks" },
      { source: "/.well-known/apple-app-site-association", destination: "/api/app-links/apple" },
    ];
  },
};

module.exports = nextConfig;
