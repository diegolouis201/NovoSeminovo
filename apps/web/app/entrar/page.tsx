import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (session?.user) redirect("/conta");

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/conta",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect("/entrar?error=1");
      }
      throw error;
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Entrar</h1>

      {searchParams.error && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          E-mail ou senha inválidos.
        </p>
      )}

      <form action={authenticate} className="flex flex-col gap-3">
        <FormField label="E-mail" name="email" type="email" />
        <FormField label="Senha" name="password" type="password" />
        <Button type="submit">Entrar</Button>
      </form>

      <p className="text-sm text-ink-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-brand-blue">
          Cadastre-se
        </Link>
      </p>
    </main>
  );
}
