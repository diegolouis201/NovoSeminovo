import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Exclusão de dados — NovoSeminovo",
  description: "Como pedir a exclusão dos seus dados pessoais do NovoSeminovo, inclusive das conversas pelo WhatsApp.",
};

// Página própria pra "URL de instruções de exclusão de dados" que a Meta exige
// no app do WhatsApp (ela não aceita âncora "#" nem o mesmo link da política).
// Mesmo conteúdo da seção 8 de /privacidade — mudou lá, mude aqui.
export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-ink [&_li]:mt-1 [&_p]:mt-3">
      <h1 className="font-display text-3xl font-semibold">Como pedir a exclusão dos seus dados</h1>
      <p>
        Você pode pedir a exclusão dos dados pessoais que o {COMPANY.brand} guarda sobre você — cadastro, anúncios,
        mensagens e conversas com o assistente, inclusive as feitas pelo WhatsApp.
      </p>
      <ol className="mt-3 list-decimal pl-5">
        <li>
          Envie uma mensagem pelo WhatsApp{" "}
          <a href={COMPANY.whatsappLink} className="font-semibold text-brand-blue hover:underline">
            {COMPANY.whatsappDisplay}
          </a>{" "}
          ou pelo e-mail{" "}
          <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand-blue hover:underline">
            {COMPANY.email}
          </a>{" "}
          com o assunto “Exclusão de dados”.
        </li>
        <li>Informe o e-mail da sua conta ou o telefone usado no atendimento.</li>
        <li>
          Respondemos em até 15 dias e confirmamos quando a exclusão for concluída — exceto os dados que a lei nos obriga
          a manter.
        </li>
      </ol>
      <p>
        Mais detalhes na{" "}
        <Link href="/privacidade" className="font-semibold text-brand-blue hover:underline">
          Política de Privacidade
        </Link>
        . {COMPANY.legalName} — CNPJ {COMPANY.cnpj}.
      </p>
    </main>
  );
}
