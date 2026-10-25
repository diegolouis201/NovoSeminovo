import type { Request } from "express";
import type { PrismaService } from "../prisma/prisma.service";
import { ACQUISITION_HEADER, parseAcquisition, type Acquisition } from "@novoseminovo/shared-types";

// Origem do visitante (google, instagram, afiliado…) que o site repassa no
// header ACQUISITION_HEADER a partir do cookie dele. Valor inválido = sem origem.
export function acquisitionFrom(request: Request): Acquisition | undefined {
  const raw = request.headers[ACQUISITION_HEADER];
  return parseAcquisition(Array.isArray(raw) ? raw[0] : raw);
}

// Origem gravada no lead: a da visita atual; sem ela, a do cadastro de quem
// pediu o contato.
export async function leadOrigin(
  prisma: PrismaService,
  buyerId: string | undefined,
  acquisition: Acquisition | undefined,
): Promise<{ acqSource?: string; acqCampaign?: string }> {
  if (acquisition && acquisition.source !== "direto") return { acqSource: acquisition.source, acqCampaign: acquisition.campaign };
  const buyer = buyerId ? await prisma.user.findUnique({ where: { id: buyerId }, select: { acqSource: true, acqCampaign: true } }) : null;
  if (buyer?.acqSource) return { acqSource: buyer.acqSource, acqCampaign: buyer.acqCampaign ?? undefined };
  return acquisition ? { acqSource: acquisition.source } : {};
}
