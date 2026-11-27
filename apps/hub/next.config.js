/** @type {import('next').NextConfig} */
// NovoSeminovo Hub (hub.novoseminovo.com.br): CRM da empresa com login.
// Usa as mesmas regras do CRM (crm-pacote/scripts/*.mjs, com testes) — por
// isso externalDir: o código fica fora desta pasta.
const nextConfig = {
  reactStrictMode: true,
  // Não anunciar a tecnologia do site (cabeçalho X-Powered-By: Next.js).
  poweredByHeader: false,
  transpilePackages: ["@novoseminovo/shared-types"],
  // Otimizador de imagem (/_next/image) desligado: não usamos next/image e o
  // Next 14 tem falhas críticas nele só corrigidas no Next 15.
  images: { unoptimized: true },
  // Imagens e vídeos do marketing sobem por Server Action (vídeo até 150 MB).
  experimental: { externalDir: true, serverActions: { bodySizeLimit: "160mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Área interna: o Google não indexa.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
