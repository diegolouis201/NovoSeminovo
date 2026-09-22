"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { fetchConversation, sendMessage, startConversation } from "@/lib/api";

export async function startConversationAction(listingId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await startConversation(listingId, session.accessToken);
  if (!result.ok) {
    redirect(`/anuncio/${listingId}?erroConversa=${encodeURIComponent(result.error)}`);
  }
  redirect(`/conta/mensagens/${result.conversationId}`);
}

export async function sendMessageAction(conversationId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await sendMessage(conversationId, body, session.accessToken);
  revalidatePath(`/conta/mensagens/${conversationId}`);
  revalidatePath("/conta/mensagens");
}

// Usado pela página de detalhe para decidir se mostra a conversa ou 404 —
// getDetail já barra quem não participa (ForbiddenException vira undefined).
export async function getMyConversation(conversationId: string) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return fetchConversation(conversationId, session.accessToken);
}
