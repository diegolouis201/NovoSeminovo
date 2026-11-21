import { notFound } from "next/navigation";
import { GUIDE_OG_SIZE, guideOgImage } from "@/lib/og/guide-card";
import { GUIDE_TOPICS, findTopic } from "@/lib/guias";

export const alt = "Guias do NovoSeminovo";
export const size = GUIDE_OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return GUIDE_TOPICS.map((topic) => ({ tema: topic.slug }));
}

export default function Image({ params }: { params: { tema: string } }) {
  const topic = findTopic(params.tema);
  if (!topic) notFound();
  return guideOgImage({ eyebrow: "Guias NovoSeminovo", title: topic.title });
}
