/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@novoseminovo/shared-types"],
  // Fotos do anúncio passam por Server Action (ver uploadWizardPhotosAction):
  // o padrão de 1 MB barraria até uma foto só.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

module.exports = nextConfig;
