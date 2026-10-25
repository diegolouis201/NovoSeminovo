"use server";

import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { registerWhatsappClick } from "@/lib/api";

export async function registerWhatsappClickAction(listingId: string): Promise<void> {
  const session = await auth();
  await registerWhatsappClick(listingId, session?.accessToken, acquisitionHeaders());
}
