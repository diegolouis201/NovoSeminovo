"use server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN = /^[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{22}$/;

export type SairState = { ok?: boolean; erro?: string };

// "Não quero receber mais" dos e-mails de prospecção do NovoSeminovo. Só o
// clique no botão descadastra (leitores de e-mail abrem links sozinhos).
export async function sairDaProspeccaoAction(_prev: SairState, formData: FormData): Promise<SairState> {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) return { erro: "Link inválido. Responda o e-mail com SAIR que a gente tira você da lista." };
  const res = await fetch(`${API_URL}/prospeccao/sair/${token}`, { method: "POST", cache: "no-store" }).catch(() => undefined);
  if (!res) return { erro: "Não foi possível falar com o servidor. Tente de novo ou responda o e-mail com SAIR." };
  if (!res.ok) return { erro: "Link inválido. Responda o e-mail com SAIR que a gente tira você da lista." };
  return { ok: true };
}
