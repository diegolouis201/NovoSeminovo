import { ConflictException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { forgetUserStatus } from "../auth/jwt-auth.guard";

// Segurança das contas (POP MOD-05).
// - Bloquear: golpe confirmado. A conta fica suspensa (não entra mais, nem
//   com sessão aberta) e os anúncios saem do ar; nada é apagado, para servir
//   de prova e permitir desbloquear se foi engano.
// - Reincidência: 3 recusas em 30 dias ou 2 denúncias procedentes colocam a
//   conta "em revisão": todo anúncio dela vai para a fila humana (a IA não
//   aprova sozinha) até o admin liberar.

export const RECIDIVISM_REJECTIONS = 3;
export const RECIDIVISM_WINDOW_DAYS = 30;
export const RECIDIVISM_REPORTS = 2;

export type HeldAccount = { id: string; name: string; email: string; moderationHoldAt: Date; moderationHoldReason: string | null };

export async function blockAccount(prisma: PrismaService, userId: string, reason: string, adminId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true, blockedAt: true } });
  if (!user) throw new NotFoundException("Conta não encontrada.");
  if (user.role === "admin") throw new ConflictException("Conta de administrador não pode ser bloqueada.");
  // Excluída também fica "suspended": bloquear e desbloquear a reativaria.
  if (user.status === "suspended" && !user.blockedAt) throw new ConflictException("Esta conta já está suspensa ou excluída.");
  const listings = await prisma.listing.findMany({
    where: { ownerUserId: userId, status: { in: ["active", "pending_review"] } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "suspended", blockedAt: new Date(), blockedReason: reason } }),
    prisma.listing.updateMany({ where: { id: { in: listings.map((l) => l.id) } }, data: { status: "paused" } }),
    ...listings.map((l) =>
      prisma.moderationLog.create({ data: { listingId: l.id, adminId, automated: false, action: "suspended", reason: `Conta bloqueada: ${reason}` } }),
    ),
  ]);
  forgetUserStatus(userId);
}

// Desbloquear devolve o acesso; os anúncios continuam pausados (o dono
// reativa ou o admin revisa um a um).
export async function unblockAccount(prisma: PrismaService, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { blockedAt: true } });
  if (!user) throw new NotFoundException("Conta não encontrada.");
  // Conta excluída também fica "suspensa" — essa não volta por aqui.
  if (!user.blockedAt) throw new ConflictException("Esta conta não está bloqueada.");
  await prisma.user.update({ where: { id: userId }, data: { status: "active", blockedAt: null, blockedReason: null } });
  forgetUserStatus(userId);
}

// Confere a regra e marca a conta. Nunca tira a marca sozinho: só o admin.
export async function checkRecidivism(prisma: PrismaService, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - RECIDIVISM_WINDOW_DAYS * 86_400_000);
  let reason: string | null = null;
  const rejections = await prisma.moderationLog.count({
    where: { action: "rejected", createdAt: { gte: since }, listing: { ownerUserId: userId } },
  });
  if (rejections >= RECIDIVISM_REJECTIONS) reason = `${rejections} recusas em ${RECIDIVISM_WINDOW_DAYS} dias`;
  else {
    const reports = await prisma.report.count({ where: { status: "reviewed", listing: { ownerUserId: userId } } });
    if (reports >= RECIDIVISM_REPORTS) reason = `${reports} denúncias procedentes`;
  }
  if (!reason) return false;
  await prisma.user.updateMany({ where: { id: userId, moderationHoldAt: null }, data: { moderationHoldAt: new Date(), moderationHoldReason: reason } });
  return true;
}

export async function clearModerationHold(prisma: PrismaService, userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { moderationHoldAt: null, moderationHoldReason: null } });
}

export async function heldAccounts(prisma: PrismaService): Promise<HeldAccount[]> {
  const rows = await prisma.user.findMany({
    where: { moderationHoldAt: { not: null } },
    select: { id: true, name: true, email: true, moderationHoldAt: true, moderationHoldReason: true },
    orderBy: { moderationHoldAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({ ...r, moderationHoldAt: r.moderationHoldAt! }));
}
