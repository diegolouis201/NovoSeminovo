"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markAllNotificationsRead, markNotificationRead, registerPushDevice, removePushDevice } from "@/lib/api";

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

export async function registerPushDeviceAction(token: string, platform: "android" | "ios"): Promise<void> {
  const session = await auth();
  if (!session?.accessToken || typeof token !== "string" || token.length > 4096) return;
  await registerPushDevice(token, platform === "ios" ? "ios" : "android", session.accessToken).catch(() => false);
}

export async function removePushDeviceAction(token: string): Promise<void> {
  if (typeof token !== "string" || token.length > 4096) return;
  await removePushDevice(token).catch(() => false);
}
