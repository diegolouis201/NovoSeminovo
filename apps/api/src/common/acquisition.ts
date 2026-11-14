import type { Request } from "express";
import type { PrismaService } from "../prisma/prisma.service";
import { ACQUISITION_HEADER, parseAcquisition, type Acquisition } from "@novoseminovo/shared-types";

// Origem do visitante (google, instagram, afiliado…) que o site repassa no
// header ACQUISITION_HEADER a partir do cookie dele. Valor inválido = sem origem.
export function acquisitionFrom(request: Request): Acquisition | undefined {
  const raw = request.headers[ACQUISITION_HEADER];
  return parseAcquisition(Array.isArray(raw) ? raw[0] : raw);
}

export type AcquisitionColumns = {
  acqSource?: string;
  acqMedium?: string;
  acqCampaign?: string;
  acqContent?: string;
  acqTerm?: string;
  acqClickId?: string;
};

// Colunas acq* de quem guarda a origem completa (User, SalesProspect).
export function acquisitionFields(origin: Acquisition | undefined): AcquisitionColumns {
  if (!origin) return {};
  const fields: AcquisitionColumns = {
    acqSource: origin.source,
    acqMedium: origin.medium,
    acqCampaign: origin.campaign,
    acqContent: origin.content,
    acqTerm: origin.term,
    acqClickId: origin.clickId,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as AcquisitionColumns;
}

// Origem gravada no lead: a da visita atual; sem ela, a do cadastro de quem
// pediu o contato.
export async function leadOrigin(
  prisma: PrismaService,
  buyerId: string | undefined,
  acquisition: Acquisition | undefined,
): Promise<{ acqSource?: string; acqCampaign?: string; acqContent?: string }> {
  if (acquisition && acquisition.source !== "direto") return { acqSource: acquisition.source, acqCampaign: acquisition.campaign, acqContent: acquisition.content };
  const buyer = buyerId ? await prisma.user.findUnique({ where: { id: buyerId }, select: { acqSource: true, acqCampaign: true, acqContent: true } }) : null;
  if (buyer?.acqSource) return { acqSource: buyer.acqSource, acqCampaign: buyer.acqCampaign ?? undefined, acqContent: buyer.acqContent ?? undefined };
  return acquisition ? { acqSource: acquisition.source } : {};
}
