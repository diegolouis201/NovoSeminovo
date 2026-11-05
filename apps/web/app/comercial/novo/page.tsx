import Link from "next/link";
import { createProspectAction } from "@/lib/actions/sales";
import { Flash, SalesDenied, salesSession } from "@/components/sales/SalesAccess";

export const dynamic = "force-dynamic";

const input = "rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink";

export default async function NewProspectPage({ searchParams }: { searchParams: { erro?: string } }) {
  const { allowed } = await salesSession("/comercial/novo");
  if (!allowed) return <SalesDenied />;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
      <Link href="/comercial" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Quadro comercial
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink">Nova empresa</h1>
      <p className="text-sm text-ink-muted">Empresa que você vai abordar. Com o CNPJ, quando ela se cadastrar no site o card anda sozinho.</p>
      <Flash erro={searchParams.erro} />
      <form aria-label="Nova empresa" action={createProspectAction} className="flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Nome da empresa</span>
          <input name="name" required minLength={2} maxLength={160} className={input} />
        </label>
        <fieldset className="flex gap-4">
          <legend className="mb-1 font-semibold text-ink">Segmento</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="segment" value="vehicle" defaultChecked /> Veículos (loja)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="segment" value="property" /> Imóveis (imobiliária, corretor, construtora)
          </label>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">CNPJ (opcional)</span>
          <input name="cnpj" inputMode="numeric" maxLength={18} className={input} />
        </label>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">Cidade</span>
            <input name="city" maxLength={80} placeholder="Cidade" className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">UF</span>
            <input name="state" maxLength={2} defaultValue="MG" className={input} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Pessoa de contato</span>
          <input name="contactName" maxLength={120} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">WhatsApp / telefone (com DDD)</span>
          <input name="phone" inputMode="tel" maxLength={20} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">E-mail</span>
          <input name="email" type="email" maxLength={200} className={input} />
        </label>
        <button type="submit" className="rounded-brand bg-brand-green px-4 py-2 font-bold text-on-green hover:opacity-90">
          Adicionar ao quadro
        </button>
      </form>
    </main>
  );
}
