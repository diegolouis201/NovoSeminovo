// Marcação schema.org (guias, layout). O conteúdo é nosso (lib/), e mesmo
// assim o "<" sai escapado para nenhum texto conseguir fechar o <script>.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
