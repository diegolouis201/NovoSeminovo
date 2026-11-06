import Link from "next/link";
import { notFound } from "next/navigation";
import { HUB_TASK_KINDS, INTERACTION_KINDS, LOSS_CATEGORIES, NEXT_CONTACT_KINDS } from "@novoseminovo/shared-types";
import { Contato } from "@/components/Contato";
import { Form } from "@/components/Form";
import { ListaTarefas } from "@/components/Tarefas";
import { Etapa } from "@/components/ui";
import { HubApiError, hubFetch } from "@/lib/api";
import { marcar, marcarContato, moverEtapa, novaTarefa, registrarAtividade } from "@/lib/actions";
import { acharFicha, feed, hoje, marcacoes, me, tarefas } from "@/lib/crm";
import { brl, data, dataHora } from "@/lib/format";

type Nota = { id: string; kind: string; body: string; authorName?: string; createdAt: string };
type Detalhe = { notes: Nota[]; tickets: { id: string; subject: string; channel: string; status: string; resolution?: string; openedAt: string; resolvedAt?: string }[] };
const ABAS = [
  ["resumo", "Resumo"],
  ["atividades", "Atividades"],
  ["tarefas", "Tarefas"],
  ["plano", "Plano e uso"],
  ["posvenda", "NPS e chamados"],
  ["marcacoes", "Marcações"],
] as const;
const TIPO_NOTA: Record<string, string> = { ...INTERACTION_KINDS, stage: "Mudança de etapa", contact: "Próximo contato" };

function Linha({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v ?? "—"}</dd>
    </div>
  );
}

export default async function Ficha({ params, searchParams }: { params: { id: string }; searchParams: { aba?: string } }) {
  const [access, f, m] = await Promise.all([me(), feed(), marcacoes()]);
  const ficha = acharFicha(f, params.id);
  if (!ficha) notFound();
  const { empresa: e, card: p } = ficha;
  const aba = ABAS.some(([k]) => k === searchParams.aba) ? searchParams.aba! : "resumo";
  const pode = access.permissions.includes("crm.editar");
  const marca = (ficha.empresaId && m[ficha.empresaId]) || (ficha.cardId && m[ficha.cardId]) || undefined;
  const chaveMarca = ficha.cardId ?? ficha.empresaId!;
  const [abertas, feitas] = await Promise.all([ficha.cardId ? tarefas("abertas", ficha.cardId) : [], ficha.cardId ? tarefas("concluidas", ficha.cardId) : []]);
  let detalhe: Detalhe | null = null;
  if (ficha.cardId) {
    try {
      detalhe = await hubFetch<Detalhe>(`/sales/prospects/${ficha.cardId}`);
    } catch (err) {
      if (!(err instanceof HubApiError)) throw err;
    }
  }
  const etapa = e?.etapa ?? p!.etapa;
  const contato = e ? { nome: e.responsavel.nome, cargo: e.responsavel.cargo, telefone: e.responsavel.telefone, email: e.responsavel.email } : { nome: p!.contato, cargo: p!.cargo, telefone: p!.telefone, email: p!.email };
  const h = hoje();
  const dados = {
    responsavel: contato.nome,
    empresa: ficha.nome,
    cidade: e?.cidade ?? p?.cidade,
    seunome: access.name.split(" ")[0],
    fimgratis: e && !e.plano ? data(e.periodoGratisAte) : undefined,
    leadsparados: e?.leads.paradosMais3Dias || undefined,
    link: e ? `https://novoseminovo.com.br${e.pagina}` : undefined,
  };
  const manual = !e;
  const hojeIso = h.toISOString().slice(0, 10);

  return (
    <>
      <Link href="/empresas" className="text-sm font-semibold text-muted hover:text-blue">← Empresas</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="h1">
            {marca?.importante ? "⭐ " : ""}
            {ficha.nome}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Etapa nome={etapa.nome} />
            {e?.plano ? <span>{e.plano.nome} · {brl(e.plano.valorMensal)}/mês</span> : null}
            <span>· {(e?.vendedor ?? p?.vendedor) ? `Vendedor: ${e?.vendedor ?? p?.vendedor}` : "Sem vendedor"}</span>
            {marca?.naoContatar ? <span className="pill bg-orange/15 text-danger">Não contatar</span> : null}
            {(marca?.tags ?? []).map((t) => (
              <span key={t} className="pill bg-line text-navy">{t}</span>
            ))}
          </div>
        </div>
        {e ? (
          <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://novoseminovo.com.br${e.pagina}`}>Ver no site</a>
        ) : null}
      </div>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {ABAS.map(([k, label]) => (
          <Link key={k} href={`?aba=${k}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${aba === k ? "border-blue text-blue" : "border-transparent text-muted hover:text-navy"}`}>
            {label}
            {k === "tarefas" && abertas.length ? ` (${abertas.length})` : ""}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {aba === "resumo" ? (
            <>
              <section className="card">
                <h2 className="h2 mb-3">Contato</h2>
                <p className="font-semibold">{contato.nome ?? "—"}{contato.cargo ? ` · ${contato.cargo}` : ""}</p>
                <p className="mb-4 text-sm text-muted">{[contato.telefone, contato.email].filter(Boolean).join(" · ") || "Sem telefone nem e-mail"}</p>
                <Contato telefone={contato.telefone} email={contato.email} dados={dados} segmento={e?.segmento ?? p?.segmento} naoContatar={Boolean(marca?.naoContatar)} contaEmail={access.email} card={pode ? ficha.cardId : undefined} />
              </section>
              {pode && ficha.cardId ? (
                <section className="card">
                  <h2 className="h2 mb-3">Registrar atividade</h2>
                  <Form action={registrarAtividade} botao="Registrar">
                    <input type="hidden" name="card" value={ficha.cardId} />
                    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                      <select name="tipo" className="input" defaultValue="ligacao" aria-label="Tipo">
                        {Object.entries(INTERACTION_KINDS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <textarea name="texto" required maxLength={2000} rows={3} className="input" placeholder="O que foi conversado? Dores, objeções, próximos passos..." />
                    </div>
                  </Form>
                </section>
              ) : null}
              <section className="card">
                <h2 className="h2 mb-3">Últimas atividades</h2>
                <Atividades notas={(detalhe?.notes ?? (e?.ultimasAnotacoes ?? []).map((n, i) => ({ id: String(i), kind: n.tipo, body: n.texto, authorName: n.autor, createdAt: n.data }))).slice(0, 6)} />
                {ficha.cardId ? <Link className="link mt-3 inline-block text-sm" href="?aba=atividades">Ver todas</Link> : null}
              </section>
            </>
          ) : null}

          {aba === "atividades" ? (
            <section className="card">
              <h2 className="h2 mb-3">Todas as atividades</h2>
              <Atividades notas={detalhe?.notes ?? []} />
            </section>
          ) : null}

          {aba === "tarefas" ? (
            <>
              <section className="card">
                <h2 className="h2 mb-3">Tarefas abertas</h2>
                <ListaTarefas itens={abertas} podeEditar={pode} />
              </section>
              <section className="card">
                <h2 className="h2 mb-3">Concluídas</h2>
                <ListaTarefas itens={feitas} podeEditar={false} vazio="Nenhuma tarefa concluída." />
              </section>
            </>
          ) : null}

          {aba === "plano" ? (
            e ? (
              <section className="card">
                <h2 className="h2 mb-3">Plano, pagamentos e uso do site</h2>
                <dl>
                  <Linha k="Plano" v={e.plano ? `${e.plano.nome} · ${brl(e.plano.valorMensal)}/mês · ${e.plano.status === "ativa" ? "ativo" : e.plano.status === "em_atraso" ? "pagamento atrasado" : "cancelado"}` : "Sem plano"} />
                  {e.plano ? <Linha k="Período atual até" v={data(e.plano.periodoAte)} /> : <Linha k="Período grátis até" v={data(e.periodoGratisAte)} />}
                  <Linha k="Pagamentos" v={`${e.pagamentos.quantidade} · total ${brl(e.pagamentos.totalPago)}${e.pagamentos.ticketMedio ? ` · ticket médio ${brl(e.pagamentos.ticketMedio)}` : ""}`} />
                  <Linha k="Primeiro / último" v={`${data(e.pagamentos.primeiro)} / ${data(e.pagamentos.ultimo)}`} />
                  <Linha k="Anúncios" v={`${e.anuncios.noAr} no ar de ${e.anuncios.total}`} />
                  <Linha k="Leads" v={`${e.leads.total} no total · ${e.leads.ultimos30Dias} em 30 dias · ${e.leads.vendidos} vendidos · ${e.leads.paradosMais3Dias} parados há 3+ dias`} />
                  <Linha k="Visualizações" v={e.uso.visualizacoes.toLocaleString("pt-BR")} />
                  <Linha k="Último acesso" v={e.uso.ultimoAcesso ? `${dataHora(e.uso.ultimoAcesso)}${e.uso.diasSemAcesso ? ` (${e.uso.diasSemAcesso} dias)` : ""}` : "—"} />
                </dl>
              </section>
            ) : (
              <section className="card text-sm text-muted">Ainda não se cadastrou no site.</section>
            )
          ) : null}

          {aba === "posvenda" ? (
            <section className="card">
              <h2 className="h2 mb-3">NPS e chamados</h2>
              <dl>
                <Linha k="Última nota NPS" v={e?.nps ? `${e.nps.nota} (${e.nps.classificacao}) em ${data(e.nps.data)}${e.nps.comentario ? ` — “${e.nps.comentario}”` : ""}` : "Ainda não respondeu"} />
                <Linha k="Chamados" v={e ? `${e.chamados.total} no total · ${e.chamados.abertos} abertos${e.chamados.tempoMedioResolucaoHoras !== undefined ? ` · resolve em ${e.chamados.tempoMedioResolucaoHoras} h em média` : ""}` : "—"} />
              </dl>
              {detalhe?.tickets.length ? (
                <ul className="mt-4 divide-y divide-line">
                  {detalhe.tickets.map((t) => (
                    <li key={t.id} className="py-2 text-sm">
                      <span className={`pill mr-2 ${t.status === "aberto" ? "bg-orange/15 text-danger" : "bg-green/15 text-green"}`}>{t.status}</span>
                      <b>{t.subject}</b> · {t.channel} · {dataHora(t.openedAt)}
                      {t.resolution ? <p className="text-muted">{t.resolution}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {ficha.cardId ? <p className="mt-4 text-sm text-muted">Abrir ou resolver chamado: na ficha do Comercial (<a className="link" target="_blank" rel="noopener noreferrer" href={`https://novoseminovo.com.br/comercial/${ficha.cardId}`}>abrir</a>).</p> : null}
            </section>
          ) : null}

          {aba === "marcacoes" ? (
            <section className="card">
              <h2 className="h2 mb-3">Marcações</h2>
              {pode ? (
                <Form action={marcar} botao="Salvar marcações" manter>
                  <input type="hidden" name="chave" value={chaveMarca} />
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="importante" defaultChecked={marca?.importante} /> Importante</label>
                  <input name="motivoImportante" defaultValue={marca?.motivoImportante} maxLength={300} className="input" placeholder="Por que é importante? (opcional)" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-danger"><input type="checkbox" name="naoContatar" defaultChecked={marca?.naoContatar} /> Não contatar (pediu para não receber contato — LGPD)</label>
                  <input name="motivoNaoContatar" defaultValue={marca?.motivoNaoContatar} maxLength={300} className="input" placeholder="Como pediu? (ex.: por e-mail em 05/11)" />
                  <div>
                    <label className="label" htmlFor="tags">Tags (separadas por vírgula)</label>
                    <input id="tags" name="tags" defaultValue={(marca?.tags ?? []).join(", ")} maxLength={600} className="input" placeholder="feirão, indicação, teste" />
                  </div>
                  <div>
                    <label className="label" htmlFor="nota">Nota interna</label>
                    <textarea id="nota" name="nota" defaultValue={marca?.nota} maxLength={2000} rows={3} className="input" />
                  </div>
                </Form>
              ) : (
                <p className="text-sm text-muted">{marca ? `Importante: ${marca.importante ? "sim" : "não"} · Não contatar: ${marca.naoContatar ? "sim" : "não"} · Tags: ${(marca.tags ?? []).join(", ") || "—"}` : "Sem marcações."}</p>
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          {pode && ficha.cardId ? (
            <section className="card" id="agendar">
              <h2 className="h2 mb-1">Próximo passo</h2>
              <p className="mb-3 text-sm text-muted">
                {(e?.proximoContato ?? p?.proximoContato) ? `Marcado: ${dataHora(e?.proximoContato ?? p?.proximoContato)}${(e?.proximoContatoTipo ?? p?.proximoContatoTipo) ? ` (${NEXT_CONTACT_KINDS[(e?.proximoContatoTipo ?? p?.proximoContatoTipo) as keyof typeof NEXT_CONTACT_KINDS] ?? ""})` : ""}` : "Nenhum contato marcado."}
              </p>
              <Form action={marcarContato} botao="Marcar contato">
                <input type="hidden" name="card" value={ficha.cardId} />
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input type="date" name="dia" min={hojeIso} className="input" aria-label="Dia" />
                  <input type="time" name="hora" defaultValue="10:00" className="input" aria-label="Hora" />
                </div>
                <select name="tipo" className="input" aria-label="Tipo de contato">
                  {Object.entries(NEXT_CONTACT_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Form>
              <hr className="my-4 border-line" />
              <h3 className="mb-2 text-sm font-semibold text-navy">Nova tarefa</h3>
              <Form action={novaTarefa} botao="Criar tarefa">
                <input type="hidden" name="card" value={ficha.cardId} />
                <input name="titulo" required maxLength={200} className="input" placeholder="Ex.: enviar proposta do plano" />
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input type="date" name="dia" required min={hojeIso} className="input" aria-label="Dia da tarefa" />
                  <input type="time" name="hora" defaultValue="09:00" className="input" aria-label="Hora da tarefa" />
                </div>
                <select name="tipo" className="input" aria-label="Tipo da tarefa" defaultValue="tarefa">
                  {Object.entries(HUB_TASK_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Form>
            </section>
          ) : null}

          {pode && manual && ficha.cardId ? (
            <section className="card">
              <h2 className="h2 mb-3">Etapa</h2>
              <Form action={moverEtapa} botao="Mudar etapa">
                <input type="hidden" name="card" value={ficha.cardId} />
                <select name="etapa" className="input" defaultValue={etapa.id} aria-label="Etapa">
                  <option value="a_abordar">A abordar</option>
                  <option value="em_contato">Em contato</option>
                  <option value="interessada">Interessada</option>
                  <option value="proposta">Proposta enviada</option>
                  <option value="perdida">Perdida</option>
                </select>
                <select name="categoria" className="input" defaultValue="" aria-label="Motivo da perda">
                  <option value="">Motivo (se perdida)</option>
                  {Object.entries(LOSS_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input name="motivo" maxLength={500} className="input" placeholder="Detalhe do motivo (opcional)" />
              </Form>
              <p className="mt-2 text-xs text-muted">Depois que a empresa se cadastra no site, a etapa anda sozinha.</p>
            </section>
          ) : null}

          <section className="card">
            <h2 className="h2 mb-3">Cadastro</h2>
            <dl>
              {e ? (
                <>
                  <Linha k="Razão social" v={e.nome} />
                  <Linha k="CNPJ" v={e.cnpj} />
                  <Linha k="Tipo" v={e.tipo} />
                  <Linha k="Cidade" v={[e.cidade, e.uf].filter(Boolean).join("/")} />
                  <Linha k="Setor" v={e.setor} />
                  <Linha k="Porte" v={e.porte} />
                  <Linha k="Capital social" v={e.capitalSocial ? brl(e.capitalSocial) : undefined} />
                  <Linha k="Aberta em" v={data(e.abertaEm)} />
                  <Linha k="Cliente desde" v={data(e.cadastroNoSiteEm)} />
                  <Linha k="Funcionários" v={e.perfil.funcionarios} />
                  <Linha k="Faturamento" v={e.perfil.faturamento} />
                  <Linha k="Origem" v={e.origemMarketing ? [e.origemMarketing.canal, e.origemMarketing.meio, e.origemMarketing.campanha].filter(Boolean).join(" · ") : e.origem} />
                  <Linha k="Instagram" v={e.redesSociais.instagram ? `@${e.redesSociais.instagram}` : undefined} />
                  <Linha k="Sócios" v={e.socios.length ? e.socios.map((s) => `${s.nome}${s.aniversario ? ` (aniv. ${s.aniversario})` : ""}`).join("; ") : undefined} />
                </>
              ) : (
                <>
                  <Linha k="Segmento" v={p!.segmento === "property" ? "Imóveis" : "Veículos"} />
                  <Linha k="Cidade" v={[p!.cidade, p!.uf].filter(Boolean).join("/")} />
                  <Linha k="Funcionários" v={p!.perfil.funcionarios} />
                  <Linha k="Faturamento" v={p!.perfil.faturamento} />
                  <Linha k="No funil desde" v={data(p!.criadoEm)} />
                  <Linha k="Motivo da perda" v={p!.motivoPerda ? [p!.motivoPerda.categoria, p!.motivoPerda.texto].filter(Boolean).join(" — ") : undefined} />
                </>
              )}
            </dl>
            {ficha.cardId ? <a className="link mt-3 inline-block text-sm" target="_blank" rel="noopener noreferrer" href={`https://novoseminovo.com.br/comercial/${ficha.cardId}`}>Editar cadastro no Comercial</a> : null}
          </section>
        </aside>
      </div>
    </>
  );
}

function Atividades({ notas }: { notas: Nota[] }) {
  if (!notas.length) return <p className="py-4 text-sm text-muted">Nenhuma atividade registrada.</p>;
  return (
    <ol className="space-y-4">
      {notas.map((n) => (
        <li key={n.id} className="border-l-2 border-blue/30 pl-4">
          <p className="text-xs text-muted">
            <b className="text-navy">{TIPO_NOTA[n.kind] ?? n.kind}</b> · {dataHora(n.createdAt)}
            {n.authorName ? ` · ${n.authorName}` : " · Sistema"}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.body}</p>
        </li>
      ))}
    </ol>
  );
}
