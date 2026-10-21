import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

export default function NotFound() {
  return (
    <NotFoundContent
      title="Não encontramos esta página"
      message="O endereço pode estar errado ou a página foi removida. Que tal procurar o que você precisa?"
    />
  );
}
