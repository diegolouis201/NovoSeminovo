import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { requestPasswordReset } from "@/lib/api";

export const metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage({ searchParams }: { searchParams: { enviado?: string; erro?: string } }) {
  async function send(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const result = await requestPasswordReset(email);
    if (!result.ok) redirect(`/esqueci-senha?erro=${encodeURIComponent(result.error)}`);
    redirect("/esqueci-senha?enviado=1");
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Esqueci minha senha</h1>

      {searchParams.enviado ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-brand bg-brand-green/10 px-4 py-3 text-sm text-ink">
            Se esse e-mail tiver conta no NovoSeminovo, enviamos um link para criar uma nova senha. Ele vale por 1 hora — confira
            também a caixa de spam.
          </p>
          <Link href="/entrar" className="text-sm font-semibold text-brand-blue">
            ← Voltar para entrar
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-muted">Digite o e-mail da sua conta. Vamos mandar um link para você criar uma nova senha.</p>
          {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
          <form action={send} className="flex flex-col gap-3">
            <FormField label="E-mail" name="email" type="email" />
            <Button type="submit">Enviar link</Button>
          </form>
          <Link href="/entrar" className="text-sm font-semibold text-brand-blue">
            ← Voltar para entrar
          </Link>
        </>
      )}
    </main>
  );
}
