import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchSalesTeam } from "@/lib/api";
import { createSalesMemberAction, resendInviteAction } from "@/lib/actions/sales";
import { Flash } from "@/components/sales/SalesAccess";

export const dynamic = "force-dynamic";

const input = "rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink";

export default async function SalesTeamPage({ searchParams }: { searchParams: { sucesso?: string; erro?: string } }) {
  const session = await auth();
  if (!session?.user || !session.accessToken) redirect("/entrar?voltar=/admin/equipe");
  if (session.user.role !== "admin") redirect("/conta");
  const team = (await fetchSalesTeam(session.accessToken)) ?? [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Administração
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink">Equipe comercial</h1>
      <p className="text-sm text-ink-muted">
        Quem é convidado recebe um e-mail para criar a senha e entra só na área Comercial (quadro de empresas, planos e metas). Não vê
        financeiro, moderação nem dados pessoais de compradores. Para tirar o acesso, bloqueie a conta no cadastro do usuário.
      </p>
      <Flash sucesso={searchParams.sucesso} erro={searchParams.erro} />

      <form aria-label="Convidar para o comercial" action={createSalesMemberAction} className="flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Convidar pessoa</h2>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Nome</span>
          <input name="name" required minLength={2} maxLength={120} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">E-mail</span>
          <input name="email" type="email" required maxLength={200} className={input} />
        </label>
        <button type="submit" className="self-start rounded-brand bg-brand-green px-4 py-2 font-bold text-on-green hover:opacity-90">
          Enviar convite
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Pessoas ({team.length})</h2>
        {team.length === 0 && <p className="text-sm text-ink-muted">Ninguém na equipe ainda.</p>}
        {team.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-brand-lg border border-border bg-surface-raised px-4 py-3 text-sm">
            <span>
              <Link href={`/admin/usuarios/${member.id}`} className="font-semibold text-ink hover:text-brand-blue hover:underline">
                {member.name}
              </Link>
              <span className="text-ink-muted"> · {member.email}</span>
              <span className="block text-xs text-ink-muted">
                Código do link: {member.salesCode} · {member.status === "active" ? "Ativo" : "Bloqueado"}
              </span>
            </span>
            {member.status === "active" && (
              <form action={resendInviteAction.bind(null, member.id)}>
                <button type="submit" className="rounded-brand border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-sober">
                  Reenviar convite
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
