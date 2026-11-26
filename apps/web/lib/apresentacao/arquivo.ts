import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { APRESENTACAO_ARQUIVO, APRESENTACAO_MAX_BYTES, ehPdf } from "./regras";

// Pasta do servidor montada só leitura no container do site
// (docker-compose.yml: ./arquivos-publicos → /app/arquivos-publicos). O nome do
// arquivo é fixo aqui no código: nada da URL entra no caminho.
export function pastaArquivosPublicos(): string {
  return process.env.ARQUIVOS_PUBLICOS_DIR || "/app/arquivos-publicos";
}

export type Apresentacao = { size: number; mtime: Date; ler: () => Promise<Buffer> };

// Abre o PDF (sem seguir link simbólico), confere tamanho e os primeiros
// bytes. Qualquer problema = undefined (a rota responde 404) e fica no log.
export async function abrirApresentacao(): Promise<Apresentacao | undefined> {
  const arquivo = path.join(pastaArquivosPublicos(), APRESENTACAO_ARQUIVO);
  let handle;
  try {
    handle = await open(arquivo, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") console.warn(`[apresentacao] não abriu ${arquivo}: ${code}`);
    return undefined;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0 || info.size > APRESENTACAO_MAX_BYTES) {
      console.warn(`[apresentacao] ${arquivo} recusado: ${info.isFile() ? `${info.size} bytes (limite ${APRESENTACAO_MAX_BYTES})` : "não é arquivo comum"}`);
      return undefined;
    }
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || !ehPdf(bytes)) {
      console.warn(`[apresentacao] ${arquivo} recusado: não começa com %PDF- (não é PDF) ou mudou durante a leitura`);
      return undefined;
    }
    return { size: bytes.length, mtime: info.mtime, ler: async () => bytes };
  } catch (error) {
    console.warn(`[apresentacao] erro lendo ${arquivo}: ${(error as Error).message}`);
    return undefined;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
