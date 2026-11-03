import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Área Comercial: equipe de vendas e admin. A API confere de novo (SalesGuard).
export async function salesSession(back: string) {
  const session = await auth();
  if (!session?.user || !session.accessToken) redirect(`/entrar?voltar=${encodeURIComponent(back)}`);
  const allowed = session.user.role === "sales" || session.user.role === "admin";
  return { session, allowed, token: session.accessToken };
}

export function SalesDenied() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Acesso restrito</h1>
      <p className="mt-2 text-sm text-ink-muted">Esta área é só para a equipe comercial do NovoSeminovo.</p>
      <Link href="/conta" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
        Voltar para minha conta
      </Link>
    </main>
  );
}

export function Flash({ sucesso, erro }: { sucesso?: string; erro?: string }) {
  return (
    <>
      {erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{erro}</p>}
      {sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{sucesso}</p>}
    </>
  );
}

export const money = (value?: number) =>
  value === undefined ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const whatsappHref = (phone?: string) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
};
