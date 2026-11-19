import type { Metadata } from "next";
import { NPS_TOKEN_RE } from "@novoseminovo/shared-types";
import { COMPANY } from "@/lib/company";
import { NpsSairForm } from "./NpsSairForm";

export const metadata: Metadata = { title: "Não receber mais a pesquisa", robots: { index: false, follow: false } };

// Link "Não quero mais receber esta pesquisa" do e-mail NPS (LGPD). A página
// só mostra o botão; quem descadastra é o clique.
export default function NpsSairPage({ params }: { params: { token: string } }) {
  const token = NPS_TOKEN_RE.test(params.token) ? params.token : "";
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-3 font-display text-2xl font-bold text-ink">Não receber mais a pesquisa</h1>
      <p className="mb-6 text-ink-muted">
        A cada 6 meses o NovoSeminovo pergunta aos parceiros como está a experiência. Clique no botão para não receber mais esta pesquisa por e-mail. Os avisos da sua conta continuam chegando.
      </p>
      {token ? (
        <NpsSairForm token={token} />
      ) : (
        <p role="alert" className="font-semibold text-status-danger">
          Link inválido. Peça a saída pelo WhatsApp {COMPANY.whatsappDisplay} ou pelo e-mail {COMPANY.email}.
        </p>
      )}
    </main>
  );
}
