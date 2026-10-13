import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import type { CreateSavedSearchInput, SavedSearch, SavedSearchFilters } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { buildListingFilterWhere } from "../listings/listings.mapper";

@Injectable()
export class SavedSearchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listMine(userId: string): Promise<SavedSearch[]> {
    const savedSearches = await this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return savedSearches.map(toSavedSearch);
  }

  async create(userId: string, input: CreateSavedSearchInput): Promise<SavedSearch> {
    const savedSearch = await this.prisma.savedSearch.create({
      data: {
        userId,
        type: input.assetType,
        filters: input.filters as unknown as Prisma.InputJsonValue,
      },
    });
    return toSavedSearch(savedSearch);
  }

  async updateAlert(userId: string, id: string, alertEnabled: boolean): Promise<SavedSearch> {
    const savedSearch = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!savedSearch) throw new NotFoundException(`Busca salva ${id} não encontrada`);
    if (savedSearch.userId !== userId) {
      throw new ForbiddenException("Esta busca salva não é sua.");
    }

    const updated = await this.prisma.savedSearch.update({ where: { id }, data: { alertEnabled } });
    return toSavedSearch(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const savedSearch = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!savedSearch) return;
    if (savedSearch.userId !== userId) {
      throw new ForbiddenException("Esta busca salva não é sua.");
    }

    await this.prisma.savedSearch.delete({ where: { id } });
  }

  // Chamado por AdminService.moderateListing quando um anúncio é aprovado:
  // mesma regra de filtro da busca pública (buildListingFilterWhere) decide
  // se o anúncio bateria nos filtros de cada busca salva com alerta ligado
  // — "bateria" é testado perguntando ao banco se o próprio anúncio aparece
  // num findFirst com esses filtros, em vez de reimplementar a comparação
  // em JS.
  async notifyMatches(listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return;

    const candidates = await this.prisma.savedSearch.findMany({
      where: { type: listing.type, alertEnabled: true },
    });

    for (const candidate of candidates) {
      const filters = candidate.filters as SavedSearchFilters;
      const where = buildListingFilterWhere(listing.type, filters);
      const match = await this.prisma.listing.findFirst({ where: { ...where, id: listingId } });
      if (match) {
        await this.notifications.notify(candidate.userId, "saved_search_match", {
          listingId: listing.id,
          listingTitle: listing.title,
        });
      }
    }
  }
}

function toSavedSearch(savedSearch: {
  id: string;
  type: string;
  filters: Prisma.JsonValue;
  alertEnabled: boolean;
  createdAt: Date;
}): SavedSearch {
  return {
    id: savedSearch.id,
    assetType: savedSearch.type as "vehicle" | "property",
    filters: savedSearch.filters as SavedSearchFilters,
    alertEnabled: savedSearch.alertEnabled,
    createdAt: savedSearch.createdAt.toISOString(),
  };
}
