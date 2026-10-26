import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";

// "?voltar=/caminho" (ex.: Arquiteto NovoSeminovo, que exige login) — só
// caminho interno, nunca outro site.
function safeReturnPath(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/conta";
}

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; voltar?: string; senha?: string } }) {
  const session = await auth();
  const returnTo = safeReturnPath(searchParams.voltar);
  if (session?.user) redirect(returnTo);

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: safeReturnPath(String(formData.get("voltar") ?? "")),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/entrar?error=1${returnTo !== "/conta" ? `&voltar=${encodeURIComponent(returnTo)}` : ""}`);
      }
      throw error;
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Entrar</h1>

      {searchParams.senha === "nova" && (
        <p className="rounded-brand bg-brand-green/10 px-4 py-3 text-sm text-ink">Senha trocada. Entre com a nova senha.</p>
      )}

      {searchParams.error && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          E-mail ou senha inválidos.
        </p>
      )}

      <form action={authenticate} className="flex flex-col gap-3">
        <input type="hidden" name="voltar" value={returnTo} />
        <FormField label="E-mail" name="email" type="email" />
        <FormField label="Senha" name="password" type="password" />
        <Button type="submit">Entrar</Button>
      </form>

      <Link href="/esqueci-senha" className="-mt-3 text-sm font-semibold text-brand-blue">
        Esqueci minha senha
      </Link>

      <p className="text-sm text-ink-muted">
        Ainda não tem conta?{" "}
        <Link href={returnTo !== "/conta" ? `/cadastro?voltar=${encodeURIComponent(returnTo)}` : "/cadastro"} className="font-semibold text-brand-blue">
          Cadastre-se
        </Link>
      </p>
    </main>
  );
}
