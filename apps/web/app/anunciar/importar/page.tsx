import Link from "next/link";
import { redirect } from "next/navigation";
import { allowedAssetTypes } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { ImportFromUrl } from "@/components/ImportFromUrl";
import { fetchAiStatus, fetchMyPartner } from "@/lib/api";

export const metadata = { title: "Importar anúncio de outro site" };

// Importar pelo link: a pessoa cola o link do anúncio dela em outro site e o
// passo a passo abre preenchido (ver ListingImportService na API).
export default async function ImportListingPage() {
  const session = await auth();
  if (!session?.accessToken) redirect(`/entrar?voltar=${encodeURIComponent("/anunciar/importar")}`);
  const [{ aiEnabled }, partner] = await Promise.all([fetchAiStatus(), fetchMyPartner(session.accessToken)]);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/anunciar" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Anunciar
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Importar anúncio de outro site</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Já anuncia na OLX, Webmotors, ZAP, VivaReal, iCarros, Mercado Livre ou em outro site? Cole o link: a gente lê o anúncio, organiza
        tudo no padrão do NovoSeminovo e você só revisa antes de publicar.
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        Site não deixou ler (Webmotors, por exemplo)? Use a{" "}
        <Link href="/extensao" className="font-semibold text-brand-blue hover:underline">
          extensão do NovoSeminovo para o Chrome
        </Link>
        : texto e fotos em um clique.
      </p>
      {aiEnabled ? (
        <ImportFromUrl allowed={allowedAssetTypes(partner?.type)} />
      ) : (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          A importação está indisponível no momento.{" "}
          <Link href="/anunciar" className="font-semibold underline">
            Cadastre pelo passo a passo
          </Link>
          .
        </p>
      )}
    </main>
  );
}
