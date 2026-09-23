import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { SelectField, TextAreaField } from "@/components/FormField";
import { fetchListing } from "@/lib/api";
import { createReviewAction } from "@/lib/actions/reviews";

const RATING_OPTIONS = [
  { value: "5", label: "5 — Ótimo" },
  { value: "4", label: "4 — Bom" },
  { value: "3", label: "3 — Regular" },
  { value: "2", label: "2 — Ruim" },
  { value: "1", label: "1 — Péssimo" },
];

export default async function ReviewListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect(`/entrar`);

  const listing = await fetchListing(params.id, session.accessToken);
  if (!listing) notFound();

  if (listing.reviewStatus !== "can_review") {
    redirect(`/anuncio/${listing.id}`);
  }

  const action = createReviewAction.bind(null, listing.id);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Avaliar anunciante</h1>
        <p className="mt-1 text-sm text-ink-muted">{listing.title}</p>
      </div>

      {searchParams.erro && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.erro}
        </p>
      )}

      <form action={action} className="flex flex-col gap-3">
        <SelectField label="Nota" name="rating" options={RATING_OPTIONS} />
        <TextAreaField label="Comentário (opcional)" name="comment" required={false} />
        <Button type="submit">Enviar avaliação</Button>
      </form>

      <Link href={`/anuncio/${listing.id}`} className="text-sm font-semibold text-brand-blue">
        Cancelar e voltar ao anúncio
      </Link>
    </main>
  );
}
