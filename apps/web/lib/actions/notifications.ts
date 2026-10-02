"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api";

export async function markNotificationReadAction(id: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await markNotificationRead(id, session.accessToken);
  revalidatePath("/conta/notificacoes");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await markAllNotificationsRead(session.accessToken);
  revalidatePath("/conta/notificacoes");
}
