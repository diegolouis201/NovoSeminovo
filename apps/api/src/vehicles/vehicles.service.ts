import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateVehicleEventInput, VehicleEvent, VehicleProfile } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { hashPlate, maskPlate } from "./plate.util";
import { toVehicleProfile, vehicleInclude } from "./vehicles.mapper";

export type ResolveVehicleForListingInput = {
  plate: string;
  ownerUserId: string;
  brandId: string;
  modelId: string;
  yearManufacture: number;
  yearModel: number;
  color: string;
};

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // Chamado na criação de anúncio de veículo quando a placa foi informada.
  // Mesma placa já vista antes = mesmo Vehicle (o histórico persiste entre
  // anúncios e donos); placa nova = Vehicle novo. Troca de dono é só
  // detectada aqui (comparando currentOwnerId), nunca declarada pelo
  // próprio usuário — ver CreateVehicleEventInputSchema.
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

  // Disparado depois que o anúncio é criado de verdade (ver
  // ListingsService.create) — registra no histórico do carro que um novo
  // anúncio foi publicado, pra quem olhar o Passaporte Digital ver que o
  // carro voltou ao mercado.
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

  async getProfile(vehicleId: string, viewerId: string | undefined): Promise<VehicleProfile> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: vehicleInclude,
    });
    if (!vehicle) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    return toVehicleProfile(vehicle, viewerId);
  }

  // Só o dono atual pode registrar um evento — sem isso, qualquer pessoa
  // logada poderia inflar (ou sujar) o histórico de um carro que não é dela.
  async addEvent(vehicleId: string, userId: string, input: CreateVehicleEventInput): Promise<VehicleEvent> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    if (vehicle.currentOwnerId !== userId) {
      throw new ForbiddenException("Só o dono atual pode adicionar um evento ao histórico deste veículo.");
    }

    const event = await this.prisma.vehicleEvent.create({
      data: {
        vehicleId,
        type: input.type,
        source: "owner_reported",
        title: input.title,
        description: input.description,
        mileageAtEvent: input.mileageAtEvent,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        createdByUserId: userId,
      },
    });

    return {
      id: event.id,
      type: event.type,
      source: event.source,
      title: event.title,
      description: event.description ?? undefined,
      mileageAtEvent: event.mileageAtEvent ?? undefined,
      occurredAt: event.occurredAt.toISOString(),
    };
  }
}
