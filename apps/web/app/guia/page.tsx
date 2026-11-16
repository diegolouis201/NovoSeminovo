import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, GuideCard, GuideDisclaimer } from "@/components/guias/GuideParts";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/company";
import { GUIDE_TOPICS, guidesOfTopic, topicUrl } from "@/lib/guias";

const TITLE = "Guias para comprar e vender carro e imóvel | NovoSeminovo";
const DESCRIPTION =
  "Guias do NovoSeminovo: como evitar golpe, que documentos separar e o que conferir antes de comprar ou vender carro e imóvel.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/guia" },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: "/guia" },
};

export default function GuiasPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Guias", item: `${SITE_URL}/guia` },
          ],
        }}
      />
      <Breadcrumbs items={[{ href: "/", label: "Início" }, { label: "Guias" }]} />
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wide text-brand-green">Guias</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
          Guias para comprar e vender sem cair em golpe
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          O que conferir, que documentos separar e como pagar com segurança na compra e na venda de carro e imóvel.
        </p>
      </header>

      {GUIDE_TOPICS.map((topic) => (
        <section key={topic.slug} className="mt-10" aria-labelledby={`tema-${topic.slug}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`tema-${topic.slug}`} className="font-display text-2xl font-semibold text-ink">
              {topic.name}
            </h2>
            <Link href={topicUrl(topic.slug)} className="text-sm font-semibold text-brand-blue hover:underline">
              Ver todos de {topic.name.toLowerCase()}
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {guidesOfTopic(topic.slug).map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-10">
        <GuideDisclaimer />
      </div>
    </main>
  );
}
