import type { ProspeccaoPasso } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { salvarSequencia } from "@/lib/actions";

// Até 3 e-mails. Do 2º em diante, assunto vazio = continua a conversa
// ("Re: assunto do 1º"). Placeholders: {{empresa}} e {{cidade}}.
export function SequenciaEditor({ id, nome, passos }: { id?: string; nome: string; passos: ProspeccaoPasso[] }) {
  return (
    <Form action={salvarSequencia} botao={id ? "Salvar (volta para rascunho)" : "Criar sequência"} manter className="space-y-5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div>
        <label className="label" htmlFor="nome">Nome da sequência</label>
        <input id="nome" name="nome" required maxLength={80} defaultValue={nome} className="input" />
      </div>
      <p className="text-xs text-muted">Use <code>{"{{empresa}}"}</code> (nome da empresa) e <code>{"{{cidade}}"}</code>. Links só com https://. O rodapé legal com o link de saída entra sozinho em todo e-mail.</p>
      {[0, 1, 2].map((i) => {
        const p = passos[i];
        return (
          <fieldset key={i} className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-navy">{i + 1}º e-mail{i ? " (opcional)" : ""}</legend>
            {i ? (
              <div>
                <label className="label" htmlFor={`espera${i}`}>Esperar (dias depois do anterior)</label>
                <input id={`espera${i}`} name={`espera${i}`} type="number" min={1} max={30} defaultValue={p?.esperaDias ?? (i === 1 ? 3 : 4)} className="input max-w-[8rem]" />
              </div>
            ) : null}
            <div>
              <label className="label" htmlFor={`assunto${i}`}>Assunto{i ? " (vazio = responde no mesmo assunto)" : ""}</label>
              <input id={`assunto${i}`} name={`assunto${i}`} maxLength={150} required={i === 0} defaultValue={p?.assunto ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor={`corpo${i}`}>Texto</label>
              <textarea id={`corpo${i}`} name={`corpo${i}`} required={i === 0} maxLength={5000} rows={i ? 6 : 12} defaultValue={p?.corpo ?? ""} className="input font-mono text-[13px]" />
            </div>
          </fieldset>
        );
      })}
    </Form>
  );
}
