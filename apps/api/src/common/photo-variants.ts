import { Logger } from "@nestjs/common";
import { photoVariantUrl, photoVariantWidths } from "@novoseminovo/shared-types";
import { safeSharp } from "./image-safety";
import type { PhotoStorage } from "./storage";

// Cópias menores das fotos de anúncio (auditoria web de 16/11/2026, item 1):
// WebP em 320, 640, 800, 1024 e 1600 px (PHOTO_VARIANT_WIDTHS).
// Entram aqui SÓ fotos já tratadas: passaram por sanitizeUpload (antivírus,
// tipo pelos bytes, redesenhada do zero) e, no carro, pela placa borrada —
// a cópia nasce da foto tratada, nunca do arquivo que a pessoa mandou.
// WebP qualidade 78: no celular a diferença para 85 não aparece e o arquivo
// fica bem menor.
const VARIANT_QUALITY = 78;
const logger = new Logger("PhotoVariants");

export type PhotoVariant = { width: number; buffer: Buffer };

export async function makePhotoVariants(buffer: Buffer): Promise<PhotoVariant[]> {
  const meta = await safeSharp(buffer).rotate().metadata();
  // Foto em pé (EXIF de rotação) troca largura e altura depois do rotate().
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = (swapped ? meta.height : meta.width) ?? 0;
  const widths = photoVariantWidths(width);
  return Promise.all(
    widths.map(async (w) => ({
      width: w,
      buffer: await safeSharp(buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: VARIANT_QUALITY }).toBuffer(),
    })),
  );
}

type PreparedFile = { buffer: Buffer; originalname: string; mimetype: string };

// Grava a foto tratada e as cópias. Falha nas cópias nunca derruba o envio:
// a foto fica só com a original (o site mostra a original) e o comando de
// conversão (scripts/gerar-tamanhos-fotos) tenta de novo depois.
export async function savePhotoWithVariants(storage: PhotoStorage, file: PreparedFile): Promise<{ url: string; widths: number[] }> {
  const url = await storage.save(file.buffer, file.originalname, file.mimetype);
  return { url, widths: await storeVariantsFor(storage, url, file.buffer) };
}

export async function storeVariantsFor(storage: PhotoStorage, url: string, buffer: Buffer): Promise<number[]> {
  try {
    return await makeAndStore(storage, url, buffer);
  } catch (error) {
    logger.warn(`Cópias menores da foto não foram geradas (fica só a original): ${error}`);
    return [];
  }
}

export async function removePhotoWithVariants(storage: PhotoStorage, url: string, widths: readonly number[]): Promise<void> {
  await storage.remove(url);
  // remove() nunca lança (arquivo que já sumiu não impede nada).
  for (const width of widths) await storage.remove(photoVariantUrl(url, width));
}

// Original + cópias, para quem apaga os arquivos de um anúncio inteiro.
export function photoFileUrls(photo: { url: string; variantWidths?: readonly number[] }): string[] {
  return [photo.url, ...(photo.variantWidths ?? []).map((width) => photoVariantUrl(photo.url, width))];
}

type PhotoRows = {
  photo: {
    findMany(args: {
      where: { variantWidths: { isEmpty: true }; listingId?: { in: string[] }; id?: { gt: string } };
      orderBy: { id: "asc" };
      take: number;
      select: { id: true; url: true };
    }): Promise<{ id: string; url: string }[]>;
    update(args: { where: { id: string }; data: { variantWidths: number[] } }): Promise<unknown>;
  };
};

export type BackfillResult = { converted: number; external: number; failed: number };

// Conversão única das fotos que já existiam antes das cópias (comando
// scripts/gerar-tamanhos-fotos, rodado no servidor depois do deploy). Só
// mexe em foto sem cópias; pode rodar quantas vezes quiser. A foto antiga já
// passou pela limpeza e pelo borrão da placa quando foi enviada, então a
// cópia sai dela como está. Link de CRM (foto que não é nossa) fica de fora.
export async function backfillPhotoVariants(
  prisma: PhotoRows,
  storage: PhotoStorage,
  options: { listingIds?: string[]; batchSize?: number; log?: (line: string) => void } = {},
): Promise<BackfillResult> {
  const result: BackfillResult = { converted: 0, external: 0, failed: 0 };
  const take = options.batchSize ?? 50;
  let after: string | undefined;
  for (;;) {
    const rows = await prisma.photo.findMany({
      where: {
        variantWidths: { isEmpty: true },
        ...(options.listingIds ? { listingId: { in: options.listingIds } } : {}),
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: "asc" },
      take,
      select: { id: true, url: true },
    });
    if (rows.length === 0) break;
    after = rows[rows.length - 1]!.id;
    for (const row of rows) {
      if (!storage.owns(row.url)) {
        result.external += 1;
        continue;
      }
      try {
        const widths = await makeAndStore(storage, row.url, await storage.read(row.url));
        await prisma.photo.update({ where: { id: row.id }, data: { variantWidths: widths } });
        result.converted += 1;
      } catch (error) {
        result.failed += 1;
        options.log?.(`Foto ${row.id} não convertida: ${(error as Error).message}`);
      }
    }
    options.log?.(`Até agora: ${result.converted} convertida(s), ${result.failed} com erro, ${result.external} de link externo.`);
  }
  return result;
}

async function makeAndStore(storage: PhotoStorage, url: string, buffer: Buffer): Promise<number[]> {
  const variants = await makePhotoVariants(buffer);
  for (const variant of variants) await storage.saveVariant(url, variant.width, variant.buffer);
  return variants.map((variant) => variant.width);
}
