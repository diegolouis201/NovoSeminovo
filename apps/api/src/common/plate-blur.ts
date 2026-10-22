import sharp, { type OverlayOptions } from "sharp";
import type { PlateBox } from "../listings/ai.service";

// Borra as regiões (placas) de uma foto, com folga em volta porque a posição
// que a IA devolve é aproximada. Mantém o formato original e respeita a
// orientação EXIF (foto de celular "deitada"). Desfoque forte + pixelização,
// pra placa não ficar legível nem com ajuste de contraste.
const MARGIN = 0.35;

export async function blurRegions(input: Buffer, boxes: PlateBox[]): Promise<Buffer> {
  if (boxes.length === 0) return input;
  const base = sharp(input).rotate();
  const { data: oriented, info } = await base.toBuffer({ resolveWithObject: true });
  const { width, height, format } = info;

  const overlays: OverlayOptions[] = [];
  for (const box of boxes) {
    const padX = box.width * MARGIN;
    const padY = box.height * MARGIN;
    const left = Math.max(0, Math.floor((box.x - padX) * width));
    const top = Math.max(0, Math.floor((box.y - padY) * height));
    const right = Math.min(width, Math.ceil((box.x + box.width + padX) * width));
    const bottom = Math.min(height, Math.ceil((box.y + box.height + padY) * height));
    const w = right - left;
    const h = bottom - top;
    if (w < 4 || h < 4) continue;

    const tiny = await sharp(oriented)
      .extract({ left, top, width: w, height: h })
      .resize(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / 16)))
      .toBuffer();
    const patch = await sharp(tiny).resize(w, h, { kernel: "nearest" }).blur(Math.max(2, Math.min(w, h) / 10)).toBuffer();
    overlays.push({ input: patch, left, top });
  }
  if (overlays.length === 0) return input;

  const out = sharp(oriented).composite(overlays);
  if (format === "png") return out.png().toBuffer();
  if (format === "webp") return out.webp({ quality: 90 }).toBuffer();
  return out.jpeg({ quality: 90 }).toBuffer();
}

// Cópia menor só pra mandar pra IA (economiza tokens e tempo); as caixas
// voltam em fração da imagem, então valem pra original.
export async function previewForVision(input: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  const buffer = await sharp(input).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}
