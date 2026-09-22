import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default async function RegisterPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (session?.user) redirect("/conta");

  async function register(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      redirect(`/cadastro?error=${encodeURIComponent(body.message ?? "Não foi possível criar a conta.")}`);
    }

    try {
      await signIn("credentials", { email, password, redirectTo: "/conta" });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect("/entrar");
      }
      throw error;
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Criar conta</h1>

      {searchParams.error && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      <form action={register} className="flex flex-col gap-3">
        <FormField label="Nome" name="name" />
        <FormField label="E-mail" name="email" type="email" />
        <FormField label="Senha" name="password" type="password" />
        <Button type="submit">Criar conta</Button>
      </form>

      <p className="text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-blue">
          Entrar
        </Link>
      </p>
    </main>
  );
}
