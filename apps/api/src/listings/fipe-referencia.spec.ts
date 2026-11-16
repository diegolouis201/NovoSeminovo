import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { referenciaFipe } from "@novoseminovo/shared-types";
import { toListingDetail } from "./listings.mapper";

// Guia 1 promete "preço de referência FIPE no anúncio, para você comparar
// antes de ligar". O bloco aparece ao lado do preço quando o anúncio de
// veículo tem FIPE cadastrada; dentro de ±3% é "na média".

describe("referenciaFipe", () => {
  test("sem FIPE, FIPE zero ou negativa: nada", () => {
    assert.equal(referenciaFipe(90000, undefined), undefined);
    assert.equal(referenciaFipe(90000, null), undefined);
    assert.equal(referenciaFipe(90000, 0), undefined);
    assert.equal(referenciaFipe(90000, -10), undefined);
    assert.equal(referenciaFipe(90000, Number.NaN), undefined);
  });

  test("preço abaixo da FIPE: x% abaixo", () => {
    const r = referenciaFipe(90000, 100000)!;
    assert.equal(r.valor, 100000);
    assert.equal(r.valorLabel.replace(/\s/g, " "), "R$ 100.000,00");
    assert.equal(r.situacao, "abaixo");
    assert.equal(r.percentual, 10);
    assert.equal(r.texto, "10% abaixo");
  });

  test("preço acima da FIPE: x% acima", () => {
    const r = referenciaFipe(115000, 100000)!;
    assert.equal(r.situacao, "acima");
    assert.equal(r.texto, "15% acima");
  });

  test("dentro de ±3%: na média (inclusive nos limites)", () => {
    assert.equal(referenciaFipe(94500, 96200)!.texto, "na média");
    assert.equal(referenciaFipe(97000, 100000)!.texto, "na média");
    assert.equal(referenciaFipe(103000, 100000)!.texto, "na média");
    assert.equal(referenciaFipe(100000, 100000)!.situacao, "media");
  });

  test("logo fora de ±3%: arredonda sem virar 3%", () => {
    assert.equal(referenciaFipe(96800, 100000)!.texto, "3,2% abaixo");
    assert.equal(referenciaFipe(103400, 100000)!.texto, "3,4% acima");
  });
});

describe("toListingDetail: fipePrice no anúncio público", () => {
  const base = {
    id: "l1",
    title: "Corolla",
    description: "Carro",
    price: 94500,
    status: "active",
    city: "Belo Horizonte",
    state: "MG",
    neighborhood: null,
    latitude: null,
    longitude: null,
    publishedAt: null,
    highlightedUntil: null,
    tierRank: 0,
    planTier: "free",
    partnerId: null,
    partner: null,
    ownerUserId: "u1",
    owner: { name: "Maria Silva", phone: null, createdAt: new Date() },
    showPhone: false,
    financingEnabled: true,
    videoUrl: null,
    photos: [],
    propertyDetails: null,
  };
  const vehicleDetails = {
    brand: { name: "Toyota" },
    model: { name: "Corolla" },
    yearManufacture: 2020,
    yearModel: 2020,
    transmission: "automatic",
    fuelType: "flex",
    mileage: 42000,
    color: "Prata",
    bodyType: null,
    engine: null,
    steering: null,
    doors: null,
    features: [],
    conditions: [],
    fipeCode: "002061-0",
    fipePrice: { toString: () => "96200" },
  };

  test("veículo com FIPE: fipePrice numérico na resposta", () => {
    const d = toListingDetail({ ...base, type: "vehicle", vehicleDetails } as never, "not_eligible");
    assert.equal(d.fipePrice, 96200);
  });

  test("veículo sem FIPE e imóvel: sem fipePrice", () => {
    const semFipe = toListingDetail({ ...base, type: "vehicle", vehicleDetails: { ...vehicleDetails, fipePrice: null } } as never, "not_eligible");
    assert.equal(semFipe.fipePrice, undefined);
    const imovel = toListingDetail(
      {
        ...base,
        type: "property",
        vehicleDetails: null,
        propertyDetails: { propertyType: "apartment", purpose: "sale", areaM2: 68, totalAreaM2: null, bedrooms: 2, suites: null, bathrooms: 1, parkingSpots: 1, floor: null, condoFee: null, iptu: null, features: [] },
      } as never,
      "not_eligible",
    );
    assert.equal(imovel.fipePrice, undefined);
  });
});
