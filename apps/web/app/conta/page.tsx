import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/Button";

const ROLE_LABEL: Record<string, string> = {
  buyer: "Comprador",
  individual_seller: "Vendedor particular",
  partner_agent: "Corretor/vendedor de loja parceira",
  partner_owner: "Dono de loja/imobiliária parceira",
  admin: "Administrador",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Minha conta</h1>

      <div className="mt-6 flex flex-col gap-4 rounded-brand border border-border bg-surface-raised p-6">
        <div>
          <p className="text-xs text-ink-muted">Nome</p>
          <p className="font-semibold text-ink">{session.user.name}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">E-mail</p>
          <p className="font-semibold text-ink">{session.user.email}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Tipo de conta</p>
          <p className="font-semibold text-ink">{ROLE_LABEL[session.user.role] ?? session.user.role}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href="/conta/anuncios"
          className="rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green hover:opacity-90"
        >
          Meus anúncios
        </Link>
        <Link
          href="/conta/favoritos"
          className="rounded-brand bg-brand-blue px-4 py-3 text-sm font-bold text-on-blue hover:opacity-90"
        >
          Meus favoritos
        </Link>
        <Link
          href="/conta/mensagens"
          className="rounded-brand border border-border px-4 py-3 text-sm font-bold text-ink hover:bg-surface-sober"
        >
          Mensagens
        </Link>
        <Link
          href="/conta/buscas-salvas"
          className="rounded-brand border border-border px-4 py-3 text-sm font-bold text-ink hover:bg-surface-sober"
        >
          Buscas salvas
        </Link>
        <Link
          href="/parceiro"
          className="rounded-brand border border-border px-4 py-3 text-sm font-bold text-ink hover:bg-surface-sober"
        >
          Painel da loja
        </Link>
        {session.user.role === "admin" && (
          <Link
            href="/admin"
            className="rounded-brand bg-brand-orange px-4 py-3 text-sm font-bold text-on-orange hover:opacity-90"
          >
            Moderação
          </Link>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="ghost">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
