import type { ArchitectStoreId } from "@novoseminovo/shared-types";

// Link de busca de um item da lista de compras em cada loja. Quando o Diego
// entrar no programa de afiliados de uma loja, basta pôr o código no .env do
// servidor — o link passa a levar a comissão sem mudar código:
//   AFFILIATE_AMAZON_TAG=meutag-20          (Amazon Associados)
//   AFFILIATE_MAGALU_STORE=magazinenovoseminovo  (Parceiro Magalu: loja em magazinevoce.com.br)
//   AFFILIATE_MERCADOLIVRE_QUERY=...        (parâmetros extras do link de afiliado do ML)
//   AFFILIATE_LEROYMERLIN_QUERY=...         (parâmetros extras, ex.: utm de programa de afiliados)

function slug(text: string, separator: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "");
}

function withExtra(url: string, extra?: string): string {
  if (!extra) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${extra.replace(/^[?&]/, "")}`;
}

export function storeSearchUrl(store: ArchitectStoreId, term: string): string {
  const q = encodeURIComponent(term.trim());
  switch (store) {
    case "amazon": {
      const tag = process.env.AFFILIATE_AMAZON_TAG;
      return `https://www.amazon.com.br/s?k=${q}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
    }
    case "magalu": {
      const partner = process.env.AFFILIATE_MAGALU_STORE;
      return partner
        ? `https://www.magazinevoce.com.br/${encodeURIComponent(partner)}/busca/${slug(term, "+")}/`
        : `https://www.magazineluiza.com.br/busca/${slug(term, "+")}/`;
    }
    case "mercadolivre":
      return withExtra(`https://lista.mercadolivre.com.br/${slug(term, "-")}`, process.env.AFFILIATE_MERCADOLIVRE_QUERY);
    case "leroymerlin":
      return withExtra(`https://www.leroymerlin.com.br/search?term=${q}`, process.env.AFFILIATE_LEROYMERLIN_QUERY);
  }
}

// Quais lojas aparecem pra cada tipo de item (material de obra x móvel/decoração).
export function storesForCategory(category: string): ArchitectStoreId[] {
  if (category === "movel" || category === "decoracao") return ["magalu", "mercadolivre", "amazon"];
  if (category === "servico") return [];
  return ["leroymerlin", "mercadolivre", "amazon"];
}

export function isStoreId(value: string): value is ArchitectStoreId {
  return ["amazon", "magalu", "mercadolivre", "leroymerlin"].includes(value);
}
