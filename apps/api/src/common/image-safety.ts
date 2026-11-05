import { BadRequestException } from "@nestjs/common";
import sharp, { type Metadata, type SharpOptions } from "sharp";
import { scanForMalware } from "./malware-scan";

// Toda foto enviada por usuário (anúncio, logo, comprovante) passa por aqui
// antes de qualquer outro processamento:
// 1. antivírus (ClamAV, quando configurado);
// 2. tipo REAL pelos bytes — nome do arquivo e tipo dito pelo navegador não
//    valem (um HTML ou SVG "renomeado" para .jpg é recusado);
// 3. tamanho em pixels conferido no cabeçalho, sem abrir a imagem — barra a
//    "bomba de pixels" (arquivo pequeno que vira gigabytes na memória);
// 4. a foto é redesenhada do zero (girada, reduzida a no máximo 2560 px,
//    salva em JPEG/WebP novo): EXIF, GPS, script ou outro arquivo grudado no
//    original ficam para trás.

export const MAX_IMAGE_PIXELS = 40_000_000; // 40 megapixels
export const MAX_IMAGE_SIDE = 12_000;
const OUTPUT_MAX_SIDE = 2560;
const TOO_BIG = "Imagem grande demais (máximo de 40 megapixels). Envie uma foto menor.";

type Env = Record<string, string | undefined>;
type UploadFile = { buffer: Buffer; mimetype: string; originalname: string };

export function sniffFileType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4" | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  // MP4/MOV: caixa "ftyp" logo no começo (vídeos do marketing no Hub).
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  return undefined;
}

// sharp sempre com teto de pixels: use no lugar de sharp() em todo o código
// (fotos do CRM e de outros sites também passam por aqui).
export function safeSharp(input?: Buffer, options: SharpOptions = {}) {
  return sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error", ...options });
}

export async function assertNoMalware(buffer: Buffer, env: Env = process.env): Promise<void> {
  const result = await scanForMalware(buffer, env).catch((error: Error) => {
    throw new BadRequestException(error.message);
  });
  if (!result.clean) throw new BadRequestException(`O arquivo foi recusado pelo antivírus (ameaça: ${result.threat}).`);
}

export async function sanitizeUpload(file: UploadFile, env: Env = process.env): Promise<UploadFile> {
  await assertNoMalware(file.buffer, env);
  const type = sniffFileType(file.buffer);
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
    throw new BadRequestException("Este arquivo não é uma imagem JPEG, PNG ou WebP.");
  }
  let meta: Metadata;
  try {
    meta = await safeSharp(file.buffer).metadata();
  } catch (error) {
    // O próprio sharp recusa pelo cabeçalho quando passa do teto de pixels.
    if (/pixel limit/i.test(String((error as Error).message))) throw new BadRequestException(TOO_BIG);
    throw new BadRequestException("Não foi possível abrir esta imagem.");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new BadRequestException(TOO_BIG);
  }
  if ((meta.pages ?? 1) > 1) throw new BadRequestException("Imagem animada não é aceita. Envie uma foto.");

  try {
    const pipeline = safeSharp(file.buffer).rotate().resize(OUTPUT_MAX_SIDE, OUTPUT_MAX_SIDE, { fit: "inside", withoutEnlargement: true });
    const name = file.originalname.replace(/\.[^.]*$/, "");
    if (meta.hasAlpha) {
      return { buffer: await pipeline.webp({ quality: 85 }).toBuffer(), mimetype: "image/webp", originalname: `${name}.webp` };
    }
    return { buffer: await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), mimetype: "image/jpeg", originalname: `${name}.jpg` };
  } catch {
    throw new BadRequestException("Não foi possível processar esta imagem.");
  }
}
