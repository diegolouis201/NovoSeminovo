import Link from "next/link";
import { Car, House } from "@phosphor-icons/react/dist/ssr";
import { PropertyProfileAssistant } from "@/components/PropertyProfileAssistant";
import { VehicleProfileAssistant } from "@/components/VehicleProfileAssistant";

const COPY = {
  vehicle: {
    title: "Qual carro é ideal pra mim?",
    description:
      "Nem sempre o carro ideal é o mais potente ou o mais bonito — é o que cabe no seu orçamento sem comprometer o resto da sua vida financeira. Responde algumas perguntas rápidas e a gente te ajuda a decidir com a cabeça, não só com o coração.",
  },
  property: {
    title: "Qual imóvel é ideal pra mim?",
    description:
      "O imóvel ideal nem sempre é o maior — às vezes vale abrir mão de espaço por uma localização melhor, perto do trabalho, com menos trânsito. Responde algumas perguntas rápidas sobre sua situação financeira e a gente te ajuda a decidir.",
  },
} as const;

export default function AssistenteCompraPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const assetType = searchParams.tipo === "property" ? "property" : "vehicle";
  const copy = COPY[assetType];

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{copy.title}</h1>
      <p className="mt-1 text-sm text-ink-muted">{copy.description}</p>

      <nav className="mt-6 inline-flex gap-1 rounded-full bg-surface-sober p-1">
        <Link
          href="/assistente-compra?tipo=vehicle"
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
            assetType === "vehicle" ? "bg-brand-green text-on-green" : "text-ink"
          }`}
        >
          <Car size={18} weight="bold" /> Carro
        </Link>
        <Link
          href="/assistente-compra?tipo=property"
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
            assetType === "property" ? "bg-brand-green text-on-green" : "text-ink"
          }`}
        >
          <House size={18} weight="bold" /> Imóvel
        </Link>
      </nav>

      <div className="mt-6">
        {assetType === "vehicle" ? <VehicleProfileAssistant /> : <PropertyProfileAssistant />}
      </div>
    </main>
  );
}
