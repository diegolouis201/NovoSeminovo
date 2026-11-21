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

// Roda com `pnpm db:seed`, manual — nada no deploy chama isto sozinho. Mas
// nada impedia alguém de apontar sem querer pro DATABASE_URL de produção
// (ex.: colar o .env errado) e resetar a senha da conta admin pra
// "senha1234", que está no código-fonte. Trava explícita: ou NODE_ENV não é
// "production", ou quem está rodando confirma de propósito com
// ALLOW_PROD_SEED=1.
function assertNotProduction() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error(
      "Seed bloqueado: NODE_ENV=production. Isto resetaria a senha de contas demo (inclusive admin) pra \"senha1234\". " +
        "Se é mesmo isso que você quer, rode de novo com ALLOW_PROD_SEED=1.",
    );
  }
}

async function main() {
  assertNotProduction();

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
    // CPF de teste (válido, gerado) — anunciar como pessoa física exige CPF.
    update: { passwordHash: DEMO_PASSWORD_HASH, phone: "31988887777", cpf: "52998224725" },
    create: {
      name: "Marcos Silva",
      email: "particular@novoseminovo.com.br",
      phone: "31988887777",
      cpf: "52998224725",
      role: "individual_seller",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const partnerOwner = await prisma.user.upsert({
    where: { email: "loja@novoseminovo.com.br" },
    update: { passwordHash: DEMO_PASSWORD_HASH, phone: "31977776666" },
    create: {
      name: "Imobiliária Savassi",
      email: "loja@novoseminovo.com.br",
      phone: "31977776666",
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

  await prisma.plan.upsert({
    where: { id: "plan-basico-seed" },
    update: {},
    create: {
      id: "plan-basico-seed",
      name: "Básico",
      maxActiveListings: 10,
      highlightCredits: 0,
      priceMonth: 49.9,
      features: { crm: true },
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

  // Vehicle separado do Listing: uso interno (placa só em hash). O perfil
  // público do carro foi descontinuado em 08/11/2026.
  const corollaVehicle = await prisma.vehicle.upsert({
    where: { plateHash: hashPlate("ABC1D23") },
    update: {},
    create: {
      plateHash: hashPlate("ABC1D23"),
      plateMasked: "ABC**23",
      brandId: toyota.id,
      modelId: corolla.id,
      yearManufacture: 2020,
      yearModel: 2020,
      color: "Prata",
      currentOwnerId: individualSeller.id,
    },
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
          vehicleId: corollaVehicle.id,
          fipeCode: "002061-0",
          fipePrice: 96200,
          condition: "used",
        },
      },
    },
  });

  await prisma.vehicleEvent.create({
    data: {
      vehicleId: corollaVehicle.id,
      type: "listing_published",
      source: "system",
      title: "Anúncio publicado",
      description: vehicleListing.title,
      occurredAt: new Date(),
      createdByUserId: individualSeller.id,
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

  // Mais alguns anúncios parecidos — só pra sugestão de preço (ver
  // ListingsService.suggestPrice) ter uma amostra de verdade pra comparar,
  // em vez de ficar sempre "sem dados suficientes" num banco com 1 anúncio
  // de cada tipo.
  for (const [price, mileage] of [
    [89900, 55000],
    [99900, 31000],
  ] as const) {
    await prisma.listing.create({
      data: {
        type: "vehicle",
        ownerUserId: individualSeller.id,
        title: "Corolla XEi 2020",
        description: "Corolla XEi 2020 bem conservado.",
        price,
        status: "active",
        city: "Belo Horizonte",
        state: "MG",
        publishedAt: new Date(),
        vehicleDetails: {
          create: {
            brandId: toyota.id,
            modelId: corolla.id,
            yearManufacture: 2020,
            yearModel: 2020,
            mileage,
            transmission: "automatic",
            fuelType: "flex",
            color: "Prata",
            condition: "used",
          },
        },
      },
    });
  }

  for (const price of [495000, 545000] as const) {
    await prisma.listing.create({
      data: {
        type: "property",
        ownerUserId: partnerOwner.id,
        partnerId: partner.id,
        title: "Apartamento 2 quartos — Savassi",
        description: "Apartamento 2 quartos na região da Savassi.",
        price,
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
            areaM2: 65,
            streetAddress: "Savassi, Belo Horizonte - MG",
          },
        },
      },
    });
  }

  // Vendedores IA (Hub → Vendedores IA): a Nina e duas respostas de exemplo
  // esperando aprovação (dados falsos; o seed nunca roda em produção).
  // Rodar o seed de novo volta as duas para "esperando aprovação".
  const nina = await prisma.salesAgent.upsert({
    where: { slug: "nina" },
    update: {},
    create: { slug: "nina", name: "Nina", active: true, mailbox: "prospeccao", segments: ["property", "broker"], liveSince: new Date() },
  });
  // Caio: lojas de veículos no atendimento@, inativo até o dono ativar no Hub.
  await prisma.salesAgent.upsert({
    where: { slug: "caio" },
    update: {},
    create: { slug: "caio", name: "Caio", active: false, mailbox: "atendimento", segments: ["vehicle"] },
  });
  const exemplos = [
    {
      chave: "seed-vendedores-1",
      nome: "Auto Center Exemplo",
      email: "contato@autocenter-exemplo.com.br",
      assunto: "Re: Estoque da Auto Center Exemplo no NovoSeminovo, 3 meses grátis",
      texto: "Oi, gostei da ideia, mas não tenho tempo de cadastrar carro por carro. <b>Como funciona</b> a importação?",
      rascunho: "Oi! Não precisa cadastrar um por um: se vocês já anunciam em outro site, é só colar o link e a gente organiza o estoque. A nossa equipe ajuda a subir os primeiros carros, vocês só revisam.\n\nComeça por aqui: https://novoseminovo.com.br/para-lojas/comecar?utm_source=prospeccao&utm_medium=email&utm_campaign=nina\n\nNina, assistente comercial da NovoSeminovo",
      objecao: "sem_tempo",
      etapa: "negociacao",
      escalar: null as string | null,
    },
    {
      chave: "seed-vendedores-2",
      nome: "Garagem Modelo Seminovos",
      email: "vendas@garagem-modelo.com.br",
      assunto: "Re: Estoque da Garagem Modelo Seminovos",
      texto: "Topo testar se vocês fizerem 50% de desconto no plano depois dos 3 meses.",
      rascunho: "",
      objecao: "outra",
      etapa: "manter",
      escalar: "desconto" as string | null,
    },
  ];
  for (const e of exemplos) {
    const card = await prisma.salesProspect.upsert({
      where: { googlePlaceId: e.chave },
      update: { salesAgentId: nina.id, stage: "em_contato", optedOutAt: null },
      create: { name: e.nome, segment: "vehicle", city: "Belo Horizonte", state: "MG", email: e.email, source: "mailerfind", campaignTag: "Exemplo vendedores IA", googlePlaceId: e.chave, stage: "em_contato", salesAgentId: nina.id, repliedAt: new Date(), objection: e.objecao },
    });
    const msg = await prisma.prospectMessage.upsert({
      where: { messageId: `<${e.chave}@exemplo.local>` },
      update: {},
      create: { prospectId: card.id, salesAgentId: nina.id, channel: "email", direction: "in", messageId: `<${e.chave}@exemplo.local>`, subject: e.assunto, body: e.texto },
    });
    const dados = { status: e.escalar ? "escalado" : "pendente", replyText: e.rascunho, finalText: null, objection: e.objecao, suggestedStage: e.etapa, escalateReason: e.escalar, decidedAt: null, decidedById: null, sentAt: null, error: null, rejectReason: null };
    await prisma.prospectReplyDraft.upsert({
      where: { inboundId: msg.id },
      update: dados,
      create: { ...dados, prospectId: card.id, salesAgentId: nina.id, inboundId: msg.id, channel: "email", nextFollowupDays: 3, playbookVersion: "seed" },
    });
  }

  // Sequência com falhas do servidor de e-mail (botão "Reenviar falhas
  // temporárias" no Hub, Cypress prospeccao-hub.cy.ts): uma empresa parou
  // com 451 (temporária, pode reenviar) e outra com 550 (permanente, não).
  // Fica PAUSADA (aprovada antes): só envia se alguém ativar. Rodar o seed de
  // novo volta tudo para este estado.
  const passoSeed = [{ assunto: "Teste do seed para {{empresa}}", corpo: "E-mail de exemplo do seed (nunca enviado).", esperaDias: 0 }];
  const seqFalhas =
    (await prisma.prospectSequence.findFirst({ where: { name: "Seed: falhas temporárias" } })) ??
    (await prisma.prospectSequence.create({ data: { name: "Seed: falhas temporárias", status: "pausada", steps: passoSeed, approvedAt: new Date(), approvedById: admin.id } }));
  await prisma.prospectSequence.update({ where: { id: seqFalhas.id }, data: { status: "pausada", steps: passoSeed, approvedAt: new Date(), approvedById: admin.id, salesAgentId: null } });
  const falhas = [
    { chave: "seed-falha-temp-451", nome: "Loja Falha Temporária Seed", email: "falha451@exemplo.local", erro: "Message failed: 451 4.3.0 Error: queue file write error" },
    { chave: "seed-falha-perm-550", nome: "Loja Falha Permanente Seed", email: "falha550@exemplo.local", erro: "Message failed: 550 5.1.1 Recipient address rejected: User unknown" },
  ];
  for (const f of falhas) {
    const card = await prisma.salesProspect.upsert({
      where: { googlePlaceId: f.chave },
      update: { stage: "a_abordar", optedOutAt: null, repliedAt: null, salesAgentId: null },
      create: { name: f.nome, segment: "vehicle", city: "Belo Horizonte", state: "MG", email: f.email, source: "mailerfind", campaignTag: "Exemplo falhas de envio", googlePlaceId: f.chave, stage: "a_abordar" },
    });
    await prisma.prospectEnrollment.deleteMany({ where: { prospectId: card.id } });
    const insc = await prisma.prospectEnrollment.create({ data: { sequenceId: seqFalhas.id, prospectId: card.id, status: "erro", lastError: f.erro, enrolledById: admin.id } });
    await prisma.prospectEmailLog.create({ data: { enrollmentId: insc.id, step: 1, status: "erro", error: f.erro, mailbox: "prospeccao" } });
  }

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
