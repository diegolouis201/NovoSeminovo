import { ConflictException } from "@nestjs/common";
import { importSourceKey } from "@novoseminovo/shared-types";
import type { PrismaService } from "../prisma/prisma.service";

// Anúncio importado de outro site (ver importSourceKey): o mesmo anúncio não
// entra duas vezes — nem pela mesma pessoa, nem por outra conta (pode ser
// alguém copiando o anúncio de quem é dono). Vendido, recusado ou expirado
// não conta: dá para anunciar de novo.
const STATUSES_THAT_BLOCK = ["draft", "pending_review", "active", "paused"] as const;

export async function assertNotImportedYet(prisma: PrismaService, userId: string, url: string | undefined) {
  const key = url ? importSourceKey(url) : undefined;
  if (!key) return undefined;
  const existing = await prisma.listing.findFirst({
    where: { importSource: key.source, importSourceId: key.id, status: { in: [...STATUSES_THAT_BLOCK] } },
    select: { id: true, title: true, ownerUserId: true, partner: { select: { ownerUserId: true, members: { select: { userId: true } } } } },
  });
  if (!existing) return key;
  const sameTeam =
    existing.ownerUserId === userId ||
    existing.partner?.ownerUserId === userId ||
    Boolean(existing.partner?.members.some((member) => member.userId === userId));
  throw new ConflictException(
    sameTeam
      ? `Você já trouxe este anúncio para o NovoSeminovo ("${existing.title}"). Edite o que já está em Meus anúncios.`
      : "Este anúncio já foi trazido para o NovoSeminovo por outra conta. Se ele é seu, fale com a gente pela página Contato.",
  );
}
