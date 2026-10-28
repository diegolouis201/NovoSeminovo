import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL } from "@/lib/company";
import { auth } from "@/auth";
import { AgentChatWidget } from "@/components/AgentChatWidget";
import { NativeAppBridge } from "@/components/NativeAppBridge";
import { AppTabBar } from "@/components/AppTabBar";
import { Analytics } from "@/components/Analytics";
import { AttributionCapture } from "@/components/AttributionCapture";
import { ReferralCapture } from "@/components/ReferralCapture";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { VerticalProvider } from "@/components/ActiveVertical";

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

const DESCRIPTION =
  "Compre e venda carros e imóveis com histórico, chat e simulação de financiamento em um só lugar.";

// Padrão de todas as páginas: cada página pode sobrescrever o título (o
// template põe " | NovoSeminovo" no fim) e a prévia de compartilhamento.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "NovoSeminovo — Carros e imóveis, sem enrolação", template: "%s | NovoSeminovo" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "NovoSeminovo",
    title: "NovoSeminovo — Carros e imóveis, sem enrolação",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  // Verificação do domínio no Meta Business (portfólio NovoSeminovo) — exigida
  // pra verificação da empresa e o WhatsApp oficial. Não é segredo.
  other: { "facebook-domain-verification": "dy47jl5g0uy0nh6mrv5clp6wlpy100" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Dentro do app do celular (mobile/capacitor.config.ts, appendUserAgent).
  const inApp = /NovoSeminovoApp/.test(headers().get("user-agent") ?? "");

  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <VerticalProvider>
          <SiteHeader />
          <div className="flex-1">{children}</div>
        </VerticalProvider>
        <SiteFooter />
        {/* Espaço para o menu fixo do app não cobrir o fim da página. */}
        {inApp && <div aria-hidden className="h-16 shrink-0" />}
        <Analytics />
        {/* Link de afiliado (?ref=) e origem da visita — useSearchParams pede Suspense no layout. */}
        <Suspense fallback={null}>
          <ReferralCapture />
          <AttributionCapture />
        </Suspense>
        <NativeAppBridge isLoggedIn={Boolean(session?.accessToken)} />
        {inApp && <AppTabBar />}
        <AgentChatWidget isLoggedIn={Boolean(session?.accessToken)} isAdmin={session?.user?.role === "admin"} inApp={inApp} />
      </body>
    </html>
  );
}
