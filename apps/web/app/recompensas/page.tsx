import Link from "next/link";
import { Car, Handshake, House, Sparkle, UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { RebateTier } from "@novoseminovo/shared-types";
import { fetchPublicRebateTiers } from "@/lib/api";

const INDIVIDUAL_REBATE_PERCENT = 20;

export default async function RebatesProgramPage() {
  const tiers = await fetchPublicRebateTiers();

  const dealershipTiers = tiers.filter((tier) => tier.partnerType === "dealership").sort((a, b) => a.tierOrder - b.tierOrder);
  const realEstateTiers = tiers
    .filter((tier) => tier.partnerType === "real_estate_agency")
    .sort((a, b) => a.tierOrder - b.tierOrder);
  const brokerTiers = tiers.filter((tier) => tier.partnerType === "broker").sort((a, b) => a.tierOrder - b.tierOrder);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand-green">
        <Sparkle size={16} weight="fill" />
        Programa de recompensa
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">
        Quem anuncia aqui também ganha com o financiamento
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Quando o comprador de um carro ou imóvel anunciado aqui fecha o financiamento por um parceiro financeiro da
        plataforma, parte da comissão volta pra quem anunciou. Sem custo nenhum — é automático.
      </p>

      <div className="mt-6 rounded-brand border border-border bg-surface-raised p-5">
        <p className="text-sm font-semibold text-ink">Exemplo rápido</p>
        <p className="mt-1 text-sm text-ink-muted">
          Imóvel de <strong>R$ 100.000</strong>, financiou <strong>R$ 80.000</strong>. A comissão sobre o
          financiamento é 1% → <strong>R$ 800</strong>. Quem anunciou (pessoa física) recebe 20% disso de volta:{" "}
          <strong className="text-brand-green">R$ 160</strong>.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SegmentCard
          icon={<UserCircle size={22} weight="duotone" className="text-brand-blue" />}
          title="Pessoa física"
          subtitle="Anunciando seu próprio carro ou imóvel"
        >
          <p className="text-3xl font-extrabold text-brand-green">{INDIVIDUAL_REBATE_PERCENT}%</p>
          <p className="mt-1 text-sm text-ink-muted">Fixo, sempre — em todo financiamento fechado, veículo ou imóvel.</p>
        </SegmentCard>

        <SegmentCard
          icon={<Car size={22} weight="duotone" className="text-brand-orange" />}
          title="Lojista"
          subtitle="Loja de veículos parceira"
        >
          <TierList tiers={dealershipTiers} />
        </SegmentCard>

        <SegmentCard
          icon={<House size={22} weight="duotone" className="text-brand-purple" />}
          title="Imobiliária"
          subtitle="Imobiliária parceira"
        >
          <TierList tiers={realEstateTiers} />
        </SegmentCard>

        <SegmentCard
          icon={<Handshake size={22} weight="duotone" className="text-brand-pink" />}
          title="Corretor(a) autônomo(a)"
          subtitle="Corretor parceiro, sem imobiliária"
        >
          <TierList tiers={brokerTiers} />
        </SegmentCard>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/anunciar"
          className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green hover:opacity-90"
        >
          Quero anunciar
        </Link>
        <Link
          href="/parceiro"
          className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober"
        >
          Quero virar parceiro
        </Link>
      </div>
    </main>
  );
}

function SegmentCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-5 shadow-card">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="font-display text-base font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function TierList({ tiers }: { tiers: RebateTier[] }) {
  if (tiers.length === 0) {
    return <p className="text-sm text-ink-muted">Em breve.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {tiers.map((tier, index) => (
        <li key={tier.id} className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {tier.tierName}
            {index === 0 ? " (início)" : ` — a partir de ${tier.minVolumeLabel}`}
          </span>
          <span className="font-bold text-ink">{tier.rebatePercentLabel}</span>
        </li>
      ))}
    </ul>
  );
}
