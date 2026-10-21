import { NotFoundContent } from "@/components/NotFoundContent";

export default function ListingNotFound() {
  return (
    <NotFoundContent
      title="Este anúncio não está mais disponível"
      message="Ele pode ter sido vendido ou retirado pelo anunciante. Veja outras opções parecidas — tem muita coisa boa no NovoSeminovo."
    />
  );
}
