// Gera as cópias menores (WebP 320/640/800/1024/1600) das fotos de anúncio que
// já existiam antes de 16/11/2026. Rodar uma vez no servidor, depois do
// deploy (ver DEPLOY.md, "Fotos em vários tamanhos"):
//
//   docker compose exec api node dist/scripts/gerar-tamanhos-fotos.js
//
// Pode rodar de novo sem problema: só mexe em foto que ainda não tem cópias.
// Foto que veio do CRM pelo link (não está no nosso armazenamento) fica como
// está; o site mostra a original.
import "dotenv/config";
import { getPhotoStorage } from "../common/storage";
import { backfillPhotoVariants } from "../common/photo-variants";
import { PrismaService } from "../prisma/prisma.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    // eslint-disable-next-line no-console
    const log = (line: string) => console.log(line);
    const result = await backfillPhotoVariants(prisma, getPhotoStorage(), { log });
    log(`PRONTO: ${result.converted} foto(s) convertida(s), ${result.failed} com erro, ${result.external} de link externo (ficam como estão).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Conversão das fotos falhou:", error);
  process.exit(1);
});
