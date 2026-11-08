import { Injectable } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { hashPlate, maskPlate } from "./plate.util";

// Uso só interno do cadastro de anúncio de carro (não há rota pública).
// O perfil público do carro pela placa foi descontinuado em 08/11/2026
// (decisão do Diego, risco jurídico): as tabelas vehicles/vehicle_events/
// vehicle_follows ficam no banco só como registro, sem tela nem rota.

export type ResolveVehicleForListingInput = {
  plate: string;
  ownerUserId: string;
  brandId: string;
  modelId: string;
  yearManufacture?: number;
  yearModel?: number;
  color?: string;
};

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // Chamado na criação de anúncio de veículo quando a placa foi informada.
  // A placa nunca é gravada em texto puro: só o hash (para reconhecer o mesmo
  // carro em outro anúncio) e a versão mascarada. Troca de dono é só
  // detectada aqui (comparando currentOwnerId), nunca declarada pelo usuário.
  async resolveForListing(input: ResolveVehicleForListingInput): Promise<string> {
    const plateHash = hashPlate(input.plate);
    const existing = await this.prisma.vehicle.findUnique({ where: { plateHash } });

    if (!existing) {
      const created = await this.prisma.vehicle.create({
        data: {
          plateHash,
          plateMasked: maskPlate(input.plate),
          brandId: input.brandId,
          modelId: input.modelId,
          yearManufacture: input.yearManufacture,
          yearModel: input.yearModel,
          color: input.color,
          currentOwnerId: input.ownerUserId,
        },
      });
      return created.id;
    }

    if (existing.currentOwnerId && existing.currentOwnerId !== input.ownerUserId) {
      await this.prisma.$transaction([
        this.prisma.vehicleEvent.create({
          data: {
            vehicleId: existing.id,
            type: "ownership_change",
            source: "system",
            title: "Troca de dono",
            occurredAt: new Date(),
            createdByUserId: input.ownerUserId,
          },
        }),
        this.prisma.vehicle.update({
          where: { id: existing.id },
          data: { currentOwnerId: input.ownerUserId },
        }),
      ]);
    }

    return existing.id;
  }

  // Registro interno de que o carro ganhou um anúncio (ver
  // ListingsService.create). Não aparece em tela nem avisa ninguém.
  async logListingPublished(vehicleId: string, userId: string, listingTitle: string): Promise<void> {
    await this.prisma.vehicleEvent.create({
      data: {
        vehicleId,
        type: "listing_published",
        source: "system",
        title: "Anúncio publicado",
        description: listingTitle,
        occurredAt: new Date(),
        createdByUserId: userId,
      },
    });
  }

  // Marca/modelo são texto livre — a primeira pessoa a citar "Fiat Argo" cria
  // as duas linhas do catálogo, as próximas só reaproveitam (busca
  // case-insensitive; connectOrCreate não serve aqui porque a constraint de
  // unicidade do Postgres é case-sensitive). Único lugar que resolve
  // marca/modelo, pra nunca ter duas grafias da mesma marca.
  async resolveBrandAndModel(brandName: string, modelName: string) {
    let brand = await this.prisma.vehicleBrand.findFirst({
      where: { name: { equals: brandName, mode: "insensitive" } },
    });
    if (!brand) {
      try {
        brand = await this.prisma.vehicleBrand.create({ data: { name: brandName } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          brand = await this.prisma.vehicleBrand.findFirstOrThrow({
            where: { name: { equals: brandName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    let model = await this.prisma.vehicleModel.findFirst({
      where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
    });
    if (!model) {
      try {
        model = await this.prisma.vehicleModel.create({ data: { name: modelName, brandId: brand.id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          model = await this.prisma.vehicleModel.findFirstOrThrow({
            where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    return {
      brand: { connect: { id: brand.id } },
      model: { connect: { id: model.id } },
    };
  }
}
