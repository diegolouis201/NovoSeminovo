import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { compare } from "bcryptjs";
import type { AdminDeleteInput, AdminUserProfile } from "@novoseminovo/shared-types";
import { getPhotoStorage } from "../common/storage";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MAX_FAILS = 5;
const SUBSCRIPTION_IN_EFFECT = ["active", "past_due"] as const;
export const DELETED_EMAIL_DOMAIN = "removido.invalid";

function maskCpf(cpf: string | null): string | undefined {
  return cpf && cpf.length === 11 ? `***.${cpf.slice(3, 6)}.***-${cpf.slice(9)}` : undefined;
}

// Ações de admin sobre pessoas e lojas: página de visualização e exclusões.
// Excluir sempre pede a senha do próprio admin (confirmação de quem está no
// teclado) e um motivo, e nunca apaga registro financeiro: anúncio com
// pagamento ou negócio registrado só pode ser suspenso; conta excluída é
// anonimizada (LGPD) e os pagamentos dela continuam guardados.
@Injectable()
export class AdminAccountsService {
  private readonly logger = new Logger(AdminAccountsService.name);
  private readonly failedPasswords = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async profile(userId: string): Promise<AdminUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedPartners: {
          take: 1,
          include: { subscriptions: { orderBy: { currentPeriodEnd: "desc" }, take: 1, include: { plan: { select: { name: true } } } } },
        },
        affiliate: { select: { status: true } },
      },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    const partner = user.ownedPartners[0];
    const [grouped, views, conversations, partnerLeads, favoritesGiven, contact] = await Promise.all([
      this.prisma.listing.groupBy({ by: ["type", "status"], where: { ownerUserId: userId }, _count: { _all: true } }),
      this.prisma.listing.aggregate({ where: { ownerUserId: userId }, _sum: { viewsCount: true } }),
      this.prisma.conversation.count({ where: { listing: { ownerUserId: userId } } }),
      partner ? this.prisma.lead.count({ where: { partnerId: partner.id } }) : Promise.resolve(0),
      this.prisma.favorite.count({ where: { userId } }),
      this.prisma.marketingContact.findUnique({ where: { userId }, select: { consent: true, status: true } }),
    ]);
    const blocked = await this.deleteBlockedReason(user.id, user.role);
    const subscription = partner?.subscriptions[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
      cpfMasked: maskCpf(user.cpf),
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      emailVerified: Boolean(user.emailVerifiedAt),
      acqSource: user.acqSource ?? undefined,
      deleted: user.email.endsWith(`@${DELETED_EMAIL_DOMAIN}`),
      partner: partner
        ? {
            id: partner.id,
            legalName: partner.legalName,
            type: partner.type,
            document: partner.document,
            slug: partner.slug,
            verified: Boolean(partner.verifiedAt),
            createdAt: partner.createdAt.toISOString(),
            subscription: subscription
              ? { plan: subscription.plan.name, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd.toISOString() }
              : undefined,
          }
        : undefined,
      stats: {
        listingsByStatus: grouped.map((row) => ({ assetType: row.type, status: row.status, count: row._count._all })),
        views: views._sum.viewsCount ?? 0,
        conversations,
        partnerLeads,
        favoritesGiven,
      },
      marketingConsent: contact ? (contact.status === "active" ? contact.consent : contact.status) : undefined,
      affiliateStatus: user.affiliate?.status,
      canDelete: !blocked,
      deleteBlockedReason: blocked,
    };
  }

  // ---------------- Excluir anúncio ----------------

  async deleteListing(adminId: string, listingId: string, input: AdminDeleteInput): Promise<{ deleted: true }> {
    await this.checkPassword(adminId, input.password);
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: { select: { url: true } }, _count: { select: { financingDeals: true } } },
    });
    if (!listing) throw new NotFoundException("Anúncio não encontrado");
    const blocked = await this.listingDeleteBlocked(listing.id, listing._count.financingDeals);
    if (blocked) throw new ConflictException(blocked);
    await this.removeListingRows(listing.id);
    await this.removePhotoFiles(listing.photos.map((photo) => photo.url));
    this.logger.log(`Admin ${adminId} excluiu o anúncio ${listing.id}. Motivo: ${input.reason}`);
    await this.prisma.opsReport.create({
      data: { agent: `admin:${adminId}`, kind: "exclusao_anuncio", body: `Anúncio ${listing.id} ("${listing.title}") excluído. Motivo: ${input.reason}` },
    });
    await this.notifications.notify(listing.ownerUserId, "listing_removed", { listingTitle: listing.title, reason: input.reason }).catch(() => undefined);
    return { deleted: true };
  }

  // ---------------- Excluir conta ----------------

  async deleteAccount(adminId: string, userId: string, input: AdminDeleteInput): Promise<{ deleted: true; listingsDeleted: number; listingsKept: number }> {
    await this.checkPassword(adminId, input.password);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    if (user.id === adminId) throw new ForbiddenException("Você não pode excluir a sua própria conta por aqui.");
    if (user.email.endsWith(`@${DELETED_EMAIL_DOMAIN}`)) throw new ConflictException("Esta conta já foi excluída.");
    const blocked = await this.deleteBlockedReason(user.id, user.role);
    if (blocked) throw new ConflictException(blocked);

    // Anúncios: apaga os que não têm registro financeiro; os outros saem do ar e ficam guardados.
    const listings = await this.prisma.listing.findMany({
      where: { ownerUserId: userId },
      include: { photos: { select: { url: true } }, _count: { select: { financingDeals: true } } },
    });
    let listingsDeleted = 0;
    let listingsKept = 0;
    const files: string[] = [];
    for (const listing of listings) {
      if (await this.listingDeleteBlocked(listing.id, listing._count.financingDeals)) {
        await this.prisma.listing.update({ where: { id: listing.id }, data: { status: "paused", highlightedUntil: null } });
        listingsKept += 1;
      } else {
        await this.removeListingRows(listing.id);
        files.push(...listing.photos.map((photo) => photo.url));
        listingsDeleted += 1;
      }
    }

    // Dados pessoais saem; o id fica para os registros que a lei manda guardar (pagamentos, notas).
    await this.prisma.$transaction([
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.savedSearch.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.marketingContact.deleteMany({ where: { userId } }),
      this.prisma.affiliate.updateMany({ where: { userId }, data: { status: "suspended", pixKey: "", audience: null } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: "Conta excluída",
          email: `excluida-${userId}@${DELETED_EMAIL_DOMAIN}`,
          phone: null,
          cpf: null,
          passwordHash: null,
          avatarUrl: null,
          gender: null,
          birthDate: null,
          zipCode: null,
          state: null,
          city: null,
          emailVerificationCode: null,
          status: "suspended",
        },
      }),
    ]);
    await this.removePhotoFiles(files);
    this.logger.log(`Admin ${adminId} excluiu a conta ${userId}. Motivo: ${input.reason}`);
    await this.prisma.opsReport.create({
      data: {
        agent: `admin:${adminId}`,
        kind: "exclusao_conta",
        body: `Conta ${userId} excluída (dados pessoais apagados). Anúncios apagados: ${listingsDeleted}; guardados fora do ar por terem pagamento: ${listingsKept}. Motivo: ${input.reason}`,
      },
    });
    return { deleted: true, listingsDeleted, listingsKept };
  }

  // ---------------- Regras ----------------

  private async deleteBlockedReason(userId: string, role: string): Promise<string | undefined> {
    if (role === "admin") return "Contas de administrador não podem ser excluídas por aqui.";
    const subscription = await this.prisma.subscription.findFirst({
      where: { partner: { ownerUserId: userId }, status: { in: [...SUBSCRIPTION_IN_EFFECT] } },
      select: { id: true },
    });
    if (subscription) return "A loja tem assinatura em vigor. Cancele a assinatura antes de excluir a conta, senão o cartão continua sendo cobrado.";
    const available = await this.prisma.affiliateCommission.count({ where: { affiliate: { userId }, status: "available" } });
    if (available) return "Esta pessoa tem comissões de afiliado disponíveis para pagar. Pague ou cancele antes de excluir a conta.";
    return undefined;
  }

  private async listingDeleteBlocked(listingId: string, financingDeals: number): Promise<string | undefined> {
    if (financingDeals) return "Este anúncio tem negócio de financiamento registrado. Registros financeiros precisam ser guardados: use Suspender.";
    const paid = await this.prisma.listingBoostPurchase.count({ where: { listingId, status: "paid" } });
    if (paid) return "Este anúncio tem plano ou destaque pago. Registros financeiros precisam ser guardados: use Suspender.";
    return undefined;
  }

  // Apaga o anúncio e o que só existe por causa dele; leads e pedidos de
  // financiamento (que são da loja e do comprador) perdem só o vínculo.
  private async removeListingRows(listingId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversation: { listingId } } }),
      this.prisma.conversation.deleteMany({ where: { listingId } }),
      this.prisma.favorite.deleteMany({ where: { listingId } }),
      this.prisma.report.deleteMany({ where: { listingId } }),
      this.prisma.financingSimulation.deleteMany({ where: { listingId } }),
      this.prisma.moderationLog.deleteMany({ where: { listingId } }),
      this.prisma.review.updateMany({ where: { listingId }, data: { listingId: null } }),
      this.prisma.lead.updateMany({ where: { listingId }, data: { listingId: null } }),
      this.prisma.financingLead.updateMany({ where: { listingId }, data: { listingId: null } }),
      this.prisma.listing.delete({ where: { id: listingId } }),
    ]);
  }

  private async removePhotoFiles(urls: string[]): Promise<void> {
    const storage = getPhotoStorage();
    for (const url of urls) await storage.remove(url).catch(() => undefined);
  }

  // Confirma que quem clicou é mesmo o admin logado. 5 erros em 15 min bloqueiam por um tempo.
  private async checkPassword(adminId: string, password: string): Promise<void> {
    const now = Date.now();
    const fails = (this.failedPasswords.get(adminId) ?? []).filter((at) => now - at < PASSWORD_WINDOW_MS);
    if (fails.length >= PASSWORD_MAX_FAILS) throw new ForbiddenException("Muitas tentativas com senha errada. Espere 15 minutos.");
    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { passwordHash: true, role: true } });
    if (!admin || admin.role !== "admin") throw new ForbiddenException("Só administradores podem excluir.");
    if (!admin.passwordHash) throw new BadRequestException("Sua conta não tem senha cadastrada; crie uma senha em Meus dados.");
    if (!(await compare(password, admin.passwordHash))) {
      fails.push(now);
      this.failedPasswords.set(adminId, fails);
      throw new UnauthorizedException("Senha incorreta.");
    }
    this.failedPasswords.delete(adminId);
  }
}
