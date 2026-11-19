import type { Metadata } from "next";
import Link from "next/link";
import { NPS_TOKEN_RE, type NpsEmailClickResult } from "@novoseminovo/shared-types";
import { COMPANY } from "@/lib/company";
import { NpsFollowUpForm } from "./NpsFollowUpForm";

export const metadata: Metadata = { title: "Pesquisa de satisfação", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Nota clicada no e-mail da pesquisa NPS (sem login). A nota é gravada ao
// abrir a página; clicar de novo em outra nota em até 7 dias troca a nota.
async function registrar(token: string): Promise<NpsEmailClickResult | undefined> {
  if (!NPS_TOKEN_RE.test(token)) return { status: "invalido" };
  const res = await fetch(`${API_URL}/nps/clique`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  }).catch(() => undefined);
  if (!res) return undefined;
  if (res.status === 400) return { status: "invalido" };
  if (!res.ok) return undefined;
  return (await res.json()) as NpsEmailClickResult;
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-3 font-display text-2xl font-bold text-ink">{titulo}</h1>
      <div className="space-y-3 text-ink-muted">{children}</div>
      <p className="mt-8">
        <Link href="/" className="font-semibold text-brand-blue underline">
          Ir para o NovoSeminovo
        </Link>
      </p>
    </main>
  );
}

export default async function NpsNotaPage({ params }: { params: { token: string } }) {
  const r = await registrar(params.token);
  if (!r) {
    return (
      <Aviso titulo="Não deu para registrar agora">
        <p>O nosso servidor não respondeu. Tente clicar na nota do e-mail de novo daqui a pouco.</p>
      </Aviso>
    );
  }
  if (r.status === "invalido") {
    return (
      <Aviso titulo="Link inválido">
        <p>Este link não está completo. Abra o e-mail da pesquisa e clique na nota de novo.</p>
      </Aviso>
    );
  }
  if (r.status === "expirado") {
    return (
      <Aviso titulo="Esta pesquisa já fechou">
        <p>O link deste e-mail venceu. Obrigado mesmo assim!</p>
        <p>
          Quer contar algo para a nossa equipe? Fale com a gente pelo WhatsApp {COMPANY.whatsappDisplay}.
        </p>
      </Aviso>
    );
  }
  if (r.status === "ja_respondida") {
    return (
      <Aviso titulo="Você já respondeu esta pesquisa">
        <p>A sua nota foi {r.score}. Obrigado por responder!</p>
      </Aviso>
    );
  }
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      {r.teste ? (
        <p className="mb-6 rounded-brand border border-border bg-surface-sober px-4 py-3 text-sm text-ink">E-mail de teste: esta nota não conta no NPS.</p>
      ) : null}
      <h1 className="font-display text-2xl font-bold text-ink">Recebemos a sua nota: {r.score}</h1>
      <p className="mb-8 mt-2 text-sm text-ink-muted">Clicou na nota errada? Volte ao e-mail e clique na certa: dá para trocar por 7 dias.</p>
      <NpsFollowUpForm token={r.followToken} faixa={r.faixa} comment={r.comment} wantsContact={r.wantsContact} />
    </main>
  );
}
