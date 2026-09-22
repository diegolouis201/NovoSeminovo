import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  /** Blocos financeiros/sérios: troca o raio para radius-sober e reduz o peso. Ver README do design system. */
  sober?: boolean;
};

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand-green text-on-green",
  secondary: "bg-brand-blue text-on-blue",
  ghost: "bg-transparent text-ink border border-border",
};

export function Button({ variant = "primary", sober = false, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center gap-2 rounded-brand px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90",
        sober && "rounded-sober font-semibold tracking-wide",
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
