import Link from "next/link";
import type { FeaturedPartner } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";

// "Confira as Lojas Oficiais" da Webmotors, adaptado: avatar circular com a
// logo do parceiro, ou as iniciais do nome quando a loja não tem logo
// cadastrada (a maioria no começo — não dá pra deixar o espaço vazio).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function FeaturedPartners({ partners }: { partners: FeaturedPartner[] }) {
  if (partners.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold text-ink">Lojas parceiras em destaque</h2>
      <div className="flex gap-6 overflow-x-auto pb-2">
        {partners.map((partner) => (
          <Link
            key={partner.slug}
            href={`/lojas/${partner.slug}`}
            className="flex w-24 shrink-0 flex-col items-center gap-2 text-center"
          >
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised shadow-card">
              {partner.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveMediaUrl(partner.logoUrl)} alt={partner.legalName} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-lg font-bold text-brand-blue">{initials(partner.legalName)}</span>
              )}
            </span>
            <span className="line-clamp-2 text-xs font-semibold text-ink">{partner.legalName}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
