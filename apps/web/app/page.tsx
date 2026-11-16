import type { Metadata } from "next";
import { VerticalHome } from "@/components/VerticalHome";

// Título e descrição vêm do layout; aqui só o endereço canônico (no layout ele
// valeria para toda página sem canônico próprio).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return <VerticalHome />;
}
