import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import type { CreateSavedSearchInput, SavedSearch, SavedSearchFilters } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

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
