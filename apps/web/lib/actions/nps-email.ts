"use server";

import { NpsEmailFollowUpSchema, NPS_TOKEN_RE } from "@novoseminovo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type NpsFollowUpState = { ok?: boolean; erro?: string };

// Resposta opcional da página /nps/r/:token (comentário e "quer contato").
// Validado aqui (zod) e de novo na API.
export async function responderNpsAction(_prev: NpsFollowUpState, formData: FormData): Promise<NpsFollowUpState> {
  const contato = formData.get("wantsContact");
  const parsed = NpsEmailFollowUpSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    comment: String(formData.get("comment") ?? ""),
    wantsContact: contato === "sim" ? true : contato === "nao" ? false : undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira o texto e tente de novo." };
  const res = await fetch(`${API_URL}/nps/acompanhamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  }).catch(() => undefined);
  if (!res) return { erro: "Não foi possível falar com o servidor. Tente de novo em instantes." };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { erro: typeof body.message === "string" ? body.message.slice(0, 200) : "Não foi possível enviar. Tente de novo." };
  }
  return { ok: true };
}

export type NpsSairState = { ok?: boolean; erro?: string };

// "Não quero mais receber esta pesquisa" (LGPD). Só o clique no botão
// descadastra: leitores de e-mail abrem links sozinhos.
export async function sairDoNpsAction(_prev: NpsSairState, formData: FormData): Promise<NpsSairState> {
  const token = String(formData.get("token") ?? "");
  if (!NPS_TOKEN_RE.test(token)) return { erro: "Link inválido." };
  const res = await fetch(`${API_URL}/nps/sair/${token}`, { method: "POST", cache: "no-store" }).catch(() => undefined);
  if (!res) return { erro: "Não foi possível falar com o servidor. Tente de novo em instantes." };
  if (!res.ok) return { erro: "Link inválido." };
  return { ok: true };
}
