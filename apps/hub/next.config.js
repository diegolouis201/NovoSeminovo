/** @type {import('next').NextConfig} */
// NovoSeminovo Hub (hub.novoseminovo.com.br): CRM da empresa com login.
// Usa as mesmas regras do CRM (crm-pacote/scripts/*.mjs, com testes) — por
// isso externalDir: o código fica fora desta pasta.
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@novoseminovo/shared-types"],
  // Imagens do marketing sobem por Server Action (até ~4 MB cada).
  experimental: { externalDir: true, serverActions: { bodySizeLimit: "12mb" } },
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
