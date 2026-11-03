import { fetchNpsStatus } from "@/lib/api";
import { answerNpsAction } from "@/lib/actions/nps";

// Pesquisa NPS no painel do parceiro: aparece após 30 dias de cadastro e a
// cada 90 dias (a API decide). Resposta vai para o CRM.
export async function NpsCard({ accessToken, thanks }: { accessToken: string; thanks?: boolean }) {
  if (thanks) {
    return <p className="mb-6 rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">Obrigado pela resposta! Ela ajuda a gente a melhorar o NovoSeminovo.</p>;
  }
  const status = await fetchNpsStatus(accessToken);
  if (!status?.ask) return null;
  return (
    <section aria-label="Pesquisa de satisfação" className="mb-6 rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
      <h2 className="font-display text-lg font-semibold text-ink">De 0 a 10, quanto você recomendaria o NovoSeminovo a outra empresa?</h2>
      <form action={answerNpsAction} className="mt-3 flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Nota de 0 a 10</legend>
          {Array.from({ length: 11 }, (_, n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="score" value={n} required className="peer sr-only" />
              <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-border font-semibold text-ink peer-checked:border-brand-blue peer-checked:bg-brand-blue peer-checked:text-on-blue">
                {n}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-ink-muted">0 = não recomendaria · 10 = recomendaria com certeza</p>
        <textarea name="comment" rows={2} maxLength={1000} placeholder="O que podemos melhorar? (opcional)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink" />
        <button type="submit" className="self-start rounded-brand bg-brand-green px-4 py-2 font-bold text-on-green hover:opacity-90">
          Enviar resposta
        </button>
      </form>
    </section>
  );
}
