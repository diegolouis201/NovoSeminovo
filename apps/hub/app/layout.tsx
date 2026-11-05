import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({ src: "../assets/fonts/Fredoka-Variable-latin.woff2", variable: "--font-display", display: "swap" });
const sans = localFont({ src: "../assets/fonts/NunitoSans-Variable-latin.woff2", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "NovoSeminovo Hub", template: "%s · NovoSeminovo Hub" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
