import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { TextAreaField } from "@/components/FormField";
import { fetchListing } from "@/lib/api";
import { createReportAction } from "@/lib/actions/reports";

export default async function ReportListingPage({
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

  const action = createReportAction.bind(null, listing.id);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Denunciar anúncio</h1>
        <p className="mt-1 text-sm text-ink-muted">{listing.title}</p>
      </div>

      {searchParams.erro && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.erro}
        </p>
      )}

      <form action={action} className="flex flex-col gap-3">
        <TextAreaField label="O que há de errado com este anúncio?" name="reason" minLength={10} />
        <Button type="submit">Enviar denúncia</Button>
      </form>

      <Link href={`/anuncio/${listing.id}`} className="text-sm font-semibold text-brand-blue">
        Cancelar e voltar ao anúncio
      </Link>
    </main>
  );
}
