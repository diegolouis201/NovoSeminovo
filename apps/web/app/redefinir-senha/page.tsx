import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { resetPassword } from "@/lib/api";

export const metadata = { title: "Criar nova senha" };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string; erro?: string } }) {
  const token = searchParams.token ?? "";

  async function save(formData: FormData) {
    "use server";
    const tokenValue = String(formData.get("token") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const back = (message: string) => redirect(`/redefinir-senha?token=${encodeURIComponent(tokenValue)}&erro=${encodeURIComponent(message)}`);
    if (password.length < 8) back("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) back("As duas senhas não são iguais.");
    const result = await resetPassword(tokenValue, password);
    if (!result.ok) back(result.error);
    redirect("/entrar?senha=nova");
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Criar nova senha</h1>
      {!token ? (
        <p className="text-sm text-ink-muted">
          Link incompleto. Abra o link do e-mail de novo ou peça outro em{" "}
          <Link href="/esqueci-senha" className="font-semibold text-brand-blue">
            Esqueci minha senha
          </Link>
          .
        </p>
      ) : (
        <>
          {searchParams.erro && (
            <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
              {searchParams.erro}{" "}
              {searchParams.erro.includes("expirou") && (
                <Link href="/esqueci-senha" className="font-semibold underline">
                  Pedir novo link
                </Link>
              )}
            </p>
          )}
          <form action={save} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <FormField label="Nova senha (mínimo 8 caracteres)" name="password" type="password" />
            <FormField label="Repita a nova senha" name="confirm" type="password" />
            <Button type="submit">Salvar nova senha</Button>
          </form>
          <p className="text-xs text-ink-muted">Ao salvar, as sessões abertas em outros aparelhos são encerradas.</p>
        </>
      )}
    </main>
  );
}
