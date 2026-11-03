import Link from "next/link";

// Peças visuais das telas do CRM no admin (/admin/crm e /admin/crm/receitas).

export const int = (value: number) => value.toLocaleString("pt-BR");
export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

export function monthShort(month: string): string {
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function Card({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
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
export function HBars({ label, rows, muted }: { label: string; rows: { name: string; value: number; display?: string; dim?: boolean }[]; muted?: string }) {
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


export function CrmSectionNav({ current }: { current: "geral" | "receitas" }) {
  const items = [
    { key: "geral", href: "/admin/crm", label: "Visão geral" },
    { key: "receitas", href: "/admin/crm/receitas", label: "Receitas" },
  ] as const;
  return (
    <nav aria-label="Seções do CRM" className="flex gap-4 border-b border-border text-sm font-semibold">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={`-mb-px border-b-2 px-1 pb-2 ${current === item.key ? "border-brand-blue text-brand-blue" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-brand-lg border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

// Colunas por mês, empilhadas (até 2 séries com legenda). Valor de cada mês
// ao passar o mouse; a tabela com os números fica logo abaixo, recolhida.
export function MonthColumns({
  label,
  months,
  series,
  format,
}: {
  label: string;
  months: { mes: string; values: number[] }[];
  series: { name: string; color: string }[];
  format: (value: number) => string;
}) {
  const totals = months.map((m) => m.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.color}`} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={label}>
        {months.map((m, i) => (
          <div
            key={m.mes}
            className="flex h-full flex-1 flex-col justify-end gap-[2px] hover:opacity-80"
            title={`${monthShort(m.mes)}/${m.mes.slice(2, 4)}: ${series.length > 1 ? series.map((s, j) => `${s.name} ${format(m.values[j] ?? 0)}`).join(" · ") + " · total " : ""}${format(totals[i]!)}`}
          >
            {totals[i] === 0 ? (
              <div className="h-[2px] bg-surface-sober" />
            ) : (
              [...m.values.keys()].reverse().map((j) =>
                (m.values[j] ?? 0) > 0 ? (
                  <div
                    key={j}
                    className={`${series[j]!.color} ${j === m.values.length - 1 || m.values.slice(j + 1).every((v) => !v) ? "rounded-t-[4px]" : ""}`}
                    style={{ height: `${Math.max(2, ((m.values[j] ?? 0) / max) * 100)}%` }}
                  />
                ) : null,
              )
            )}
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
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-brand-blue">Ver tabela</summary>
        <table className="mt-2 w-full [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 font-normal">Mês</th>
              {series.length > 1 && series.map((s) => <th key={s.name} className="py-1 text-right font-normal">{s.name}</th>)}
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.mes} className="border-t border-border">
                <td className="py-1">{monthShort(m.mes)}/{m.mes.slice(2, 4)}</td>
                {series.length > 1 && m.values.map((v, j) => <td key={j} className="py-1 text-right">{format(v)}</td>)}
                <td className="py-1 text-right font-semibold">{format(totals[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
