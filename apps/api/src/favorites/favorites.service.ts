import { Injectable, NotFoundException } from "@nestjs/common";
import type { ListingSummary } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { listingInclude, toListingSummary } from "../listings/listings.mapper";

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string): Promise<ListingSummary[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { listing: { include: listingInclude } },
    });
    return favorites.map((favorite) => toListingSummary(favorite.listing));
  }

  async listMineIds(userId: string): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { listingId: true },
    });
    return favorites.map((favorite) => favorite.listingId);
  }

  async add(userId: string, listingId: string): Promise<{ favorited: true }> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);

    await this.prisma.favorite.upsert({
      where: { userId_listingId: { userId, listingId } },
      update: {},
      create: { userId, listingId },
    });
    return { favorited: true };
  }

  async remove(userId: string, listingId: string): Promise<{ favorited: false }> {
    await this.prisma.favorite.deleteMany({ where: { userId, listingId } });
    return { favorited: false };
  }
}
