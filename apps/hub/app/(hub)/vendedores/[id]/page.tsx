import Link from "next/link";
import { notFound } from "next/navigation";
import { ETAPAS_SUGERIDAS, OBJECOES, RASCUNHO_STATUS, VENDEDOR_AUTONOMIA, VENDEDOR_SEGMENTOS } from "@novoseminovo/shared-types";
import { Barras, Situacao } from "@/components/Barras";
import { Form } from "@/components/Form";
import { Cabecalho, Kpi, Secao, Vazio } from "@/components/ui";
import { ajustarVendedor } from "@/lib/actions";
import { HubApiError } from "@/lib/api";
import { me } from "@/lib/crm";
import { brl, dataHora } from "@/lib/format";
import { detalheVendedor, horas, pct } from "@/lib/vendedores";

export const metadata = { title: "Vendedor IA" };

export default async function Vendedor({ params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(params.id)) notFound();
  const acesso = await me();
  let d;
  try {
    d = await detalheVendedor(params.id);
  } catch (e) {
    if (e instanceof HubApiError && e.status === 404) notFound();
    throw e;
  }
  const v = d.vendedor;
  const n = v.numeros;
  const dono = acesso.permissions.includes("equipe");
  return (
    <>
      <Cabecalho titulo={v.nome} subtitulo={`${v.titulo} · ${VENDEDOR_AUTONOMIA[v.autonomia]}`} acao={<div className="flex flex-wrap items-center gap-2"><Situacao v={v} />{dono && n.aprovacoesPendentes ? <Link className="btn-primary" href={`/vendedores/respostas?vendedor=${v.id}`}>Aprovar respostas ({n.aprovacoesPendentes})</Link> : null}</div>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={n.fila} rotulo="Na fila (ainda sem 1º e-mail)" />
        <Kpi valor={n.contatadosHoje} rotulo="Contatadas hoje" detalhe={`${n.contatados7d} em 7 dias · ${n.contatados30d} em 30 dias`} />
        <Kpi valor={n.respostas} rotulo="Responderam" detalhe={`taxa de resposta ${pct(n.taxaResposta)}`} />
        <Kpi valor={n.emNegociacao} rotulo="Em negociação" />
        <Kpi valor={n.ganhos} rotulo="Ganhos (cadastraram)" tom="green" detalhe={`conversão ${pct(n.conversao)}`} />
        <Kpi valor={n.aprovacoesPendentes} rotulo="Esperando aprovação" tom={n.aprovacoesPendentes ? "orange" : "navy"} />
        <Kpi valor={horas(n.tempoMedioRespostaHoras)} rotulo="Tempo médio de resposta" detalhe="da chegada do e-mail ao envio" />
        <Kpi valor={brl(n.custoIaHojeBrl)} rotulo="Custo de IA hoje" detalhe={`${brl(n.custoIaMesBrl)} no mês`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Perdidas por motivo">
          <Barras rotulo="Empresas perdidas por motivo" itens={n.perdidos.map((x) => ({ nome: x.motivo, valor: x.quantidade }))} vazio="Nenhuma empresa perdida ainda." />
        </Secao>
        <Secao titulo="Objeções mais comuns">
          <Barras rotulo="Objeções mais comuns" itens={n.objecoes.slice(0, 8).map((x) => ({ nome: x.objecao, valor: x.quantidade }))} vazio="Nenhuma objeção registrada ainda." />
        </Secao>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Sequência e limites">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Primeira abordagem</dt><dd className="text-right font-semibold">{v.sequencia ? <Link className="link" href={`/prospeccao/${v.sequencia.id}`}>{v.sequencia.nome}</Link> : "—"}{v.sequencia ? <span className={`ml-2 pill ${v.sequencia.aprovada ? "bg-green/15 text-green" : "bg-orange/15 text-danger"}`}>{v.sequencia.aprovada ? "Aprovada e ativa" : "Esperando sua aprovação"}</span> : null}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Caixa de e-mail</dt><dd className="text-right font-semibold">{v.caixaStatus ? `${v.caixaStatus.endereco} · ${v.caixaStatus.configurada ? "configurada" : `não configurada (${v.caixaStatus.motivo ?? "ver DEPLOY.md"})`}` : "sem caixa"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Atende</dt><dd className="text-right font-semibold">{v.segmentos.length ? v.segmentos.map((x) => VENDEDOR_SEGMENTOS[x]).join(", ") : "Todos os tipos"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Assinatura</dt><dd className="text-right font-semibold">{v.assinatura}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">E-mails hoje</dt><dd className="font-semibold">{n.emailsHoje} de {v.limiteEmailsDia}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Rascunhos de IA hoje</dt><dd className="font-semibold">{n.rascunhosHoje} de {v.limiteRascunhosDia}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">No ar desde</dt><dd className="font-semibold">{v.noArDesde ? dataHora(v.noArDesde) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Modo automático</dt><dd className="font-semibold">{v.podeAutomatico ? "Já pode ser ligado" : `Liberado em ${v.diasParaAutomatico} dia(s)`}</dd></div>
          </dl>
        </Secao>
        {dono ? (
          <Secao titulo="Ajustes (só o dono)">
            <Form action={ajustarVendedor} botao="Salvar ajustes" manter className="space-y-4">
              <input type="hidden" name="id" value={v.id} />
              <fieldset className="space-y-1">
                <legend className="label">Situação</legend>
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" id="at-sim" name="ativo" value="sim" defaultChecked={v.ativo} className="accent-blue" aria-describedby="ativo-ajuda" />
                  <label htmlFor="at-sim">Ativo: aborda empresas e responde</label>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" id="at-nao" name="ativo" value="nao" defaultChecked={!v.ativo} className="accent-blue" />
                  <label htmlFor="at-nao">Inativo</label>
                </span>
                <p id="ativo-ajuda" className="text-xs text-muted">Para ativar: caixa de e-mail configurada no servidor, caixa sem outro vendedor ativo e a primeira abordagem aprovada em Sequências de prospecção.</p>
              </fieldset>
              <fieldset className="space-y-1" aria-describedby="caixa-ajuda">
                <legend className="label">Caixa de e-mail</legend>
                {d.caixas.map((c) => {
                  const deOutro = c.vendedorAtivoId && c.vendedorAtivoId !== v.id ? c.vendedorAtivo : undefined;
                  const situacao = c.configurada ? "configurada" : `não configurada (${c.motivo ?? "ver DEPLOY.md"})`;
                  return (
                    <span key={c.chave} className="flex items-start gap-2 text-sm">
                      <input type="radio" id={`caixa-${c.chave}`} name="caixa" value={c.chave} defaultChecked={v.caixa === c.chave} disabled={Boolean(deOutro)} className="mt-1 accent-blue" />
                      <label htmlFor={`caixa-${c.chave}`} className={deOutro ? "text-muted" : undefined}>
                        <span className="font-semibold">{c.endereco}</span> · {situacao}
                        {deOutro ? ` · em uso por ${deOutro}` : ""}
                      </label>
                    </span>
                  );
                })}
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" id="caixa-nenhuma" name="caixa" value="" defaultChecked={!v.caixa} className="accent-blue" />
                  <label htmlFor="caixa-nenhuma">Sem caixa</label>
                </span>
                <p id="caixa-ajuda" className="text-xs text-muted">É o remetente dos e-mails de {v.nome}. Caixa em uso por outro vendedor ativo não pode ser escolhida. Caixa não configurada pode ser escolhida, mas {v.nome} só ativa depois que ela estiver configurada no servidor.</p>
              </fieldset>
              <fieldset className="space-y-1">
                <legend className="label">Tipos de empresa que atende</legend>
                <input type="hidden" name="temSegmentos" value="1" />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {(Object.keys(VENDEDOR_SEGMENTOS) as (keyof typeof VENDEDOR_SEGMENTOS)[]).map((k) => (
                    <span key={k} className="flex items-center gap-2">
                      <input type="checkbox" id={`seg-${k}`} name="segmentos" value={k} defaultChecked={v.segmentos.includes(k)} className="accent-blue" />
                      <label htmlFor={`seg-${k}`}>{VENDEDOR_SEGMENTOS[k]}</label>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted">Nenhum marcado = atende todos. As empresas de cada tipo só vão para quem atende aquele tipo.</p>
              </fieldset>
              <div>
                <label className="label" htmlFor="assinatura">Assinatura dos e-mails</label>
                <input id="assinatura" name="assinatura" type="text" maxLength={120} defaultValue={v.assinatura} className="input" aria-describedby="assinatura-ajuda" autoComplete="off" />
                <p id="assinatura-ajuda" className="mt-1 text-xs text-muted">Uma linha, com o nome “{v.nome}” e a palavra “assistente” (ninguém pode achar que é uma pessoa). Sem link nem e-mail. Em branco volta ao padrão.</p>
              </div>
              <fieldset className="space-y-1">
                <legend className="label">Respostas</legend>
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" id="m-sup" name="autonomia" value="supervisionado" defaultChecked={v.autonomia === "supervisionado"} className="accent-blue" />
                  <label htmlFor="m-sup">Supervisionado: eu aprovo cada resposta</label>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" id="m-auto" name="autonomia" value="automatico" defaultChecked={v.autonomia === "automatico"} disabled={!v.podeAutomatico && v.autonomia !== "automatico"} className="accent-blue" aria-describedby="m-auto-ajuda" />
                  <label htmlFor="m-auto">Automático: respostas de rotina saem sozinhas</label>
                </span>
                <p id="m-auto-ajuda" className="text-xs text-muted">Desconto, reclamação, LGPD, financiamento, ligação e casos fora do roteiro continuam vindo para você. {v.podeAutomatico ? "" : `Liberado depois de 14 dias no ar (faltam ${v.diasParaAutomatico}).`}</p>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="emails">E-mails por dia (1 a 50)</label>
                  <input id="emails" name="emails" type="number" inputMode="numeric" min={1} max={50} defaultValue={v.limiteEmailsDia} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="rascunhos">Rascunhos de IA por dia (1 a 200)</label>
                  <input id="rascunhos" name="rascunhos" type="number" inputMode="numeric" min={1} max={200} defaultValue={v.limiteRascunhosDia} className="input" />
                </div>
              </div>
              <span className="flex items-center gap-2 text-sm">
                <input id="pausado" name="pausado" type="checkbox" value="1" defaultChecked={v.pausado} className="accent-blue" />
                <label htmlFor="pausado">Pausar {v.nome} (nada de rascunho nem envio)</label>
              </span>
            </Form>
          </Secao>
        ) : null}
      </div>

      <Secao titulo="Últimas respostas decididas" className="mt-6">
        {d.recentes.length ? (
          <div tabIndex={0} role="region" aria-labelledby="recentes-legenda" className="overflow-x-auto">
            <table className="tabela min-w-[720px]">
              <caption id="recentes-legenda" className="sr-only">Últimas respostas decididas de {v.nome}</caption>
              <thead><tr><th scope="col">Empresa</th><th scope="col">Situação</th><th scope="col">Objeção</th><th scope="col">Etapa sugerida</th><th scope="col">Quando</th></tr></thead>
              <tbody>
                {d.recentes.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="font-semibold"><Link className="link" href={`/empresas/${r.empresa.id}`}>{r.empresa.nome}</Link></th>
                    <td>{RASCUNHO_STATUS[r.status]}</td>
                    <td>{OBJECOES[r.objecao] ?? r.objecao}</td>
                    <td>{ETAPAS_SUGERIDAS[r.etapaSugerida] ?? r.etapaSugerida}</td>
                    <td>{dataHora(r.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo="Nenhuma resposta decidida ainda" texto="Respostas enviadas, rejeitadas e com erro aparecem aqui." />
        )}
      </Secao>
    </>
  );
}
