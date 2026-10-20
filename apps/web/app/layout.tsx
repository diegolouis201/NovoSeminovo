import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AgentChatWidget } from "@/components/AgentChatWidget";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

// Placeholder tipográfico até a Valken Regular (fonte institucional original)
// chegar como arquivo — ver README do design system (Etapa 4). Arquivos
// hospedados localmente (em vez de next/font/google) de propósito: next/font
// baixa a fonte do Google *durante o build*, e essa rede falhando (já
// aconteceu — ver DEPLOY.md) derruba o build inteiro sem mensagem de erro
// clara. Self-hosted remove essa dependência de rede do build.
const display = localFont({
  src: "../assets/fonts/Fredoka-Variable-latin.woff2",
  weight: "500 700",
  variable: "--font-display",
  display: "swap",
});

const sans = localFont({
  src: "../assets/fonts/NunitoSans-Variable-latin.woff2",
  weight: "400 800",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NovoSeminovo — Carros e imóveis, sem enrolação",
  description:
    "Compre e venda carros e imóveis com histórico, chat e simulação de financiamento em um só lugar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <AgentChatWidget />
      </body>
    </html>
  );
}
