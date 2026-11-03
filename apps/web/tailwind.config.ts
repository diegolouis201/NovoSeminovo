import type { Config } from "tailwindcss";

// Os nomes e valores abaixo espelham packages "design-system" (Etapa 4):
// https://claude.ai/artifact/CSeA1cBYwztNm288vfMK28 — mude os tokens lá
// e replique aqui, nunca o contrário.
//
// A escala numérica padrão do Tailwind já bate com a escala space-1..space-8
// do design system: space-1=4px→p-1, space-2=8px→p-2, space-3=12px→p-3,
// space-4=16px→p-4, space-5=24px→p-6, space-6=32px→p-8, space-7=48px→p-12,
// space-8=64px→p-16. Use as classes numéricas do Tailwind normalmente.

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "surface-page": "var(--surface-page)",
        "surface-raised": "var(--surface-raised)",
        "surface-sober": "var(--surface-sober)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        border: "var(--border)",
        "brand-green": "var(--brand-green)",
        "brand-blue": "var(--brand-blue)",
        "brand-orange": "var(--brand-orange)",
        "brand-purple": "var(--brand-purple)",
        "brand-pink": "var(--brand-pink)",
        "on-green": "var(--on-green)",
        "on-blue": "var(--on-blue)",
        "on-orange": "var(--on-orange)",
        "on-purple": "var(--on-purple)",
        "on-pink": "var(--on-pink)",
        "status-danger": "var(--status-danger)",
      },
      borderRadius: {
        sober: "var(--radius-sober)",
        brand: "var(--radius-md)",
        "brand-lg": "var(--radius-lg)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};

export default config;
