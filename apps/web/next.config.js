/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@novoseminovo/shared-types"],
  // Fotos do anúncio passam por Server Action (ver uploadWizardPhotosAction):
  // o padrão de 1 MB barraria até uma foto só.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // Links do site abrindo direto no app do celular (ver mobile/README.md).
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/app-links/assetlinks" },
      { source: "/.well-known/apple-app-site-association", destination: "/api/app-links/apple" },
    ];
  },
};

module.exports = nextConfig;
