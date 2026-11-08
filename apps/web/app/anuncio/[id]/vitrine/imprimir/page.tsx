import { notFound } from "next/navigation";
import { Imprimir } from "./Imprimir";

export const metadata = { title: "Imprimir cartaz — NovoSeminovo", robots: { index: false } };

// Só o cartaz, em uma folha A4, e a janela de impressão abre sozinha.
export default function ImprimirPage({ params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(params.id)) notFound();
  return <Imprimir src={`/anuncio/${params.id}/vitrine/cartaz`} />;
}
