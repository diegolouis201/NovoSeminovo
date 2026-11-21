import type { Metadata } from "next";
import { VerticalHome } from "@/components/VerticalHome";
import { CARROS_DESCRIPTION, pageMetadata } from "@/lib/seo/metadata";

// Título sem o nome repetido: o template do layout já põe " | NovoSeminovo".
export const metadata: Metadata = pageMetadata({
  title: "Carros seminovos e usados à venda",
  description: CARROS_DESCRIPTION,
  path: "/carros",
});

export default function CarrosPage() {
  return <VerticalHome assetType="vehicle" />;
}
