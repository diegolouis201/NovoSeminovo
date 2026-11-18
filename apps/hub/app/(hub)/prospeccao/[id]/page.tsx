import Link from "next/link";
import { notFound } from "next/navigation";
import { CAIXAS_EMAIL, PROSPECCAO_STATUS, segmentoLabel } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { InscreverForm } from "@/components/InscreverForm";
import { SequenciaEditor } from "@/components/SequenciaEditor";
import { Cabecalho, Secao, Vazio } from "@/components/ui";
import { HubApiError } from "@/lib/api";
import { aprovarSequencia, definirRemetenteSequencia, pausarSequencia, removerDaSequencia } from "@/lib/actions";
import { me } from "@/lib/crm";
import { dataHora } from "@/lib/format";
import { painelVendedores } from "@/lib/vendedores";
import { STATUS_SEQUENCIA, etiquetasProspeccao, sequenciaProspeccao } from "@/lib/prospeccao";

export const metadata = { title: "Sequência de prospecção" };

const COR: Record<string, string> = { agendado: "bg-blue/10 text-blue", enviando: "bg-blue/10 text-blue", concluido: "bg-line text-navy", respondeu: "bg-green/15 text-green", saiu: "bg-orange/15 text-danger", parou: "bg-line text-muted", erro: "bg-orange/15 text-danger" };

export default async function Sequencia({ params, searchParams }: { params: { id: string }; searchParams: { etiqueta?: string } }) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(params.id)) notFound();
  const acesso = await me();
  let d: Awaited<ReturnType<typeof sequenciaProspeccao>>;
  try {
    d = await sequenciaProspeccao(params.id);
  } catch (e) {
    if (e instanceof HubApiError && e.status === 404) notFound();
    throw e;
  }
  const etiquetas = await etiquetasProspeccao();
  const dono = acesso.permissions.includes("equipe");
  const vendedores = dono ? (await painelVendedores()).vendedores : [];
  const s = d.sequencia;
  return (
    <>
      <Link href="/prospeccao" className="text-sm font-semibold text-muted hover:text-blue">← Sequências</Link>
      <div className="mt-3">
        <Cabecalho titulo={s.nome} subtitulo={`${s.passos.length} e-mail(s) · ${s.aprovadaEm ? `aprovada por ${s.aprovadaPor ?? "—"} em ${dataHora(s.aprovadaEm)}` : "ainda não aprovada"}`} acao={<span className={`pill ${STATUS_SEQUENCIA[s.status][1]}`}>{STATUS_SEQUENCIA[s.status][0]}</span>} />
      </div>

      <p className="mb-4 text-sm text-navy">
        Remetente:{" "}
        <strong>{s.remetente ? `${s.remetente.nome}${s.remetente.endereco ? ` (${s.remetente.endereco})` : " (sem caixa)"}` : `sem vendedor: sai pelo ${CAIXAS_EMAIL.prospeccao.endereco} ou pela caixa do vendedor de cada empresa`}</strong>
      </p>

      {dono ? (
        <Secao titulo="Remetente (vendedor IA)" className="mb-6">
          <Form action={definirRemetenteSequencia} botao="Salvar remetente" manter>
            <input type="hidden" name="id" value={s.id} />
            <label className="label" htmlFor="vendedor-remetente">Quem manda os e-mails desta sequência</label>
            <select id="vendedor-remetente" name="vendedor" defaultValue={s.remetente?.vendedorId ?? ""} className="input" aria-describedby="remetente-ajuda">
              <option value="">Sem vendedor ({CAIXAS_EMAIL.prospeccao.endereco})</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}{v.caixaStatus ? ` (${v.caixaStatus.endereco})` : " (sem caixa)"}{v.ativo ? "" : " · inativo"}</option>
              ))}
            </select>
            <p id="remetente-ajuda" className="text-xs text-muted">Sai pela caixa do vendedor, com o nome dele; as respostas voltam para ele. Trocar não envia nada.</p>
          </Form>
        </Secao>
      ) : null}

      {dono ? (
        <Secao titulo={s.status === "ativa" ? "Ativa: enviando" : "Aprovar e ativar"} className="mb-6">
          {s.status === "ativa" ? (
            <Form action={pausarSequencia} botao="Pausar esta sequência" manter>
              <input type="hidden" name="id" value={s.id} />
              <p className="text-sm text-muted">Os e-mails saem sozinhos no horário comercial, respeitando o limite do dia. Pausar não apaga nada.</p>
            </Form>
          ) : (
            <Form action={aprovarSequencia} botao="Aprovar e ativar" manter>
              <input type="hidden" name="id" value={s.id} />
              <span className="flex items-start gap-2 text-sm">
                <input id="confirmo" name="confirmo" type="checkbox" value="1" required className="mt-1 accent-blue" />
                <label htmlFor="confirmo">Li a prévia dos {s.passos.length} e-mails abaixo e autorizo o envio para as empresas inscritas (seg a sex, 9h às 17h, até o limite do dia).</label>
              </span>
            </Form>
          )}
        </Secao>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Secao titulo={`Prévia (exemplo: ${d.exemplo})`}>
            <div className="space-y-5">
              {d.previa.map((e, i) => (
                <article key={i} className="rounded-xl border border-line">
                  <header className="border-b border-line bg-cream px-4 py-2 text-sm">
                    <p className="text-xs text-muted">{i + 1}º e-mail{i ? ` · ${s.passos[i]!.esperaDias} dia(s) depois` : " · dia da inscrição"}</p>
                    <p className="font-semibold text-navy">{e.assunto}</p>
                  </header>
                  <iframe title={`Prévia do ${i + 1}º e-mail`} sandbox="" srcDoc={e.html} className="h-[28rem] w-full bg-white" loading="eager" />
                </article>
              ))}
            </div>
          </Secao>
          {dono ? (
            <Secao titulo="Editar textos">
              <SequenciaEditor id={s.id} nome={s.nome} passos={s.passos} />
            </Secao>
          ) : null}
        </div>
        <div className="space-y-6">
          {dono ? (
            <Secao titulo="Inscrever empresas">
              {etiquetas.length ? <InscreverForm id={s.id} etiquetas={etiquetas} inicial={searchParams.etiqueta} /> : <p className="text-sm text-muted">Importe empresas do Mailerfind primeiro (<Link className="link" href="/empresas/importar">Importar empresas</Link>).</p>}
            </Secao>
          ) : null}
          <Secao titulo={`Empresas na sequência (${d.inscricoes.length})`}>
            {/* O formulário fica na tela mesmo quando a lista esvazia, para mostrar o resultado. */}
            {d.inscricoes.length || dono ? (
              <Lista inscricoes={d.inscricoes} podeTirar={dono} id={s.id} />
            ) : (
              <Vazio titulo="Nenhuma empresa inscrita" texto="Inscreva pela etiqueta ou pelo tipo de empresa." />
            )}
          </Secao>
        </div>
      </div>
    </>
  );
}

type Inscricao = Awaited<ReturnType<typeof sequenciaProspeccao>>["inscricoes"][number];

// Lista das empresas; o dono marca uma ou várias (só as que ainda vão
// receber e-mail) e tira da sequência. Nada é enviado.
function Lista({ inscricoes, podeTirar, id }: { inscricoes: Inscricao[]; podeTirar: boolean; id: string }) {
  const linhas = !inscricoes.length ? (
    <Vazio titulo="Nenhuma empresa inscrita" texto="Inscreva pela etiqueta ou pelo tipo de empresa." />
  ) : (
    <ul className="divide-y divide-line">
      {inscricoes.map((e) => {
        const ativa = e.status === "agendado" || e.status === "enviando";
        return (
          <li key={e.id} className="flex gap-3 py-2 text-sm">
            {podeTirar ? (
              <span className="pt-0.5">{ativa ? <input type="checkbox" id={`tirar-${e.id}`} name="card" value={e.cardId} className="accent-blue" aria-label={`Marcar ${e.empresa} para tirar da sequência`} /> : null}</span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link className="link" href={`/empresas/${e.cardId}`}>{e.empresa}</Link>
                  {e.segmento ? <span className="ml-2 text-xs text-muted">{segmentoLabel(e.segmento)}</span> : null}
                </span>
                <span className={`pill ${COR[e.status] ?? "bg-line text-muted"}`}>{e.status === "agendado" && e.passosEnviados ? `Enviado passo ${e.passosEnviados}` : PROSPECCAO_STATUS[e.status]}</span>
              </div>
              <p className="text-xs text-muted">
                {e.proximoEnvio ? `Próximo e-mail: ${dataHora(e.proximoEnvio)}` : e.status === "parou" && e.motivo ? e.motivo : e.ultimoEnvio ? `Último e-mail: ${dataHora(e.ultimoEnvio)}` : ""}
                {e.erro ? ` · ${e.erro}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
  if (!podeTirar) return linhas;
  return (
    <Form action={removerDaSequencia} botao="Tirar as marcadas da sequência" className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-muted">Marque uma ou várias empresas. Sai da sequência sem receber nada e fica livre para outra.</p>
      {linhas}
    </Form>
  );
}
