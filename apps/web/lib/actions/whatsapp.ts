"use server";

import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { metaTracking } from "@/lib/meta-server";
import { registerWhatsappClick } from "@/lib/api";

export async function registerWhatsappClickAction(listingId: string): Promise<void> {
  const session = await auth();
  const meta = metaTracking("Lead");
  const result = await registerWhatsappClick(listingId, session?.accessToken, { ...acquisitionHeaders(), ...meta.headers });
  // Só o primeiro clique da pessoa num anúncio de loja vira lead.
  if (result.leadCreated) meta.queue();
}
