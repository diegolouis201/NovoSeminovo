"use server";

import { headers } from "next/headers";
import { acquisitionHeaders } from "@/lib/acquisition";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type NewsletterState = { ok?: boolean; error?: string };

// Formulário de novidades do rodapé: grava o contato com permissão (opt-in)
// e a origem do visitante. O IP vai junto para o limite de tentativas da API.
export async function newsletterAction(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const forwarded = headers().get("x-forwarded-for");
  const res = await fetch(`${API_URL}/marketing/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...acquisitionHeaders(), ...(forwarded ? { "x-forwarded-for": forwarded } : {}) },
    body: JSON.stringify({
      email: String(formData.get("email") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim() || undefined,
      interest: String(formData.get("interest") ?? "geral"),
      consent: formData.get("consent") === "1",
    }),
  }).catch(() => undefined);
  if (!res) return { error: "Não foi possível falar com o servidor. Tente de novo." };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { error: body.message ?? "Não foi possível cadastrar agora." };
  }
  return { ok: true };
}
