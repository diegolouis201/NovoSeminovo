import { isMetaPixelId } from "@novoseminovo/shared-types/dist/navegador";

// ID do pixel da Meta (NEXT_PUBLIC_META_PIXEL_ID, gravado no build). Público
// por natureza (vai no HTML). Qualquer coisa que não seja só números = pixel
// desligado — o ID entra no código do navegador, então nada além de dígitos.
const raw = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
export const META_PIXEL_ID: string | undefined = raw && isMetaPixelId(raw) ? raw : undefined;
