import type { ReactNode } from "react";

// Topo comum das páginas institucionais (Como funciona, Para lojas, Quem
// somos, Perguntas frequentes, Contato).
export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mx-auto max-w-3xl px-4 pt-12 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-green">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{title}</h1>
      {children && <div className="mt-4 text-base text-ink-muted">{children}</div>}
    </header>
  );
}

export function Section({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto mt-12 max-w-5xl scroll-mt-20 px-4">
      {title && <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

export function Steps({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ol className="mt-6 grid gap-4 md:grid-cols-3">
      {items.map((item, index) => (
        <li key={item.title} className="rounded-brand bg-surface-raised p-5 shadow-card">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-green font-display text-lg font-bold text-on-green">
            {index + 1}
          </span>
          <h3 className="mt-3 text-base font-bold text-ink">{item.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
