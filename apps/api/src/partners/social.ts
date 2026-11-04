import { NotFoundException } from "@nestjs/common";
import type { PartnerSocialInput } from "@novoseminovo/shared-types";
import type { PrismaService } from "../prisma/prisma.service";

export type PartnerSocialView = { instagram?: string; facebook?: string; consentAt?: string };

export const socialView = (p: { instagram: string | null; facebook: string | null; socialConsentAt: Date | null }): PartnerSocialView => ({
  instagram: p.instagram ?? undefined,
  facebook: p.facebook ?? undefined,
  consentAt: p.socialConsentAt?.toISOString(),
});

// Só o dono da empresa informa as redes e autoriza (ou retira a autorização)
// o post de boas-vindas com a logomarca. Marcar a caixinha de novo mantém a
// data da primeira autorização.
export async function savePartnerSocial(prisma: PrismaService, userId: string, input: PartnerSocialInput): Promise<PartnerSocialView> {
  const partner = await prisma.partner.findFirst({
    where: { OR: [{ ownerUserId: userId }, { members: { some: { userId, role: "owner" } } }] },
    select: { id: true, socialConsentAt: true },
  });
  if (!partner) throw new NotFoundException("Você não tem uma loja/imobiliária cadastrada como dono.");
  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: {
      ...(input.instagram !== undefined ? { instagram: input.instagram } : {}),
      ...(input.facebook !== undefined ? { facebook: input.facebook } : {}),
      socialConsentAt: input.consent ? (partner.socialConsentAt ?? new Date()) : null,
    },
    select: { instagram: true, facebook: true, socialConsentAt: true },
  });
  return socialView(updated);
}
