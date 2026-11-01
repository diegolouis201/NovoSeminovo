/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
