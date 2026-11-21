import { notFound } from "next/navigation";
import { GUIDE_OG_SIZE, guideOgImage } from "@/lib/og/guide-card";
import { GUIDES, findGuide, findTopic } from "@/lib/guias";

export const alt = "Guia do NovoSeminovo";
export const size = GUIDE_OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ tema: guide.topic, slug: guide.slug }));
}

export default function Image({ params }: { params: { tema: string; slug: string } }) {
  const guide = findGuide(params.tema, params.slug);
  const topic = guide && findTopic(guide.topic);
  if (!guide || !topic) notFound();
  return guideOgImage({ eyebrow: `Guia · ${topic.name}`, title: guide.heading });
}
