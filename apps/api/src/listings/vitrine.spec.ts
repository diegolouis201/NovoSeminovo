import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { vitrineDoAnuncio } from "@novoseminovo/shared-types";

// Vitrine do carro / do imóvel: o que vai no card (Instagram, story) e no
// cartaz para imprimir. Só dados que o próprio anunciante pôs no anúncio.

const base = { id: "l1", title: "Corolla XEi 2020", priceLabel: "R$ 98.900,00", location: "Recife, PE", photos: [{ id: "p1", url: "/uploads/capa.jpg" }] };

describe("vitrineDoAnuncio", () => {
  test("carro: Vitrine do carro, À VENDA, preço, ano, km, câmbio, combustível, cidade e foto de capa", () => {
    const v = vitrineDoAnuncio({
      ...base,
      assetType: "vehicle",
      specs: [
        { label: "Marca / Modelo", value: "Toyota Corolla" },
        { label: "Ano", value: "2019/2020" },
        { label: "Câmbio", value: "Automático" },
        { label: "Combustível", value: "Flex" },
        { label: "Quilometragem", value: "61.000 km" },
        { label: "Cor", value: "Prata" },
      ],
    });
    assert.equal(v.selo, "Vitrine do carro");
    assert.equal(v.chamada, "À VENDA");
    assert.equal(v.titulo, "Corolla XEi 2020");
    assert.equal(v.preco, "R$ 98.900,00");
    assert.deepEqual(v.dados, ["2019/2020", "61.000 km", "Automático", "Flex"]);
    assert.equal(v.local, "Recife, PE");
    assert.equal(v.foto, "/uploads/capa.jpg");
  });

  test("imóvel à venda: Vitrine do imóvel, VENDE-SE, tipo, área, quartos e vagas", () => {
    const v = vitrineDoAnuncio({
      ...base,
      title: "Apartamento 3 quartos no Centro",
      assetType: "property",
      finalidade: "venda",
      specs: [
        { label: "Tipo", value: "Apartamento" },
        { label: "Área", value: "92 m²" },
        { label: "Quartos", value: "3" },
        { label: "Banheiros", value: "2" },
        { label: "Vagas", value: "1" },
      ],
    });
    assert.equal(v.selo, "Vitrine do imóvel");
    assert.equal(v.chamada, "VENDE-SE");
    assert.deepEqual(v.dados, ["Apartamento", "92 m²", "3 quartos", "1 vaga"]);
  });

  test("imóvel para alugar: ALUGA-SE e preço por mês", () => {
    const v = vitrineDoAnuncio({ ...base, assetType: "property", finalidade: "aluguel", specs: [{ label: "Quartos", value: "1" }, { label: "Vagas", value: "2" }] });
    assert.equal(v.chamada, "ALUGA-SE");
    assert.equal(v.preco, "R$ 98.900,00/mês");
    assert.deepEqual(v.dados, ["1 quarto", "2 vagas"]);
  });

  test("sem foto e sem dados: não inventa nada", () => {
    const v = vitrineDoAnuncio({ ...base, photos: [], assetType: "vehicle", specs: [] });
    assert.equal(v.foto, undefined);
    assert.deepEqual(v.dados, []);
  });
});
