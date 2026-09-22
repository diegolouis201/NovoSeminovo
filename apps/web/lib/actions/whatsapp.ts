"use server";

import { auth } from "@/auth";
import { registerWhatsappClick } from "@/lib/api";

export async function registerWhatsappClickAction(listingId: string): Promise<void> {
  const session = await auth();
  await registerWhatsappClick(listingId, session?.accessToken);
}
