import type { Metadata } from "next";
import { Fredoka, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

// Placeholder tipográfico até a Valken Regular (fonte institucional original)
// chegar como arquivo — ver README do design system (Etapa 4).
const display = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "NovoSeminovo — Carros e imóveis, sem enrolação",
  description:
    "Compre e venda carros e imóveis com histórico, chat e simulação de financiamento em um só lugar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans min-h-screen">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
