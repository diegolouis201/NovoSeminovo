"use server";

import { headers } from "next/headers";
import type { CredihomeProposalInput, CredihomeSimulateInput } from "@novoseminovo/shared-types";
import { acquisitionHeaders } from "@/lib/acquisition";
import { requestCredihomeProposal, simulateCredihome } from "@/lib/api";

// Mesmo motivo de lib/actions/agents.ts: a API precisa do IP do visitante,
// não do servidor do site, pro limite por pessoa.
function visitorIp(): string | undefined {
  const forwarded = headers().get("x-forwarded-for") ?? headers().get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export async function simulateCredihomeAction(listingId: string, input: CredihomeSimulateInput) {
  return simulateCredihome(listingId, input, visitorIp());
}

export async function requestCredihomeProposalAction(listingId: string, input: CredihomeProposalInput) {
  return requestCredihomeProposal(listingId, input, { clientIp: visitorIp(), extraHeaders: acquisitionHeaders() });
}
