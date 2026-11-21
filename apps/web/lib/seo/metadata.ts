// Metadados de página com a prévia de compartilhamento completa. No Next, a
// página que define `openGraph` substitui o do layout inteiro (inclusive a
// imagem e o nome do site) e o twitter:* copia o og do layout — por isso cada
// página com texto próprio passa por aqui (auditoria de SEO, 21/11/2026).
import type { Metadata } from "next";

export const SITE_NAME = "NovoSeminovo";

// Descrições conferidas com o que o site faz (auditoria de SEO, 21/11/2026):
// anunciar grátis (pessoa física), chat com o anunciante, simulação de
// financiamento no anúncio, selo de verificada (nem toda loja/imobiliária é
// verificada — por isso "selo", e não "lojas verificadas"), referência FIPE no
// anúncio de carro, mapa e aluguel na busca de imóveis.
export const HOME_DESCRIPTION =
  "Carros e imóveis no mesmo lugar, em todo o Brasil. Anuncie grátis, fale com o anunciante e veja as opções de financiamento no próprio anúncio.";
export const CARROS_DESCRIPTION =
  "Carros seminovos e usados de lojas e particulares, com selo de loja verificada, preço de referência FIPE e simulação de financiamento no anúncio.";
export const IMOVEIS_DESCRIPTION =
  "Casas, apartamentos e terrenos à venda e para alugar, com mapa, simulação de financiamento e selo de imobiliária verificada.";
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "NovoSeminovo — carros e imóveis, sem enrolação" };

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  image = DEFAULT_OG_IMAGE,
}: {
  /** Sem " | NovoSeminovo" (o template põe), a não ser com absoluteTitle. */
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  image?: { url: string; width?: number; height?: number; alt?: string };
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NAME, title: fullTitle, description, url: path, images: [image] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
  };
}
