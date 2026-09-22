import type { BadgeTone } from "@novoseminovo/shared-types";

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-brand-green text-on-green",
  blue: "bg-brand-blue text-on-blue",
  orange: "bg-brand-orange text-on-orange",
  purple: "bg-brand-purple text-on-purple",
  pink: "bg-brand-pink text-on-pink",
};

export function Badge({ label, tone = "green" }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
