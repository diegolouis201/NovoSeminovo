// Marcação schema.org dos guias. O conteúdo é nosso (lib/guias.ts), e mesmo
// assim o "<" sai escapado para nenhum texto conseguir fechar o <script>.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
