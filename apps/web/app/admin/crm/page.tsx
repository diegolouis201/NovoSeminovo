import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBRL, type CrmOverview, type CrmOverviewScope } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchCrmOverview } from "@/lib/api";

export const dynamic = "force-dynamic";

// Visão geral do CRM: a empresa toda numa tela (funil, receita, NPS, chamados,
// motivos de perda, origem, vendedores e o que precisa de atenção). Os números
// vêm do mesmo feed que o repositório do CRM no Claude usa.

const SCOPES: { value: CrmOverviewScope; label: string }[] = [
  { value: "all", label: "Geral" },
  { value: "vehicle", label: "Veículos" },
  { value: "property", label: "Imóveis" },
];

const CHANNEL_LABEL: Record<string, string> = {
  google_ads: "Google Ads",
  google: "Google",
  meta_ads: "Meta Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  email: "E-mail",
  indicacao: "Indicação",
};
const channel = (canal: string) => CHANNEL_LABEL[canal] ?? canal.replace(/_/g, " ");
const int = (value: number) => value.toLocaleString("pt-BR");
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function monthShort(month: string): string {
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Card({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-5 ${className}`}>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

// Barras horizontais de uma série só (mesma cor): o título nomeia, o número
// fica ao lado de cada barra.
function HBars({ label, rows, muted }: { label: string; rows: { name: string; value: number; display?: string; dim?: boolean }[]; muted?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{muted ?? "Ainda sem dados."}</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[minmax(7rem,11rem)_1fr_4.5rem] items-center gap-3 text-sm" title={`${row.name}: ${row.display ?? int(row.value)}`}>
          <span className={row.dim ? "text-ink-muted" : "text-ink"}>{row.name}</span>
          <span className="h-3 rounded-r-[4px] bg-surface-sober">
            <span
              className={`block h-3 rounded-r-[4px] ${row.dim ? "bg-ink-muted opacity-50" : "bg-brand-blue"}`}
              style={{ width: `${row.value === 0 ? 0 : Math.max(2, (row.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">{row.display ?? int(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function RevenueChart({ months }: { months: CrmOverview["receitaPorMes"] }) {
  const max = Math.max(1, ...months.map((m) => m.valor));
  const total = months.reduce((sum, m) => sum + m.valor, 0);
  const current = months[months.length - 1];
  return (
    <div>
      <p className="text-sm text-ink-muted">
        12 meses: <strong className="text-ink">{formatBRL(total)}</strong> · este mês: <strong className="text-ink">{formatBRL(current?.valor ?? 0)}</strong>
      </p>
      <div className="mt-3 flex h-40 items-end gap-[2px]" role="img" aria-label={`Receita recebida por mês, últimos 12 meses: total ${formatBRL(total)}`}>
        {months.map((m) => (
          <div key={m.mes} className="group flex h-full flex-1 flex-col justify-end" title={`${monthShort(m.mes)}/${m.mes.slice(2, 4)}: ${formatBRL(m.valor)}`}>
            <div
              className="rounded-t-[4px] bg-brand-blue group-hover:bg-brand-green"
              style={{ height: `${m.valor === 0 ? 2 : Math.max(4, (m.valor / max) * 100)}%`, opacity: m.valor === 0 ? 0.25 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-ink-muted">
        {months.map((m) => (
          <span key={m.mes} className="flex-1 text-center">
            {monthShort(m.mes)}
          </span>
        ))}
      </div>
    </div>
  );
}

function NpsBlock({ nps }: { nps: CrmOverview["numeros"]["nps"] }) {
  if (nps.respostas === 0) return <p className="text-sm text-ink-muted">Nenhuma resposta nos últimos 90 dias. A pesquisa aparece no painel do parceiro depois de 30 dias de cadastro.</p>;
  const parts = [
    { key: "detratores", label: "Detratores (0–6)", value: nps.detratores, color: "bg-status-danger" },
    { key: "neutros", label: "Neutros (7–8)", value: nps.neutros, color: "bg-ink-muted opacity-50" },
    { key: "promotores", label: "Promotores (9–10)", value: nps.promotores, color: "bg-brand-green" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-4xl font-semibold text-ink [font-variant-numeric:tabular-nums]">
        {nps.score}
        <span className="ml-2 text-sm font-normal text-ink-muted">de −100 a 100 · {int(nps.respostas)} resposta(s)</span>
      </p>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`Promotores ${nps.promotores}, neutros ${nps.neutros}, detratores ${nps.detratores}`}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} className={p.color} style={{ width: `${pct(p.value, nps.respostas)}%` }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${p.color}`} aria-hidden />
            {p.label}: <strong className="text-ink">{p.value}</strong> ({pct(p.value, nps.respostas)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AdminCrmPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");

  const scope: CrmOverviewScope = searchParams.tipo === "vehicle" || searchParams.tipo === "property" ? searchParams.tipo : "all";
  const data = await fetchCrmOverview(scope, session.accessToken);

  const header = (
    <header className="flex flex-col gap-3">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Visão geral do CRM</h1>
        <p className="text-sm text-ink-muted">
          A jornada de todas as empresas num lugar só: funil, receita, satisfação e o que precisa de atenção.
          {data && ` Atualizado em ${new Date(data.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
        </p>
      </div>
      <nav className="flex w-fit gap-1 rounded-full bg-surface-sober p-1" aria-label="Recorte da visão geral">
        {SCOPES.map((item) => (
          <Link
            key={item.value}
            href={item.value === "all" ? "/admin/crm" : `/admin/crm?tipo=${item.value}`}
            aria-current={scope === item.value ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${scope === item.value ? "bg-brand-blue text-on-blue" : "text-ink hover:bg-surface-raised"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );

  if (!data) {
    return (
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
        {header}
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">Não consegui carregar os números agora. Tente de novo em alguns minutos.</p>
      </main>
    );
  }

  const n = data.numeros;
  const tiles = [
    { label: "Mensalidades (MRR)", value: formatBRL(n.mrr), hint: n.ticketMedio !== undefined ? `ticket médio ${formatBRL(n.ticketMedio)}` : undefined },
    { label: "Assinantes", value: int(n.assinantes), hint: `de ${int(n.empresas)} empresas cadastradas` },
    { label: "Novas assinaturas no mês", value: int(n.novasAssinaturasMes) },
    { label: "Cancelamentos no mês", value: int(n.cancelamentosMes) },
    { label: "NPS (90 dias)", value: n.nps.score !== undefined ? String(n.nps.score) : "—", hint: `${int(n.nps.respostas)} resposta(s)` },
    { label: "Chamados abertos", value: int(n.chamadosAbertos), hint: n.tempoMedioResolucaoHoras !== undefined ? `resolução média ${n.tempoMedioResolucaoHoras} h` : undefined },
    { label: "Assinantes em risco", value: int(n.emRisco), hint: "sem entrar no painel há 30+ dias" },
    { label: "Precisam de atenção", value: int(data.atencao.length), hint: "lista no fim da página" },
  ];

  const pipeline = data.funil.filter((f) => f.etapa !== "perdida" && f.etapa !== "cancelou");
  const exits = data.funil.filter((f) => f.etapa === "perdida" || f.etapa === "cancelou");
  const inPipeline = pipeline.reduce((sum, f) => sum + f.quantidade, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
      {header}

      <section aria-label="Números principais" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5 rounded-brand-lg border border-border bg-surface-raised p-4">
            <p className="text-xs text-ink-muted">{tile.label}</p>
            <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{tile.value}</p>
            {tile.hint && <p className="text-xs text-ink-muted">{tile.hint}</p>}
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Funil de empresas" note={`${int(inPipeline)} empresa(s) no funil. Até "Proposta enviada" a equipe move; depois o site move sozinho.`}>
          <HBars label="Funil de empresas" rows={[...pipeline.map((f) => ({ name: f.nome, value: f.quantidade, display: `${int(f.quantidade)} · ${pct(f.quantidade, inPipeline)}%` })), ...exits.map((f) => ({ name: f.nome, value: f.quantidade, dim: true }))]} />
        </Card>
        <Card title="Receita recebida por mês" note="Pagamentos de planos no Stripe, já sem estornos.">
          <RevenueChart months={data.receitaPorMes} />
        </Card>
        <Card title="Satisfação (NPS)" note="% de promotores menos % de detratores, últimos 90 dias.">
          <NpsBlock nps={n.nps} />
        </Card>
        <Card title="Motivos de perda e cancelamento" note="Por categoria, somando prospecção perdida e assinaturas canceladas.">
          <HBars label="Motivos de perda" rows={data.motivos.map((m) => ({ name: m.categoria, value: m.quantidade }))} muted="Nenhuma perda registrada com motivo." />
        </Card>
        <Card title="Origem dos cadastros" note="De onde vieram as empresas (campanha ou link com UTM).">
          <HBars label="Origem dos cadastros" rows={data.origem.map((o) => ({ name: channel(o.canal), value: o.quantidade }))} />
        </Card>
        <Card title="Desempenho por vendedor" note="Carteira atual: cards, empresas cadastradas, assinantes e mensalidades.">
          {data.vendedores.length === 0 ? (
            <p className="text-sm text-ink-muted">Ainda sem cards.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="py-1 pr-3 font-normal">Vendedor</th>
                    <th className="py-1 pr-3 text-right font-normal">Cards</th>
                    <th className="py-1 pr-3 text-right font-normal">Cadastradas</th>
                    <th className="py-1 pr-3 text-right font-normal">Assinantes</th>
                    <th className="py-1 text-right font-normal">MRR</th>
                  </tr>
                </thead>
                <tbody className="[font-variant-numeric:tabular-nums]">
                  {data.vendedores.map((v) => (
                    <tr key={v.nome} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-ink">{v.nome}</td>
                      <td className="py-1.5 pr-3 text-right">{int(v.cards)}</td>
                      <td className="py-1.5 pr-3 text-right">{int(v.cadastradas)}</td>
                      <td className="py-1.5 pr-3 text-right">{int(v.assinantes)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatBRL(v.mrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Precisa de atenção" note="Pagamento atrasado, nota baixa no NPS, chamado parado, assinante sumido e leads sem resposta. Clique para abrir a ficha.">
        {data.atencao.length === 0 ? (
          <p className="text-sm text-ink-muted">Nada pendente agora.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.atencao.map((item, index) => (
              <li key={`${item.empresa}-${index}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.nivel === "urgente" ? "bg-status-danger/10 text-status-danger" : "bg-surface-sober text-ink"}`}>
                  {item.nivel === "urgente" ? "Urgente" : "Acompanhar"}
                </span>
                {item.cardId ? (
                  <Link href={`/comercial/${item.cardId}`} className="font-semibold text-brand-blue hover:underline">
                    {item.empresa}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink">{item.empresa}</span>
                )}
                <span className="text-ink-muted">{item.motivo}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
