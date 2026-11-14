"use server";

import { headers } from "next/headers";
import type { CreditasProposalFormInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { metaTracking } from "@/lib/meta-server";
import { requestCreditasProposal } from "@/lib/api";

// Mesmo motivo de lib/actions/credihome.ts: a API precisa do IP (e aqui
// também do navegador) do visitante, não do servidor do site — vão para a
// autorização BACEN da Creditas.
function visitorIp(): string | undefined {
  const forwarded = headers().get("x-forwarded-for") ?? headers().get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export async function requestCreditasProposalAction(listingId: string, input: CreditasProposalFormInput) {
  const session = await auth();
  const meta = metaTracking("Lead", "veiculo");
  const extraHeaders: Record<string, string> = { ...acquisitionHeaders(), ...meta.headers };
  if (session?.accessToken) extraHeaders.Authorization = `Bearer ${session.accessToken}`;
  const result = await requestCreditasProposal(listingId, input, {
    clientIp: visitorIp(),
    userAgent: headers().get("user-agent") ?? undefined,
    extraHeaders,
  });
  if (result.ok && result.outcome !== "already_sent") meta.queue();
  return result;
}
