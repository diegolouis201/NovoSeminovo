import { photoSrcSet } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";

// src + srcset de uma foto de anúncio (auditoria web, item 1). A API guarda
// cópias menores em WebP ao lado da original e diz quais larguras existem;
// sem cópias (foto antiga ainda não convertida, link de CRM) fica só o src
// original, que continua funcionando.
export function photoImage(url: string, widths?: readonly number[]): { src: string; srcSet?: string } {
  return { src: resolveMediaUrl(url), srcSet: photoSrcSet(url, widths, resolveMediaUrl) };
}
