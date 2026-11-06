import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { historiaDoCarro, type VehicleProfile } from "@novoseminovo/shared-types";

// Diário do Carro (fase 1): a linha do tempo do Passaporte vira capítulos
// por dono, com selos que só aparecem com prova.

type Ev = VehicleProfile["events"][number];
const ev = (p: Partial<Ev> & Pick<Ev, "type" | "occurredAt">): Ev => ({ id: Math.random().toString(36).slice(2), source: "owner_reported", title: p.type, photos: ["/uploads/x.jpg"], ...p });
const perfil = (events: Ev[], anuncios: VehicleProfile["anuncios"] = []): VehicleProfile => ({ id: "v1", brand: "VW", model: "T-Cross", yearModel: 2024, color: "Cinza", plateMasked: "SYU**91", ownersCount: 1 + events.filter((e) => e.type === "ownership_change").length, isOwner: false, events, anuncios, seguidores: 0, seguindo: false });
const agora = new Date("2026-11-06T12:00:00Z");

describe("historiaDoCarro", () => {
  test("separa em capítulos por troca de dono, do mais antigo ao atual, com km e cidade", () => {
    const h = historiaDoCarro(
      perfil(
        [
          ev({ type: "listing_published", occurredAt: "2026-10-19T10:00:00Z", source: "system", mileageAtEvent: 38000 }),
          ev({ type: "ownership_change", occurredAt: "2026-10-19T09:00:00Z", source: "system" }),
          ev({ type: "revision", occurredAt: "2025-03-10T10:00:00Z", mileageAtEvent: 10000 }),
          ev({ type: "listing_published", occurredAt: "2024-03-01T10:00:00Z", source: "system", mileageAtEvent: 0 }),
        ],
        [
          { publicadoEm: "2024-03-01T10:00:00Z", cidade: "Salvador", uf: "BA" },
          { publicadoEm: "2026-10-19T10:00:00Z", cidade: "Recife", uf: "PE" },
        ],
      ),
      agora,
    );
    assert.equal(h.capitulos.length, 2);
    assert.equal(h.capitulos[0].numero, 1);
    assert.equal(h.capitulos[0].inicio, "2024-03-01T10:00:00Z");
    assert.equal(h.capitulos[0].fim, "2026-10-19T09:00:00Z");
    assert.equal(h.capitulos[0].cidade, "Salvador/BA");
    assert.deepEqual([h.capitulos[0].kmInicio, h.capitulos[0].kmFim], [0, 10000]);
    assert.equal(h.capitulos[0].eventos.length, 2);
    assert.equal(h.capitulos[1].atual, true);
    assert.equal(h.capitulos[1].cidade, "Recife/PE");
    assert.equal(h.capitulos[1].eventos[0].type, "ownership_change", "o capítulo novo abre com a troca de dono");
    assert.equal(h.kmAtual, 38000);
    assert.equal(h.subtitulo, "2 donos · 38.000 km");
  });

  test("selos só com prova: revisão com comprovante, oficina que confirmou, km coerente, mesmo dono há tempo", () => {
    const h = historiaDoCarro(
      perfil([
        ev({ type: "revision", occurredAt: "2026-06-01T10:00:00Z", mileageAtEvent: 30000, source: "partner_verified", verifiedByPartnerName: "Oficina X" }),
        ev({ type: "revision", occurredAt: "2025-06-01T10:00:00Z", mileageAtEvent: 15000 }),
        ev({ type: "listing_published", occurredAt: "2024-01-01T10:00:00Z", source: "system", mileageAtEvent: 0 }),
      ]),
      agora,
    );
    assert.deepEqual(h.selos.map((s) => s.id).sort(), ["km_coerente", "mesmo_dono", "oficina_verificada", "revisoes_comprovadas"]);
    assert.match(h.selos.find((s) => s.id === "mesmo_dono")!.nome, /2 anos/);
    assert.equal(h.alertas.length, 0);
  });

  test("sem prova não tem selo; km que volta para trás vira alerta", () => {
    const h = historiaDoCarro(
      perfil([
        ev({ type: "repair", occurredAt: "2026-09-01T10:00:00Z", mileageAtEvent: 20000 }),
        ev({ type: "revision", occurredAt: "2026-05-01T10:00:00Z", mileageAtEvent: 25000, photos: [] }),
        ev({ type: "listing_published", occurredAt: "2026-04-01T10:00:00Z", source: "system" }),
      ]),
      agora,
    );
    assert.deepEqual(h.selos.map((s) => s.id), [], "revisão sem foto não conta; dono há 7 meses não ganha selo");
    assert.equal(h.alertas.length, 1);
    assert.match(h.alertas[0], /25\.000 km.*20\.000 km/);
    assert.equal(h.subtitulo, "1 dono · 20.000 km");
  });

  test("carro sem eventos: um capítulo vazio e subtítulo só com donos", () => {
    const h = historiaDoCarro(perfil([]), agora);
    assert.equal(h.capitulos.length, 1);
    assert.equal(h.capitulos[0].eventos.length, 0);
    assert.equal(h.kmAtual, undefined);
    assert.equal(h.subtitulo, "1 dono");
  });
});

describe("anunciosDoCarro (capa e cidades do Passaporte)", () => {
  const { anunciosDoCarro } = require("./vehicles.mapper") as typeof import("./vehicles.mapper");
  test("capa vem do anúncio mais recente com foto; cidades em ordem de publicação", () => {
    const l = (city: string, state: string, iso: string, url?: string) => ({ listing: { city, state, createdAt: new Date(iso), publishedAt: null, photos: url ? [{ url }] : [] } });
    const r = anunciosDoCarro([l("Recife", "PE", "2026-10-19T10:00:00Z"), l("Salvador", "BA", "2024-03-01T10:00:00Z", "/uploads/a.jpg")] as never);
    assert.equal(r.capaUrl, "/uploads/a.jpg");
    assert.deepEqual(r.anuncios, [
      { publicadoEm: "2024-03-01T10:00:00.000Z", cidade: "Salvador", uf: "BA" },
      { publicadoEm: "2026-10-19T10:00:00.000Z", cidade: "Recife", uf: "PE" },
    ]);
  });
});

describe("Diário do Carro fase 2: carta do dono", () => {
  test("carta do dono fica no capítulo dele, fora da lista de eventos; momento não vira selo", () => {
    const h = historiaDoCarro(
      perfil([
        ev({ type: "ownership_change", occurredAt: "2026-01-10T10:00:00Z", source: "system" }),
        ev({ type: "letter", occurredAt: "2025-12-20T10:00:00Z", title: "Carta para o próximo dono", description: "Cuide bem dele.", photos: [] }),
        ev({ type: "moment", occurredAt: "2025-06-01T10:00:00Z", title: "Viagem para a Chapada", mileageAtEvent: 20000 }),
        ev({ type: "listing_published", occurredAt: "2024-01-01T10:00:00Z", source: "system", mileageAtEvent: 0 }),
      ]),
      agora,
    );
    assert.equal(h.capitulos[0].carta?.description, "Cuide bem dele.");
    assert.ok(!h.capitulos[0].eventos.some((e) => e.type === "letter"));
    assert.equal(h.capitulos[0].eventos.length, 2);
    assert.equal(h.capitulos[1].carta, undefined);
    assert.ok(!h.selos.some((s) => s.id === "revisoes_comprovadas"), "momento não é revisão");
  });
});
