import type { Metadata } from "next";
import { VerticalHome } from "@/components/VerticalHome";
import { IMOVEIS_DESCRIPTION, pageMetadata } from "@/lib/seo/metadata";

// Título sem o nome repetido: o template do layout já põe " | NovoSeminovo".
export const metadata: Metadata = pageMetadata({
  title: "Imóveis à venda e para alugar",
  description: IMOVEIS_DESCRIPTION,
  path: "/imoveis",
});

export default function ImoveisPage() {
  return <VerticalHome assetType="property" />;
}
