import Link from "next/link";
import { BookOpen, Info } from "@phosphor-icons/react/dist/ssr";
import { GUIDE_DISCLAIMER, guideUrl, type Guide } from "@/lib/guias";

export function GuideDisclaimer() {
  return (
    <p className="flex items-start gap-2 rounded-brand border border-border bg-surface-sober px-4 py-3 text-sm text-ink-muted">
      <Info size={18} weight="bold" className="mt-0.5 shrink-0 text-brand-blue" aria-hidden />
      <span>{GUIDE_DISCLAIMER}</span>
    </p>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Você está em" className="text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-1">
            {index > 0 && <span aria-hidden>›</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-brand-blue hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <li>
      <Link
        href={guideUrl(guide)}
        className="flex h-full flex-col gap-2 rounded-brand bg-surface-raised p-5 shadow-card transition-colors hover:bg-surface-sober"
      >
        <BookOpen size={24} weight="bold" className="text-brand-green" aria-hidden />
        <span className="font-display text-lg font-semibold leading-snug text-ink">{guide.heading}</span>
        <span className="text-sm text-ink-muted">{guide.description}</span>
        <span className="mt-auto pt-2 text-sm font-semibold text-brand-blue">Ler o guia</span>
      </Link>
    </li>
  );
}
