import type { Metadata } from "next";
import { VerticalHome } from "@/components/VerticalHome";

export const metadata: Metadata = {
  title: "Carros — NovoSeminovo",
  description: "Compre e venda carros com histórico, chat e simulação de financiamento.",
};

export default function CarrosPage() {
  return <VerticalHome assetType="vehicle" />;
}
