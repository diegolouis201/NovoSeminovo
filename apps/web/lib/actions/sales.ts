"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  addSalesNote,
  completeSalesOrder,
  addSalesSocio,
  setSocioBirthday,
  assignSalesProspect,
  createSalesMember,
  createSalesProspect,
  moveSalesProspect,
  resendSalesInvite,
  setSalesNextContact,
} from "@/lib/api";

async function token(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar?voltar=/comercial");
  return session.accessToken;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function back(path: string, result: { ok: boolean; error?: string }, success: string): never {
  revalidatePath("/comercial");
  revalidatePath(path);
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${result.ok ? `sucesso=${encodeURIComponent(success)}` : `erro=${encodeURIComponent(result.error ?? "Não foi possível salvar.")}`}`);
}

export async function createProspectAction(formData: FormData): Promise<void> {
  const result = await createSalesProspect(
    {
      name: text(formData, "name"),
      segment: formData.get("segment") === "property" ? "property" : "vehicle",
      cnpj: text(formData, "cnpj"),
      city: text(formData, "city") || undefined,
      state: text(formData, "state"),
      contactName: text(formData, "contactName") || undefined,
      phone: text(formData, "phone"),
      email: text(formData, "email"),
    },
    await token(),
  );
  if (!result.ok) redirect(`/comercial/novo?erro=${encodeURIComponent(result.error)}`);
  revalidatePath("/comercial");
  redirect(`/comercial/${result.value.id}?sucesso=${encodeURIComponent("Empresa adicionada ao quadro.")}`);
}

// Mudar de etapa direto no card do quadro (volta para o mesmo quadro).
export async function quickMoveAction(id: string, returnTo: string, formData: FormData): Promise<void> {
  const stage = text(formData, "stage");
  if (stage === "perdida") redirect(`/comercial/${id}?perder=1`);
  const result = await moveSalesProspect(id, { stage }, await token());
  back(returnTo.startsWith("/comercial") ? returnTo : "/comercial", result, "Etapa atualizada.");
}

export async function moveProspectAction(id: string, formData: FormData): Promise<void> {
  const result = await moveSalesProspect(id, { stage: text(formData, "stage"), lostReason: text(formData, "lostReason") || undefined }, await token());
  back(`/comercial/${id}`, result, "Etapa atualizada.");
}

export async function addNoteAction(id: string, formData: FormData): Promise<void> {
  const result = await addSalesNote(id, text(formData, "body"), await token());
  back(`/comercial/${id}`, result, "Anotação salva.");
}

export async function nextContactAction(id: string, formData: FormData): Promise<void> {
  const raw = text(formData, "at");
  // O campo datetime-local vem sem fuso: horário de Brasília (-03:00).
  const at = raw ? `${raw}:00-03:00` : null;
  const result = await setSalesNextContact(id, at, await token());
  back(`/comercial/${id}`, result, at ? "Próximo contato marcado." : "Próximo contato removido.");
}

export async function assignAction(id: string): Promise<void> {
  const result = await assignSalesProspect(id, await token());
  back(`/comercial/${id}`, result, "Card agora é seu.");
}

// Admin: equipe comercial.
export async function createSalesMemberAction(formData: FormData): Promise<void> {
  const result = await createSalesMember({ name: text(formData, "name"), email: text(formData, "email").toLowerCase() }, await token());
  revalidatePath("/admin/equipe");
  if (!result.ok) redirect(`/admin/equipe?erro=${encodeURIComponent(result.error)}`);
  redirect(`/admin/equipe?sucesso=${encodeURIComponent(`Convite enviado para ${result.value.email}. O link para criar a senha vale 3 dias.`)}`);
}

export async function resendInviteAction(id: string): Promise<void> {
  const result = await resendSalesInvite(id, await token());
  if (!result.ok) redirect(`/admin/equipe?erro=${encodeURIComponent(result.error)}`);
  redirect(`/admin/equipe?sucesso=${encodeURIComponent("Convite reenviado.")}`);
}

export async function socioBirthdayAction(prospectId: string, socioId: string, formData: FormData): Promise<void> {
  const result = await setSocioBirthday(socioId, text(formData, "birthday"), await token());
  back(`/comercial/${prospectId}`, result, "Aniversário salvo.");
}

export async function addSocioAction(prospectId: string, formData: FormData): Promise<void> {
  const result = await addSalesSocio(
    prospectId,
    { name: text(formData, "name"), role: text(formData, "role") || undefined, birthday: text(formData, "birthday") || undefined },
    await token(),
  );
  back(`/comercial/${prospectId}`, result, "Sócio/contato adicionado.");
}

export async function completeOrderAction(id: string, formData: FormData): Promise<void> {
  const result = await completeSalesOrder(id, text(formData, "resultado"), await token());
  back("/comercial", result, "Ordem concluída. O CRM já vê o resultado.");
}
