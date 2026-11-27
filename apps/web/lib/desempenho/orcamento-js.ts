import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// Orçamento de JavaScript das páginas públicas (pedido do Diego, 27/11/2026:
// site leve no celular por SEO e conversão). O número "First Load JS" que o
// `next build` imprime não soma o JS do layout raiz (cabeçalho, assistente,
// aviso de cookies...), que toda página baixa. Aqui a conta é a de verdade:
// layouts do caminho + a página, sem repetir arquivo, em gzip.

export type AppBuildManifest = { pages: Record<string, string[]> };

// "/anuncio/[id]/page" → ["/layout", "/anuncio/layout", "/anuncio/[id]/layout", "/anuncio/[id]/page"]
export function routeEntries(route: string): string[] {
  const segments = route.split("/").filter(Boolean);
  const page = segments.pop();
  if (page !== "page") throw new Error(`Rota precisa terminar em /page: ${route}`);
  const layouts = ["/layout"];
  for (let i = 0; i < segments.length; i++) layouts.push(`/${segments.slice(0, i + 1).join("/")}/layout`);
  return [...layouts, route];
}

// Arquivos .js que o navegador baixa para abrir a rota (sem repetição).
export function routeScripts(manifest: AppBuildManifest, route: string): string[] {
  const files = new Set<string>();
  for (const entry of routeEntries(route)) {
    for (const file of manifest.pages[entry] ?? []) if (file.endsWith(".js")) files.add(file);
  }
  return [...files].sort();
}

export function gzipKb(bytes: Buffer): number {
  return gzipSync(bytes, { level: 9 }).length / 1024;
}

export type RouteReport = { route: string; gzipKb: number; scripts: string[] };

// Lê o resultado do `next build` (pasta .next). undefined = sem build de produção.
export function readBuild(nextDir: string): { manifest: AppBuildManifest; read: (file: string) => Buffer } | undefined {
  const manifestPath = join(nextDir, "app-build-manifest.json");
  if (!existsSync(manifestPath) || !existsSync(join(nextDir, "BUILD_ID"))) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AppBuildManifest;
  return { manifest, read: (file) => readFileSync(join(nextDir, file)) };
}

export function measureRoute(build: NonNullable<ReturnType<typeof readBuild>>, route: string): RouteReport {
  const scripts = routeScripts(build.manifest, route);
  const total = scripts.reduce((sum, file) => sum + gzipKb(build.read(file)), 0);
  return { route, gzipKb: Math.round(total * 10) / 10, scripts };
}

// Marca do zod dentro de um arquivo de JS (lista de códigos de erro dele).
// O pacote @novoseminovo/shared-types sai em CommonJS (sem tree-shaking): um
// componente do navegador que importa qualquer valor da raiz do pacote leva
// junto o contrato inteiro (~110 KB) e o zod (~70 KB).
export const ZOD_MARKER = "invalid_union_discriminator";
export const SHARED_TYPES_BARREL_MARKER = "ListingSummarySchema";

export function scriptsContaining(build: NonNullable<ReturnType<typeof readBuild>>, scripts: string[], marker: string): string[] {
  return scripts.filter((file) => build.read(file).includes(marker));
}
