import Link from "next/link";
import { Bank, Car, CurrencyCircleDollar, House, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { CASHBACK_DISCLAIMER, CASHBACK_PERCENT } from "@novoseminovo/shared-types";

export const metadata = {
  title: "Cashback no financiamento",
  description: `Financiou seu carro ou imóvel pelo NovoSeminovo? ${CASHBACK_PERCENT}% da nossa comissão volta para você, por Pix.`,
};

// Programa de cashback: quem contrata o financiamento recebe parte da
// comissão do NovoSeminovo (ver RebatesService na API).
export default function CashbackProgramPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand-green">
        <Sparkle size={16} weight="fill" />
        Cashback no financiamento
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Financiou com a gente? Parte da comissão volta para você.</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Quando você contrata o financiamento do seu carro ou imóvel pelo NovoSeminovo, o banco paga uma comissão para nós.
        Devolvemos {CASHBACK_PERCENT}% dessa comissão para você, por Pix no seu CPF.
      </p>

      <div className="mt-6 rounded-brand border border-border bg-surface-raised p-5">
        <p className="text-sm font-semibold text-ink">Exemplo</p>
        <p className="mt-1 text-sm text-ink-muted">
          Você financiou <strong>R$ 400.000</strong> de um imóvel. Se a comissão do banco for de 1%, ela é de{" "}
          <strong>R$ 4.000</strong>. Seu cashback é {CASHBACK_PERCENT}% disso: <strong className="text-brand-green">R$ 800</strong>{" "}
          (valor bruto). A comissão varia de banco para banco — este é só um exemplo.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Step icon={<Bank size={22} weight="duotone" className="text-brand-blue" />} title="1. Simule e contrate">
          Simule nos anúncios de imóveis ou fale com o assistente. Um especialista compara os bancos para você.
        </Step>
        <Step icon={<CurrencyCircleDollar size={22} weight="duotone" className="text-brand-orange" />} title="2. O banco paga a comissão">
          Depois que o contrato é assinado e o banco paga a comissão ao NovoSeminovo, seu cashback é liberado.
        </Step>
        <Step icon={<Sparkle size={22} weight="duotone" className="text-brand-green" />} title="3. Você recebe por Pix">
          O valor cai no seu CPF. Acompanhe tudo em &quot;Meu cashback&quot;, na sua conta.
        </Step>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/imoveis" className="inline-flex items-center gap-2 rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green hover:opacity-90">
          <House size={18} weight="bold" /> Ver imóveis e simular
        </Link>
        <Link href="/carros" className="inline-flex items-center gap-2 rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
          <Car size={18} weight="bold" /> Ver carros
        </Link>
        <Link href="/conta/recompensas" className="inline-flex items-center rounded-brand px-5 py-3 text-sm font-bold text-brand-blue hover:underline">
          Meu cashback →
        </Link>
      </div>

      <section className="mt-10 rounded-brand bg-surface-sober p-5 text-sm text-ink-muted">
        <h2 className="font-semibold text-ink">Regras</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Vale para financiamento de veículo e imobiliário contratado pelo NovoSeminovo.</li>
          <li>{CASHBACK_DISCLAIMER}</li>
          <li>Se o financiamento for cancelado ou a comissão não for paga, não há cashback.</li>
          <li>Precisa ter conta no NovoSeminovo com o CPF de quem contratou — é a chave do Pix.</li>
        </ul>
      </section>
    </main>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-brand border border-border bg-surface-raised p-4">
      {icon}
      <p className="mt-2 font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{children}</p>
    </div>
  );
}
