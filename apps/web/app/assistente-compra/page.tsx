import { VehicleProfileAssistant } from "@/components/VehicleProfileAssistant";

export default function AssistenteCompraPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Qual carro é ideal pra mim?</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Nem sempre o carro ideal é o mais potente ou o mais bonito — é o que cabe no seu orçamento sem
        comprometer o resto da sua vida financeira. Responde algumas perguntas rápidas e a gente te ajuda a
        decidir com a cabeça, não só com o coração.
      </p>

      <div className="mt-6">
        <VehicleProfileAssistant />
      </div>
    </main>
  );
}
