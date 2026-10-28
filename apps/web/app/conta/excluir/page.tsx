import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = { title: "Excluir minha conta — NovoSeminovo", robots: { index: false } };

// Exclusão feita pela própria pessoa, dentro do site e do app (exigência da
// Apple e da Google). A API apaga os dados pessoais e guarda só o que a lei
// manda (pagamentos), ver AdminAccountsService.deleteOwnAccount.
export default async function DeleteAccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar?voltar=/conta/excluir");

  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-ink">
      <Link href="/conta" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Voltar para Minha conta
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">Excluir minha conta</h1>
      <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
        <p>Ao excluir a sua conta:</p>
        <ul className="list-disc pl-5">
          <li>seu nome, e-mail, telefone, CPF e senha são apagados;</li>
          <li>seus anúncios, favoritos, buscas salvas, notificações e conversas dos anúncios saem do site;</li>
          <li>você deixa de receber e-mails e notificações do NovoSeminovo.</li>
        </ul>
        <p>
          Anúncios com plano pago ou financiamento registrado saem do ar, mas o registro do pagamento fica guardado, porque a lei
          obriga. Mais detalhes na{" "}
          <Link href="/privacidade" className="font-semibold text-brand-blue hover:underline">
            Política de privacidade
          </Link>
          .
        </p>
      </div>
      <DeleteAccountForm />
    </main>
  );
}
