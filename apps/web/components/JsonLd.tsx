import { serializeJsonLd } from "@/lib/seo/json-ld";

// Marcação schema.org (layout, guias, anúncio, loja). O "<" sai escapado
// (serializeJsonLd) para nenhum texto — nosso ou do anunciante — conseguir
// fechar o <script>.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export { serializeJsonLd };
