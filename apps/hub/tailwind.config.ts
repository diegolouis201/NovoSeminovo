import type { Config } from "tailwindcss";

// Cores da marca NovoSeminovo (mesmas do painel do CRM no computador).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0E2F4A",
        "navy-2": "#13395A",
        blue: "#006AA4",
        orange: "#F18E29",
        green: "#76B82A",
        cream: "#FAF8F3",
        ink: "#0B1C2C",
        muted: "#5B6B7A",
        line: "#E4E0D6",
        danger: "#C2410C",
      },
      fontFamily: { display: ["var(--font-display)"], sans: ["var(--font-sans)"] },
    },
  },
  plugins: [],
};

export default config;
