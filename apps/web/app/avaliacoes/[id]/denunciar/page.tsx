import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { reportReviewAction } from "@/lib/actions/reviews";

// Denúncia de avaliação: só quem foi avaliado (a pessoa ou a loja/imobiliária)
// consegue enviar; a API confere. A avaliação continua no ar até o admin decidir.
export default async function ReportReviewPage({ params, searchParams }: { params: { id: string }; searchParams: { erro?: string; enviado?: string } }) {
  const session = await auth();
  if (!session?.user) redirect(`/entrar?voltar=/avaliacoes/${params.id}/denunciar`);
  const action = reportReviewAction.bind(null, params.id);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Denunciar avaliação</h1>
      {searchParams.enviado ? (
        <p role="status" className="rounded-brand bg-brand-green/10 px-4 py-3 text-sm text-ink">
          Denúncia enviada. A equipe analisa e, se a avaliação violar as regras, ela sai do ar.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Só quem recebeu a avaliação pode denunciar. Explique o que está errado: ofensa, pessoa que nunca negociou com você, informação falsa.
            A avaliação continua visível até a decisão.
          </p>
          {searchParams.erro && (
            <p role="alert" className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
              {searchParams.erro}
            </p>
          )}
          <form action={action} className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Motivo</span>
              <textarea name="reason" required minLength={5} maxLength={500} rows={4} className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink" />
            </label>
            <SubmitButton pendingLabel="Enviando...">Enviar denúncia</SubmitButton>
          </form>
        </>
      )}
      <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">
        Voltar ao site
      </Link>
    </main>
  );
}
