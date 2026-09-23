import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner, fetchPartnerMembers } from "@/lib/api";
import { addPartnerMemberAction, removePartnerMemberAction } from "@/lib/actions/partners";

export default async function PartnerTeamPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");
  if (!partner.isOwner) redirect("/parceiro");

  const members = await fetchPartnerMembers(session.accessToken);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="equipe" />
      </div>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Equipe</h2>
      <p className="text-sm text-ink-muted">
        Adicione alguém que já tenha conta no NovoSeminovo pra ajudar a gerenciar os anúncios e leads
        desta loja/imobiliária.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-4 rounded-brand border border-border bg-surface-raised p-4"
          >
            <div>
              <p className="font-semibold text-ink">{member.name}</p>
              <p className="text-sm text-ink-muted">{member.email}</p>
            </div>
            {member.role === "owner" ? (
              <span className="text-xs font-bold text-brand-green">Dona/dono</span>
            ) : (
              <form action={removePartnerMemberAction.bind(null, member.id)}>
                <Button type="submit" variant="ghost">
                  Remover
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form action={addPartnerMemberAction} className="mt-6 flex items-end gap-3 rounded-brand border border-border bg-surface-raised p-4">
        <div className="flex-1">
          <FormField label="E-mail de quem você quer adicionar" name="email" type="email" />
        </div>
        <Button type="submit">Adicionar</Button>
      </form>
    </main>
  );
}
