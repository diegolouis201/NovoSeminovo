import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "@/components/RegisterForm";

export default async function RegisterPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (session?.user) redirect("/conta");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Criar conta</h1>

      <RegisterForm initialError={searchParams.error} />

      <p className="text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-blue">
          Entrar
        </Link>
      </p>
    </main>
  );
}
