import { Prisma } from "@novoseminovo/db";
import type { VehicleEvent, VehicleProfile } from "@novoseminovo/shared-types";

const vehicleWithDetails = Prisma.validator<Prisma.VehicleDefaultArgs>()({
  include: {
    brand: true,
    model: true,
    events: {
      orderBy: { occurredAt: "desc" },
      include: { verifiedByPartner: { select: { legalName: true } } },
    },
    // Só anúncios que já foram ao ar: cidade/UF e a foto de capa.
    listings: {
      where: { listing: { status: { in: ["active", "paused", "sold", "expired"] } } },
      select: {
        listing: {
          select: { city: true, state: true, createdAt: true, publishedAt: true, photos: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { url: true } } },
        },
      },
    },
  },
});

export type VehicleWithDetails = Prisma.VehicleGetPayload<typeof vehicleWithDetails>;
export const vehicleInclude = vehicleWithDetails.include;

export function toVehicleEvent(event: VehicleWithDetails["events"][number]): VehicleEvent {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    title: event.title,
    description: event.description ?? undefined,
    mileageAtEvent: event.mileageAtEvent ?? undefined,
    occurredAt: event.occurredAt.toISOString(),
    photos: event.photoUrls,
    verifiedByPartnerName: event.verifiedByPartner?.legalName,
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
    ...anunciosDoCarro(vehicle.listings),
  };
}

// Foto de capa = do anúncio mais recente; cidade/UF de cada anúncio para
// localizar os capítulos do Diário do Carro.
export function anunciosDoCarro(listings: VehicleWithDetails["listings"]): Pick<VehicleProfile, "capaUrl" | "anuncios"> {
  const anuncios = listings
    .map(({ listing }) => ({ publicadoEm: (listing.publishedAt ?? listing.createdAt).toISOString(), cidade: listing.city, uf: listing.state, foto: listing.photos[0]?.url }))
    .sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm));
  const capaUrl = [...anuncios].reverse().find((a) => a.foto)?.foto;
  return { capaUrl, anuncios: anuncios.map(({ foto: _foto, ...a }) => a) };
}
