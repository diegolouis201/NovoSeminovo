import Link from "next/link";
import { Form } from "@/components/Form";
import { Cabecalho, Secao, Vazio } from "@/components/ui";
import { salvarAjustesProspeccao } from "@/lib/actions";
import { me } from "@/lib/crm";
import { dataHora } from "@/lib/format";
import { STATUS_SEQUENCIA, painelProspeccao } from "@/lib/prospeccao";

export const metadata = { title: "Sequências de prospecção" };

export default async function Prospeccao({ searchParams }: { searchParams: { etiqueta?: string } }) {
  const etiqueta = (searchParams.etiqueta ?? "").slice(0, 60);
  const sufixo = etiqueta ? `?etiqueta=${encodeURIComponent(etiqueta)}` : "";
  const [acesso, p] = await Promise.all([me(), painelProspeccao()]);
  const dono = acesso.permissions.includes("equipe");
  return (
    <>
      <Cabecalho
        titulo="Sequências de prospecção"
        subtitulo="E-mails para as empresas importadas do Mailerfind, enviados pelo contato@ do NovoSeminovo. Só sai depois que o dono aprova."
        acao={dono ? <Link className="btn-primary" href="/prospeccao/nova">Nova sequência</Link> : undefined}
      />
      {etiqueta ? <p className="mb-4 rounded-xl bg-blue/10 p-3 text-sm text-navy">Escolha a sequência abaixo para inscrever as empresas da etiqueta “{etiqueta}”.</p> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Secao titulo="Envio">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Remetente</dt><dd className="text-right font-semibold">{p.remetente ?? <span className="text-danger">SMTP não configurado (nada é enviado)</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Enviados hoje</dt><dd className="font-semibold">{p.enviadosHoje} de {p.ajustes.limiteDiario}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Situação</dt><dd className={`font-semibold ${p.ajustes.pausado ? "text-danger" : "text-green"}`}>{p.ajustes.pausado ? "Pausado (nenhum e-mail sai)" : "Ligado"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Horário</dt><dd>seg a sex, 9h às 17h (Brasília), 2 a 6 min entre e-mails</dd></div>
          </dl>
          {p.rotinaDesligada ? <p className="mt-3 text-xs text-orange">Rotina de envio desligada neste servidor (PROSPECCAO_DISABLED=1 ou teste).</p> : null}
        </Secao>
        {dono ? (
          <Secao titulo="Ajustes do envio (só o dono)">
            <Form action={salvarAjustesProspeccao} botao="Salvar ajustes" manter className="space-y-4">
              <div>
                <label className="label" htmlFor="limite">E-mails por dia (máximo 50)</label>
                <input id="limite" name="limite" type="number" min={1} max={50} required defaultValue={p.ajustes.limiteDiario} className="input max-w-[8rem]" aria-describedby="limite-ajuda" />
                <p id="limite-ajuda" className="mt-1 text-xs text-muted">Comece com 25: e-mail novo mandando muito no primeiro dia cai no spam.</p>
              </div>
              <span className="flex items-center gap-2 text-sm">
                <input id="pausado" name="pausado" type="checkbox" value="1" defaultChecked={p.ajustes.pausado} className="accent-blue" />
                <label htmlFor="pausado">Pausar todos os envios agora</label>
              </span>
            </Form>
          </Secao>
        ) : null}
      </div>
      <Secao titulo="Sequências">
        {p.sequencias.length ? (
          <div tabIndex={0} role="region" aria-label="Sequências" className="overflow-x-auto">
            <table className="tabela min-w-[640px]">
              <thead>
                <tr><th scope="col">Sequência</th><th scope="col">Situação</th><th scope="col">E-mails</th><th scope="col">Empresas</th><th scope="col">Aprovação</th></tr>
              </thead>
              <tbody>
                {p.sequencias.map((s) => {
                  const total = Object.values(s.inscritas).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={s.id}>
                      <td><Link className="link" href={`/prospeccao/${s.id}${sufixo}`}>{s.nome}</Link></td>
                      <td><span className={`pill ${STATUS_SEQUENCIA[s.status][1]}`}>{STATUS_SEQUENCIA[s.status][0]}</span></td>
                      <td>{s.passos.length}</td>
                      <td>{total}{s.inscritas.respondeu ? ` · ${s.inscritas.respondeu} responderam` : ""}</td>
                      <td className="text-xs text-muted">{s.aprovadaEm ? `${s.aprovadaPor ?? "—"}, ${dataHora(s.aprovadaEm)}` : "Não aprovada"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo="Nenhuma sequência ainda" />
        )}
      </Secao>
    </>
  );
}
