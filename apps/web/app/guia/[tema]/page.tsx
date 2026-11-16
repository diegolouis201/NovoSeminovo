import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, GuideCard, GuideDisclaimer } from "@/components/guias/GuideParts";
import { JsonLd } from "@/components/guias/JsonLd";
import { SITE_URL } from "@/lib/company";
import { GUIDE_TOPICS, findTopic, guidesOfTopic, topicUrl } from "@/lib/guias";

// Só os temas da lista fixa: qualquer outro endereço é 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_TOPICS.map((topic) => ({ tema: topic.slug }));
}

export function generateMetadata({ params }: { params: { tema: string } }): Metadata {
  const topic = findTopic(params.tema);
  if (!topic) return {};
  const title = `${topic.title} | NovoSeminovo`;
  const url = topicUrl(topic.slug);
  return {
    title: { absolute: title },
    description: topic.description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description: topic.description, url },
  };
}

export default function GuideTopicPage({ params }: { params: { tema: string } }) {
  const topic = findTopic(params.tema);
  if (!topic) notFound();
  const guides = guidesOfTopic(topic.slug);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Guias", item: `${SITE_URL}/guia` },
            { "@type": "ListItem", position: 3, name: topic.name, item: `${SITE_URL}${topicUrl(topic.slug)}` },
          ],
        }}
      />
      <Breadcrumbs items={[{ href: "/", label: "Início" }, { href: "/guia", label: "Guias" }, { label: topic.name }]} />
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wide text-brand-green">Guias</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{topic.title}</h1>
        <p className="mt-3 text-base text-ink-muted">{topic.description}</p>
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <GuideCard key={guide.id} guide={guide} />
        ))}
      </ul>
      <div className="mt-10">
        <GuideDisclaimer />
      </div>
    </main>
  );
}
