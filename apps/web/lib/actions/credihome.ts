"use server";

import { headers } from "next/headers";
import { visitorIp } from "@/lib/visitante/ip";
import type { CredihomeProposalInput, CredihomeSimulateInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import { metaTracking } from "@/lib/meta-server";
import { requestCredihomeProposal, simulateCredihome } from "@/lib/api";

// Mesmo motivo de lib/actions/agents.ts: a API precisa do IP do visitante,
// não do servidor do site, pro limite por pessoa.

export async function simulateCredihomeAction(listingId: string, input: CredihomeSimulateInput) {
  return simulateCredihome(listingId, input, visitorIp());
}

export async function requestCredihomeProposalAction(listingId: string, input: CredihomeProposalInput) {
  // Logado: o pedido fica ligado à conta da pessoa.
  const session = await auth();
  const meta = metaTracking("Lead", "imovel");
  const extraHeaders: Record<string, string> = { ...acquisitionHeaders(), ...meta.headers };
  if (session?.accessToken) extraHeaders.Authorization = `Bearer ${session.accessToken}`;
  const result = await requestCredihomeProposal(listingId, input, {
    clientIp: visitorIp(),
    // Navegador de quem aceitou a autorização (registro do aceite na API).
    userAgent: headers().get("user-agent") ?? undefined,
    extraHeaders,
  });
  if (result.ok && result.outcome !== "already_sent") meta.queue();
  return result;
}
