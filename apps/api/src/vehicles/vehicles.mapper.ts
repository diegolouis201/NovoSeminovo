import { Prisma } from "@novoseminovo/db";
import type { VehicleEvent, VehicleProfile } from "@novoseminovo/shared-types";

const vehicleWithDetails = Prisma.validator<Prisma.VehicleDefaultArgs>()({
  include: {
    brand: true,
    model: true,
    events: { orderBy: { occurredAt: "desc" } },
  },
});

export type VehicleWithDetails = Prisma.VehicleGetPayload<typeof vehicleWithDetails>;
export const vehicleInclude = vehicleWithDetails.include;

function toVehicleEvent(event: VehicleWithDetails["events"][number]): VehicleEvent {
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

export function toVehicleProfile(vehicle: VehicleWithDetails, viewerId: string | undefined): VehicleProfile {
  const ownersCount = vehicle.events.filter((event) => event.type === "ownership_change").length + 1;

  return {
    id: vehicle.id,
    brand: vehicle.brand?.name,
    model: vehicle.model?.name,
    yearManufacture: vehicle.yearManufacture ?? undefined,
    yearModel: vehicle.yearModel ?? undefined,
    color: vehicle.color ?? undefined,
    plateMasked: vehicle.plateMasked ?? undefined,
    ownersCount,
    isOwner: Boolean(viewerId) && viewerId === vehicle.currentOwnerId,
    events: vehicle.events.map(toVehicleEvent),
  };
}
