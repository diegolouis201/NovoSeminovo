"use server";

import { headers } from "next/headers";
import { ListingContactInputSchema } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { sendListingContact } from "@/lib/api";

export type ListingContactState = { status: "idle" } | { status: "sent"; conversationId?: string } | { status: "error"; error: string };

// O IP do visitante vai junto (x-client-ip): sem ele a API veria sempre o
// IP do servidor do site e o limite por pessoa viraria um limite geral.
function visitorIp(): string | undefined {
  const forwarded = headers().get("x-forwarded-for") ?? headers().get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export async function sendListingContactAction(listingId: string, _state: ListingContactState, formData: FormData): Promise<ListingContactState> {
  const parsed = ListingContactInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    wantsSimilar: formData.get("wantsSimilar") === "on",
    site: formData.get("site") || undefined,
  });
  if (!parsed.success) return { status: "error", error: parsed.error.issues[0]?.message ?? "Confira os dados do formulário." };

  const session = await auth();
  const result = await sendListingContact(listingId, parsed.data, {
    accessToken: session?.accessToken,
    clientIp: visitorIp(),
    extraHeaders: acquisitionHeaders(),
  });
  return result.ok ? { status: "sent", conversationId: result.conversationId } : { status: "error", error: result.error };
}
