import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadSimple, Printer, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { vitrineDoAnuncio } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchListing } from "@/lib/api";
import { SITE_URL } from "@/lib/company";

export const metadata: Metadata = { title: "Vitrine — NovoSeminovo", robots: { index: false } };

// Vitrine do carro / do imóvel: o anúncio em imagem para mandar no WhatsApp,
// postar no Instagram (feed e story) e imprimir para colar no vidro do carro
// ou no portão. O QR leva de volta ao anúncio.
export default async function VitrinePage({ params }: { params: { id: string } }) {
  const session = await auth();
  const anuncio = await fetchListing(params.id, session?.accessToken);
  if (!anuncio) notFound();
  const v = vitrineDoAnuncio(anuncio);
  const link = `${SITE_URL}/anuncio/${anuncio.id}`;
  const base = `/anuncio/${anuncio.id}/vitrine`;
  const formatos = [
    { id: "card", nome: "Instagram e WhatsApp", medida: "1080 × 1350", classe: "aspect-[4/5]" },
    { id: "story", nome: "Story", medida: "1080 × 1920", classe: "aspect-[9/16]" },
    { id: "cartaz", nome: "Cartaz para imprimir (A4)", medida: "folha A4", classe: "aspect-[210/297]" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href={`/anuncio/${anuncio.id}`} className="text-sm font-semibold text-brand-blue hover:underline">
        ← Voltar ao anúncio
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">{v.selo}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Mande no WhatsApp, poste no Instagram ou imprima o cartaz e cole no {anuncio.assetType === "vehicle" ? "vidro do carro" : "portão ou na janela"}. Os cards digitais levam o link do anúncio; no cartaz impresso, quem
        apontar a câmera para o QR cai direto no anúncio.
      </p>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${v.titulo} por ${v.preco}. Veja no NovoSeminovo: ${link}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-brand bg-brand-green px-5 text-sm font-bold text-on-green hover:opacity-90"
      >
        <WhatsappLogo size={18} weight="bold" /> Mandar no WhatsApp
      </a>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {formatos.map((f) => (
          <section key={f.id} className="flex flex-col rounded-brand border border-border bg-surface-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${f.id}`} alt={`${v.selo}: ${f.nome}`} className={`w-full rounded-brand border border-border object-cover ${f.classe}`} />
            <h2 className="mt-3 font-display text-base font-semibold text-ink">{f.nome}</h2>
            <p className="text-xs text-ink-muted">{f.medida}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`${base}/${f.id}`}
                download={`vitrine-${f.id}-${anuncio.id}.png`}
                className="flex h-10 items-center gap-1.5 rounded-brand border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-sober"
              >
                <DownloadSimple size={16} weight="bold" /> Baixar
              </a>
              {f.id === "cartaz" && (
                <a
                  href={`${base}/imprimir`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-brand bg-brand-blue px-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Printer size={16} weight="bold" /> Imprimir
                </a>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
