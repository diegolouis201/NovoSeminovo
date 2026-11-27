// Endereço das fotos e arquivos servidos pela API. Separado de lib/api.ts
// (que carrega todas as chamadas à API, os dados de exemplo e o contrato com
// zod) para os componentes do navegador que só precisam montar o link da foto
// não levarem tudo isso junto no JS da página.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Fotos de anúncio vêm da API como caminho relativo (/uploads/...), porque é
// lá que o arquivo é servido (ver apps/api/src/main.ts) — o navegador
// resolveria isso contra o domínio do site, não da API, então quebra sem
// este prefixo. URL de mock-data.ts já vem absoluta e passa direto.
export function resolveMediaUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}
