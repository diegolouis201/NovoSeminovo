import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChatCircle, Eye } from "@phosphor-icons/react/dist/ssr";
import type { PartnerDashboard } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";

// Blocos da tela inicial do painel do parceiro (/parceiro), alimentados por
// GET /partners/mine/dashboard. Só dados que existem no banco; cada número
// diz de que período é. Componentes de servidor (sem JS no navegador).

const FUSO = "America/Sao_Paulo";
const data = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, ...opts });
// "AAAA-MM-DD" do agrupamento por dia → "06/11" (sem passar por Date/fuso).
const diaCurto = (chave: string) => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
const num = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

export function haQuanto(iso: string, agora: Date): string {
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function Card({ id, title, subtitle, children, className = "" }: { id: string; title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col rounded-brand-lg border border-border bg-surface-raised p-5 ${className}`}>
      <h2 id={id} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      {children}
    </section>
  );
}

function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface-page px-4 py-2 text-sm font-bold text-ink hover:bg-surface-sober focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue"
    >
      {children} <ArrowRight size={14} weight="bold" aria-hidden />
    </Link>
  );
}

// ---------- 1. Plano e fatura ----------

const SITUACAO: Record<PartnerDashboard["plano"]["situacao"], { label: string; tone: string }> = {
  trial: { label: "Período grátis", tone: "bg-brand-blue text-on-blue" },
  em_dia: { label: "Em dia", tone: "bg-brand-green text-on-green" },
  atrasado: { label: "Pagamento atrasado", tone: "bg-status-danger text-on-pink" },
  sem_plano: { label: "Sem plano", tone: "bg-status-danger text-on-pink" },
  nao_precisa: { label: "Sem mensalidade", tone: "bg-surface-sober text-ink" },
};

export function PlanSummary({ plano, isOwner }: { plano: PartnerDashboard["plano"]; isOwner: boolean }) {
  const situacao = SITUACAO[plano.situacao];
  const destaques = plano.destaques;
  return (
    <section aria-labelledby="painel-plano" className="rounded-brand-lg border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="painel-plano" className="font-display text-lg font-semibold text-ink">
          Plano e fatura
        </h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${situacao.tone}`}>{situacao.label}</span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Seu plano</dt>
          <dd className="font-bold text-ink">{plano.planName ?? (plano.situacao === "trial" ? "Período grátis" : "Nenhum plano")}</dd>
          {plano.situacao === "trial" && plano.trialEndsAt && <dd className="text-ink-muted">grátis até {data(plano.trialEndsAt)}</dd>}
        </div>
        <div>
          <dt className="text-ink-muted">Próxima cobrança</dt>
          <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">
            {plano.proximaCobranca ? `${plano.proximaCobranca.valor.label} · ${data(plano.proximaCobranca.data)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Anúncios em uso</dt>
          <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">
            {plano.limiteAnuncios !== undefined ? `${num(plano.anunciosEmUso)} de ${num(plano.limiteAnuncios)}` : `${num(plano.anunciosEmUso)} · sem limite`}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Destaques disponíveis</dt>
          <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">
            {destaques ? `${num(Math.max(0, destaques.max - destaques.usados))} de ${num(destaques.max)}` : "—"}
            {destaques && destaques.superMax > 0 && (
              <span className="block font-normal text-ink-muted">
                super: {num(Math.max(0, destaques.superMax - destaques.superUsados))} de {num(destaques.superMax)}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {plano.situacao === "atrasado" && (
        <p className="mt-3 text-sm font-semibold text-status-danger">O pagamento da renovação não passou. Atualize o cartão na página do plano.</p>
      )}
      {plano.situacao === "sem_plano" && (
        <p className="mt-3 text-sm font-semibold text-status-danger">Período grátis encerrado: sua vitrine e seus anúncios estão fora do ar até contratar um plano.</p>
      )}
      {isOwner && <ButtonLink href="/parceiro/plano">Ver plano e faturas</ButtonLink>}
    </section>
  );
}

// ---------- 2. Leads dos últimos 15 dias ----------

export function LeadsLast15({ leads }: { leads: PartnerDashboard["leads"] }) {
  const max = Math.max(1, ...leads.porDia.map((d) => d.total));
  const pico = leads.porDia.reduce((a, b) => (b.total > a.total ? b : a), leads.porDia[0] ?? { data: "", total: 0 });
  const meio = leads.porDia[Math.floor(leads.porDia.length / 2)];
  const resumo =
    leads.total === 0
      ? "Nenhum lead nos últimos 15 dias."
      : `${plural(leads.total, "lead", "leads")} nos últimos 15 dias; o dia com mais foi ${diaCurto(pico.data)} (${num(pico.total)}).`;
  return (
    <Card id="painel-leads" title="Leads" subtitle="Últimos 15 dias" className="lg:col-span-2">
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-sm text-ink-muted">Total</dt>
          <dd className="font-display text-3xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{num(leads.total)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Aguardando resposta</dt>
          <dd className="font-display text-3xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{num(leads.aguardando)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Em contato</dt>
          <dd className="font-display text-3xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{num(leads.emContato)}</dd>
        </div>
      </dl>
      {leads.tempoResposta && (
        <p className="mt-2 text-sm text-ink">
          Tempo médio de resposta no chat: <strong>{leads.tempoResposta.label}</strong>{" "}
          <span className="text-ink-muted">
            ({leads.tempoResposta.respondidas} de {plural(leads.tempoResposta.conversas, "conversa respondida", "conversas respondidas")})
          </span>
        </p>
      )}

      <figure aria-labelledby="painel-leads-resumo" className="mt-4">
        {/* Barras só visuais; o leitor de tela lê o resumo e a tabela abaixo. */}
        <div aria-hidden className="flex h-32 items-end gap-[2px] border-b border-border">
          {leads.porDia.map((d) => (
            <div key={d.data} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${diaCurto(d.data)}: ${plural(d.total, "lead", "leads")}`}>
              <div
                className={`w-full rounded-t-[4px] ${d.total ? "bg-brand-blue" : "bg-border"}`}
                style={{ height: d.total ? `${Math.max(6, (d.total / max) * 100)}%` : "2px" }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sober bg-ink px-2 py-1 text-xs text-surface-raised group-hover:block">
                {diaCurto(d.data)}: {num(d.total)}
              </span>
            </div>
          ))}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-xs text-ink-muted [font-variant-numeric:tabular-nums]">
          <span>{leads.porDia[0] && diaCurto(leads.porDia[0].data)}</span>
          <span>{meio && diaCurto(meio.data)}</span>
          <span>{leads.porDia.at(-1) && diaCurto(leads.porDia.at(-1)!.data)}</span>
        </div>
        <figcaption id="painel-leads-resumo" className="mt-2 text-sm text-ink-muted">
          {resumo}
        </figcaption>
        <table className="sr-only">
          <caption>Leads por dia (horário de Brasília)</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Leads</th>
            </tr>
          </thead>
          <tbody>
            {leads.porDia.map((d) => (
              <tr key={d.data}>
                <th scope="row">{diaCurto(d.data)}</th>
                <td>{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </Card>
  );
}

// ---------- 3. Funil dos últimos 30 dias ----------

// Mesmas cores das colunas do quadro de leads (LeadsKanban).
const COR_ETAPA: Record<string, string> = {
  contacted: "bg-brand-blue",
  visit_scheduled: "bg-brand-purple",
  negotiating: "bg-brand-pink",
  won: "bg-brand-green",
};

export function LeadsFunnel({ funil }: { funil: PartnerDashboard["funil"] }) {
  const linhas = [{ status: "leads", label: "Leads", total: funil.totalLeads, cor: "bg-brand-orange" }, ...funil.etapas.map((e) => ({ ...e, cor: COR_ETAPA[e.status] ?? "bg-ink-muted" }))];
  const max = Math.max(1, funil.totalLeads);
  return (
    <Card id="painel-funil" title="Funil de leads" subtitle="Últimos 30 dias · etapa em que cada lead está hoje">
      <ol className="mt-4 flex flex-col gap-2.5">
        {linhas.map((l) => (
          <li key={l.status}>
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-ink">{l.label}</span>
              <strong className="text-ink [font-variant-numeric:tabular-nums]">{num(l.total)}</strong>
            </p>
            <div aria-hidden className="mt-1 h-2 rounded-full bg-surface-sober">
              <div className={`h-2 rounded-full ${l.cor}`} style={{ width: l.total ? `${Math.max(3, (l.total / max) * 100)}%` : "0" }} />
            </div>
          </li>
        ))}
      </ol>
      {funil.perdidos > 0 && <p className="mt-2 text-xs text-ink-muted">{plural(funil.perdidos, "lead perdido", "leads perdidos")} no período.</p>}
      <p className="mt-3 flex items-center gap-1.5 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">
        <Eye size={16} aria-hidden />
        <span>
          <strong className="[font-variant-numeric:tabular-nums]">{num(funil.visualizacoesAnunciosAtivos)}</strong> visualizações (total dos anúncios ativos)
        </span>
      </p>
      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-ink-muted">Abriram seus anúncios pelo assistente virtual</dt>
          <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">{num(funil.sinais.assistente)}</dd>
        </div>
        {funil.sinais.arquiteto !== undefined && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-muted">Usaram o Arquiteto nos seus imóveis</dt>
            <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">{num(funil.sinais.arquiteto)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-1 text-xs text-ink-muted">Últimos 30 dias, só a contagem: o site não mostra quem foi.</p>
      <ButtonLink href="/parceiro/leads">Ir para os leads</ButtonLink>
    </Card>
  );
}

// ---------- 4. Novos leads ----------

export function RecentLeads({ leads, agora }: { leads: PartnerDashboard["novosLeads"]; agora: Date }) {
  return (
    <Card id="painel-novos-leads" title="Novos leads" subtitle="Responda rápido: quem atende primeiro vende mais" className="lg:col-span-3">
      {leads.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Nenhum lead ainda. Quem chamar pelo chat, WhatsApp ou formulário dos seus anúncios aparece aqui.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((l) => (
            <li key={l.id} className="border-b border-border">
              <Link href={`/parceiro/leads#lead-${l.id}`} className="flex items-start justify-between gap-3 py-2.5 hover:bg-surface-sober focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{l.nome}</span>
                  <span className="block text-sm text-ink-muted">
                    {[l.anuncio, l.origem, haQuanto(l.criadoEm, agora)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${l.status === "new" ? "bg-brand-orange text-on-orange" : "bg-surface-sober text-ink"}`}
                >
                  {l.status === "new" ? "Responder" : l.statusLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- 5. Top 5 anúncios ----------

export function TopListings({ anuncios }: { anuncios: PartnerDashboard["topAnuncios"] }) {
  return (
    <Card id="painel-top" title="Top 5 anúncios" subtitle="Anúncios no ar com mais visualizações (total desde a publicação) e leads" className="lg:col-span-2">
      {anuncios.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Nenhum anúncio no ar.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {anuncios.map((a) => (
            <li key={a.id}>
              <Link href={`/anuncio/${a.id}`} className="flex items-center gap-3 py-2.5 hover:bg-surface-sober focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue">
                {a.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveMediaUrl(a.fotoUrl)} alt="" width={64} height={48} loading="lazy" decoding="async" className="h-12 w-16 shrink-0 rounded-sober object-cover" />
                ) : (
                  <span aria-hidden className="h-12 w-16 shrink-0 rounded-sober bg-surface-sober" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{a.titulo}</span>
                  <span className="block text-sm text-ink-muted [font-variant-numeric:tabular-nums]">{a.preco.label}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm text-ink [font-variant-numeric:tabular-nums] sm:flex-row sm:gap-4">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={14} aria-hidden /> {num(a.visualizacoes)}
                    <span className="sr-only"> visualizações</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ChatCircle size={14} aria-hidden /> {num(a.leads)}
                    <span className="sr-only"> leads</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------- 6. Análise de anúncios ----------

const TOM: Record<string, string> = {
  alerta: "border-t-brand-orange",
  bom: "border-t-brand-green",
  neutro: "border-t-brand-blue",
};

export function ListingAnalysis({ analise }: { analise: PartnerDashboard["analise"] }) {
  return (
    <Card id="painel-analise" title="Análise de anúncios" subtitle={`${plural(analise.anunciosAtivos, "anúncio no ar", "anúncios no ar")}`}>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {analise.itens.map((i) => (
          <li key={i.chave} className={`rounded-brand border border-t-4 border-border bg-surface-sober p-3 ${TOM[i.tom] ?? ""}`}>
            <p className="text-sm font-semibold text-ink">{i.titulo}</p>
            <p className="font-display text-2xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{num(i.total)}</p>
            <p className="text-xs text-ink-muted">{i.dica}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">{analise.regra}</p>
      <ButtonLink href="/parceiro/anuncios?status=active">Ver anúncios para melhorar</ButtonLink>
    </Card>
  );
}

// ---------- 7. Qualidade da loja ----------

export function StoreQuality({ qualidade }: { qualidade: PartnerDashboard["qualidade"] }) {
  const pontos = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <Card id="painel-qualidade" title="Qualidade da loja" subtitle="De 0 a 100, pelos itens abaixo" className="lg:col-span-3">
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="ns-ring-wrapper">
          <progress
            className="ns-ring"
            value={qualidade.nota}
            max={100}
            aria-label="Qualidade da loja"
            aria-valuetext={`${qualidade.nota} de 100`}
            style={{ ["--value" as string]: qualidade.nota }}
          />
          <div className="ns-ring-content" aria-hidden>
            <span className="block font-display text-3xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{qualidade.nota}</span>
            <span className="block text-xs text-ink-muted">de 100</span>
          </div>
        </div>
        <ul className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3">
          {qualidade.itens.map((i) => (
            <li key={i.chave} className="flex gap-2">
              <span aria-hidden className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i.ok ? "bg-brand-green text-on-green" : "bg-brand-orange text-on-orange"}`}>
                {i.ok ? "✓" : "!"}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{i.ok ? "Em dia: " : "Para melhorar: "}</span>
                <span className="font-semibold text-ink">{i.label}</span>
                <span className="block text-xs text-ink-muted">
                  {i.detalhe} {pontos(i.pontos)} de {pontos(i.max)} pontos.
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Nota = pontos ganhos ÷ pontos possíveis × 100. Avaliações e leads atendidos só contam quando existem.
      </p>
    </Card>
  );
}
