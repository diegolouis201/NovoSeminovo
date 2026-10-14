import type { Metadata } from "next";
import { VerticalHome } from "@/components/VerticalHome";

export const metadata: Metadata = {
  title: "Imóveis — NovoSeminovo",
  description: "Compre e venda imóveis com histórico, chat e simulação de financiamento.",
};

export default function ImoveisPage() {
  return <VerticalHome assetType="property" />;
}
