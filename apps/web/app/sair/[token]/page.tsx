import type { Metadata } from "next";
import { SairForm } from "./SairForm";

export const metadata: Metadata = { title: "Sair da lista de e-mails", robots: { index: false, follow: false } };

// Link de saída dos e-mails de prospecção (rodapé "Clique aqui para sair").
// A página só mostra o botão; quem descadastra é o clique.
export default function SairPage({ params }: { params: { token: string } }) {
  const token = /^[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{22}$/.test(params.token) ? params.token : "";
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold text-ink">Sair da lista de e-mails</h1>
      <p className="mb-6 text-ink-muted">
        Você recebeu um convite do NovoSeminovo porque o contato da sua empresa está público no Google Maps. Clique no botão para não receber mais esses e-mails.
      </p>
      {token ? <SairForm token={token} /> : <p role="alert" className="font-semibold text-status-danger">Link inválido. Responda o e-mail com SAIR que a gente tira você da lista.</p>}
    </main>
  );
}
