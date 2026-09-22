import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

function hashPlate(plate: string) {
  return createHash("sha256").update(plate).digest("hex");
}

// Mesma senha para todo mundo do seed — só para dev local, nunca use em
// produção. É a senha que os testes manuais deste projeto sempre usaram.
const DEMO_PASSWORD_HASH = hashSync("senha1234", 10);

async function main() {
  const buyer = await prisma.user.upsert({
    where: { email: "comprador@novoseminovo.com.br" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      name: "Ana Ferreira",
      email: "comprador@novoseminovo.com.br",
      role: "buyer",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const individualSeller = await prisma.user.upsert({
    where: { email: "particular@novoseminovo.com.br" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      name: "Marcos Silva",
      email: "particular@novoseminovo.com.br",
      role: "individual_seller",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const partnerOwner = await prisma.user.upsert({
    where: { email: "loja@novoseminovo.com.br" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      name: "Imobiliária Savassi",
      email: "loja@novoseminovo.com.br",
      role: "partner_owner",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@novoseminovo.com.br" },
    update: { passwordHash: DEMO_PASSWORD_HASH },
    create: {
      name: "Administrador NovoSeminovo",
      email: "admin@novoseminovo.com.br",
      role: "admin",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const plan = await prisma.plan.upsert({
    where: { id: "plan-pro-seed" },
    update: {},
    create: {
      id: "plan-pro-seed",
      name: "Profissional",
      maxActiveListings: 100,
      highlightCredits: 5,
      priceMonth: 199.9,
      features: { destaque_busca: true, crm: true },
    },
  });

  const partner = await prisma.partner.upsert({
    where: { slug: "imobiliaria-savassi" },
    update: {},
    create: {
      ownerUserId: partnerOwner.id,
      type: "real_estate_agency",
      legalName: "Imobiliária Savassi Ltda",
      document: "00.000.000/0001-00",
      verifiedAt: new Date(),
      slug: "imobiliaria-savassi",
      description: "Imóveis residenciais na região Centro-Sul de Belo Horizonte.",
    },
  });

  await prisma.subscription.upsert({
    where: { id: "sub-seed" },
    update: {},
    create: {
      id: "sub-seed",
      partnerId: partner.id,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const toyota = await prisma.vehicleBrand.upsert({
    where: { name: "Toyota" },
    update: {},
    create: { name: "Toyota" },
  });

  const corolla = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: toyota.id, name: "Corolla" } },
    update: {},
    create: { brandId: toyota.id, name: "Corolla" },
  });

  const vehicleListing = await prisma.listing.create({
    data: {
      type: "vehicle",
      ownerUserId: individualSeller.id,
      title: "Corolla XEi 2020",
      description:
        "Corolla XEi 2020, único dono, revisões em concessionária em dia. Vendo por motivo de troca.",
      price: 94500,
      status: "active",
      city: "Belo Horizonte",
      state: "MG",
      neighborhood: "Santo Agostinho",
      publishedAt: new Date(),
      vehicleDetails: {
        create: {
          brandId: toyota.id,
          modelId: corolla.id,
          version: "XEi 2.0",
          yearManufacture: 2020,
          yearModel: 2020,
          mileage: 42000,
          transmission: "automatic",
          fuelType: "flex",
          color: "Prata",
          doors: 4,
          plateHash: hashPlate("ABC1D23"),
          fipeCode: "002061-0",
          fipePrice: 96200,
          condition: "used",
        },
      },
    },
  });

  const propertyListing = await prisma.listing.create({
    data: {
      type: "property",
      ownerUserId: partnerOwner.id,
      partnerId: partner.id,
      title: "Apartamento 2 quartos — Savassi",
      description:
        "Apartamento reformado, 2 quartos (1 suíte), varanda gourmet, 1 vaga. A 5 minutos da Praça da Savassi.",
      price: 520000,
      status: "active",
      city: "Belo Horizonte",
      state: "MG",
      neighborhood: "Savassi",
      publishedAt: new Date(),
      propertyDetails: {
        create: {
          propertyType: "apartment",
          purpose: "sale",
          bedrooms: 2,
          bathrooms: 2,
          parkingSpots: 1,
          areaM2: 68,
          condoFee: 480,
          iptu: 95,
          streetAddress: "Rua Pium-í, Savassi, Belo Horizonte - MG",
        },
      },
    },
  });

  await prisma.favorite.upsert({
    where: { userId_listingId: { userId: buyer.id, listingId: vehicleListing.id } },
    update: {},
    create: { userId: buyer.id, listingId: vehicleListing.id },
  });

  console.log("Seed concluído:", {
    listings: [vehicleListing.id, propertyListing.id],
    login: "qualquer e-mail do seed + senha: senha1234",
    admin: admin.email,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
