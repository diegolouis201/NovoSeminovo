// Fotos de anúncio em vários tamanhos (auditoria web de 16/11/2026, item 1).
// No envio, a API guarda a foto original e gera cópias menores em WebP ao
// lado dela, com nome derivado do original: "/uploads/abc.jpg" ganha
// "/uploads/abc-w640.webp" etc. (800 cobre o celular comum: 380 px × 2). O banco guarda só as larguras geradas
// (Photo.variantWidths); o site monta o srcset com estas funções. Foto sem
// cópias (antiga, ou que veio do CRM pelo link) continua com o original.

export const PHOTO_VARIANT_WIDTHS = [320, 640, 800, 1024, 1600] as const;
const LARGEST_VARIANT = 1600;

// Larguras que valem a pena para uma foto desta largura: as padrão menores
// que ela e, no topo, a própria largura (até 1600). Nunca amplia.
export function photoVariantWidths(originalWidth: number): number[] {
  const width = Math.floor(originalWidth);
  if (!Number.isFinite(width) || width < 1) return [];
  const top = Math.min(width, LARGEST_VARIANT);
  return [...PHOTO_VARIANT_WIDTHS.filter((w) => w < top), top];
}

export function photoVariantUrl(url: string, width: number): string {
  return `${url.replace(/\.(jpe?g|png|webp)$/i, "")}-w${Math.floor(width)}.webp`;
}

// srcset pronto ("…-w320.webp 320w, …-w640.webp 640w"); undefined quando a
// foto não tem cópias, e o <img> fica só com o src original.
export function photoSrcSet(url: string | undefined, widths: readonly number[] | undefined, resolve: (url: string) => string = (u) => u): string | undefined {
  if (!url || !widths || widths.length === 0) return undefined;
  return [...widths]
    .filter((w) => Number.isInteger(w) && w > 0)
    .sort((a, b) => a - b)
    .map((w) => `${resolve(photoVariantUrl(url, w))} ${w}w`)
    .join(", ") || undefined;
}
