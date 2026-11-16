import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Breadcrumbs, GuideDisclaimer } from "@/components/guias/GuideParts";
import { JsonLd } from "@/components/guias/JsonLd";
import { RichText, plainText } from "@/components/guias/RichText";
import { COMPANY, SITE_URL } from "@/lib/company";
import { GUIDES, findGuide, findTopic, guideUrl, resolveLink, topicUrl, type Guide, type GuideTopic } from "@/lib/guias";

// Só os guias da lista fixa (lib/guias.ts): qualquer outro endereço é 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ tema: guide.topic, slug: guide.slug }));
}

type Params = { params: { tema: string; slug: string } };

export function generateMetadata({ params }: Params): Metadata {
  const guide = findGuide(params.tema, params.slug);
  if (!guide) return {};
  const url = guideUrl(guide);
  return {
    title: { absolute: guide.title },
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.description,
      url,
      publishedTime: guide.publishedAt,
    },
  };
}

function structuredData(guide: Guide, topic: GuideTopic) {
  const url = `${SITE_URL}${guideUrl(guide)}`;
  const publisher = { "@type": "Organization", name: COMPANY.brand, url: SITE_URL, logo: `${SITE_URL}/icon.png` };
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.heading,
      description: guide.description,
      inLanguage: "pt-BR",
      datePublished: guide.publishedAt,
      dateModified: guide.publishedAt,
      mainEntityOfPage: url,
      url,
      author: { "@type": "Organization", name: COMPANY.brand, url: SITE_URL },
      publisher,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: plainText(item.a) },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Guias", item: `${SITE_URL}/guia` },
        { "@type": "ListItem", position: 3, name: topic.name, item: `${SITE_URL}${topicUrl(topic.slug)}` },
        { "@type": "ListItem", position: 4, name: guide.heading, item: url },
      ],
    },
  ];
}

export default function GuidePage({ params }: Params) {
  const guide = findGuide(params.tema, params.slug);
  const topic = guide && findTopic(guide.topic);
  if (!guide || !topic) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      {structuredData(guide, topic).map((data) => (
        <JsonLd key={data["@type"]} data={data} />
      ))}
      <Breadcrumbs
        items={[
          { href: "/", label: "Início" },
          { href: "/guia", label: "Guias" },
          { href: topicUrl(topic.slug), label: topic.name },
        ]}
      />

      <article className="mt-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-green">Guia · {topic.name}</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{guide.heading}</h1>
        </header>

        <div className="mt-6">
          <GuideDisclaimer />
        </div>

        <div className="mt-6 rounded-brand border-l-4 border-brand-green bg-surface-raised p-5 shadow-card">
          <p className="text-base leading-relaxed text-ink">
            <strong className="font-bold">Resposta rápida:</strong> <RichText text={guide.quickAnswer} />
          </p>
        </div>

        {guide.sections.map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="font-display text-2xl font-semibold text-ink">{section.title}</h2>
            {section.kind === "p" ? (
              section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-base leading-relaxed text-ink-muted">
                  <RichText text={paragraph} />
                </p>
              ))
            ) : section.kind === "ol" ? (
              <ol className="mt-4 space-y-3">
                {section.items.map((item, index) => (
                  <li key={item} className="flex gap-3 text-base leading-relaxed text-ink-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green font-display text-sm font-bold text-on-green">
                      {index + 1}
                    </span>
                    <span>
                      <RichText text={item} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-ink-muted marker:text-brand-green">
                {section.items.map((item) => (
                  <li key={item}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-ink">Perguntas frequentes</h2>
          <div className="mt-4 divide-y divide-border rounded-brand border border-border bg-surface-raised">
            {guide.faq.map((item) => (
              <details key={item.q} className="group p-4" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-ink">
                  {item.q}
                  <span className="text-lg text-ink-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-base text-ink-muted">
                  <RichText text={item.a} />
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10 flex flex-col items-start gap-4 rounded-brand bg-surface-sober p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base font-semibold text-ink">{guide.cta.text}</p>
          <Link
            href={guide.cta.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green transition-opacity hover:opacity-90"
          >
            {guide.cta.label}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        </section>

        <nav aria-label="Leia também" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-ink">Leia também</h2>
          <ul className="mt-3 space-y-2">
            {guide.links.map((link) => {
              const { href, label } = resolveLink(link);
              return (
                <li key={href}>
                  <Link href={href} className="font-semibold text-brand-blue hover:underline">
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </article>
    </main>
  );
}
