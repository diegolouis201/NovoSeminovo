import { Cabecalho, Secao } from "@/components/ui";
import { Form } from "@/components/Form";
import { NpsTeste } from "@/components/NpsTeste";
import { me } from "@/lib/crm";
import { dataHora } from "@/lib/format";
import { envioNps } from "@/lib/nps";
import { aprovarEnvioNps, pausarEnvioNps } from "@/lib/nps-actions";

export const metadata = { title: "Pesquisa NPS por e-mail" };

export default async function EnvioNps() {
  const [acesso, c] = await Promise.all([me(), envioNps()]);
  const dono = acesso.permissions.includes("equipe");
  const situacao = !c.aprovadoEm ? "Desligado" : c.pausadoEm ? "Pausado" : c.ligado ? "Ligado" : "Desligado";
  return (
    <>
      <Cabecalho titulo="Pesquisa NPS por e-mail" subtitulo="A cada 6 meses para lojas, imobiliárias e corretores com conta ativa, 1 lembrete 5 dias depois, de segunda a sexta das 9h às 18h. Sem prêmio por responder." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Secao titulo="Envio automático">
          <p className="mb-3 text-sm">
            Situação: <span className={`pill ${situacao === "Ligado" ? "bg-green/15 text-green" : "bg-orange/15 text-danger"}`}>{situacao}</span>
          </p>
          <dl className="mb-4 space-y-1 text-sm">
            <div><dt className="inline text-muted">Aprovado: </dt><dd className="inline">{c.aprovadoEm ? `${dataHora(c.aprovadoEm)}${c.aprovadoPor ? ` por ${c.aprovadoPor}` : ""}` : "ainda não"}</dd></div>
            {c.pausadoEm ? <div><dt className="inline text-muted">Pausado em: </dt><dd className="inline">{dataHora(c.pausadoEm)}</dd></div> : null}
            <div><dt className="inline text-muted">Limite por dia: </dt><dd className="inline">{c.limiteDiario} e-mails (no máximo 2 a cada 10 minutos)</dd></div>
            <div><dt className="inline text-muted">Enviados hoje: </dt><dd className="inline">{c.enviadosHoje}</dd></div>
            {c.motivoDesligado ? <div><dt className="inline text-muted">Agora: </dt><dd className="inline">{c.motivoDesligado}</dd></div> : null}
          </dl>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Nunca vai para empresa só da prospecção, para quem pediu para sair (lista de bloqueio, descadastro de e-mails, “não contatar” do Hub) nem para quem respondeu nos últimos 6 meses, no painel ou por e-mail.</li>
            <li>Sai pelo mesmo e-mail do site que manda os avisos da conta (não pelas caixas da prospecção).</li>
            <li>Nota de 0 a 6 com “Sim, quero contato” vira tarefa do Comercial para ligar em 2 dias úteis.</li>
          </ul>
          {dono ? (
            c.aprovadoEm ? (
              <Form action={pausarEnvioNps} botao={c.pausadoEm ? "Retomar envio automático" : "Pausar envio automático"} manter>
                <input type="hidden" name="pausado" value={c.pausadoEm ? "0" : "1"} />
              </Form>
            ) : (
              <Form action={aprovarEnvioNps} botao="Aprovar e ligar envio automático" manter>
                <p className="text-sm">Antes de aprovar, mande o e-mail de teste para você e confira o texto e os botões.</p>
              </Form>
            )
          ) : (
            <p className="text-sm text-muted">Só o dono aprova, pausa ou testa o envio.</p>
          )}
        </Secao>
        <Secao titulo="E-mail de teste">
          <p className="mb-3 text-sm">Manda o e-mail real para o seu endereço. A nota que você clicar não conta no NPS.</p>
          {dono ? <NpsTeste /> : <p className="text-sm text-muted">Só o dono pode mandar o e-mail de teste.</p>}
          {c.testes.length ? (
            <ul className="mt-4 divide-y divide-line text-sm">
              {c.testes.map((t) => (
                <li key={t.enviadoEm} className="py-2">Teste de {dataHora(t.enviadoEm)} · {t.nota !== undefined ? `clicou ${t.nota}` : "sem clique"}</li>
              ))}
            </ul>
          ) : null}
        </Secao>
      </div>
    </>
  );
}
