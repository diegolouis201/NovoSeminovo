// /.well-known/assetlinks.json (rewrite em next.config.js): diz ao Android
// que o app br.com.novoseminovo.app pode abrir os links do site. A impressão
// digital vem da Google Play (Configuração do app → Integridade do app →
// Assinatura de apps), em ANDROID_CERT_SHA256 (separe várias por vírgula).
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: "br.com.novoseminovo.app", sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
