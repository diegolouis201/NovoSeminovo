"use server";

import { visitorIp } from "@/lib/visitante/ip";
import { ListingContactInputSchema } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { metaTracking } from "@/lib/meta-server";
import { sendListingContact } from "@/lib/api";

// field: qual campo causou o erro, para o formulário ligar a mensagem a ele
// (aria-describedby). Só nomes da lista abaixo, nunca texto vindo de fora.
const CONTACT_FIELDS = ["name", "email", "phone", "message"] as const;
export type ListingContactField = (typeof CONTACT_FIELDS)[number];
export type ListingContactState =
  | { status: "idle" }
  | { status: "sent"; conversationId?: string }
  | { status: "error"; error: string; field?: ListingContactField };

function fieldOf(path: readonly PropertyKey[] | undefined): ListingContactField | undefined {
  const first = path?.[0];
  return CONTACT_FIELDS.find((name) => name === first);
}

// O IP do visitante vai junto (x-client-ip): sem ele a API veria sempre o
// IP do servidor do site e o limite por pessoa viraria um limite geral.

export async function sendListingContactAction(listingId: string, _state: ListingContactState, formData: FormData): Promise<ListingContactState> {
  const parsed = ListingContactInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    wantsSimilar: formData.get("wantsSimilar") === "on",
    site: formData.get("site") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", error: issue?.message ?? "Confira os dados do formulário.", field: fieldOf(issue?.path) };
  }

  const session = await auth();
  const meta = metaTracking("Lead");
  const result = await sendListingContact(listingId, parsed.data, {
    accessToken: session?.accessToken,
    clientIp: visitorIp(),
    extraHeaders: { ...acquisitionHeaders(), ...meta.headers },
  });
  // Pixel só quando a API contou o lead (reenvio em seguida não conta de novo).
  if (result.ok && result.leadCreated) meta.queue();
  return result.ok ? { status: "sent", conversationId: result.conversationId } : { status: "error", error: result.error };
}
