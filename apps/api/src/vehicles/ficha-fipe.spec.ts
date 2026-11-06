import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Ficha técnica (com o que temos hoje): dados da Tabela FIPE da versão e do
// ano escolhidos. Servidor FIPE falso, sem internet.

describe("Ficha pela FIPE (servidor falso)", () => {
  let server: Server;
  let fipe: import("./fipe.service").FipeService;
  const pedidos: string[] = [];

  before(async () => {
    server = createServer((req, res) => {
      pedidos.push(req.url ?? "");
      const json = (body: unknown) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (req.url === "/marcas") return json([{ codigo: "59", nome: "VW - VolksWagen" }]);
      if (req.url === "/marcas/59/modelos/9999/anos") return json([{ codigo: "2024-1", nome: "2024 Gasolina" }, { codigo: "2023-1", nome: "2023 Gasolina" }]);
      if (req.url === "/marcas/59/modelos/9999/anos/2024-1")
        return json({ TipoVeiculo: 1, Valor: "R$ 151.234,00", Marca: "VW - VolksWagen", Modelo: "T-Cross Highline 250 TSI 1.4 Flex Aut.", AnoModelo: 2024, Combustivel: "Gasolina", CodigoFipe: "005501-7", MesReferencia: "novembro de 2026 ", SiglaCombustivel: "G" });
      res.writeHead(404).end();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    process.env.FIPE_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const mod = require("./fipe.service") as typeof import("./fipe.service");
    fipe = new mod.FipeService();
  });

  after(() => {
    delete process.env.FIPE_API_URL;
    server.close();
  });

  test("anos disponíveis de uma versão", async () => {
    assert.deepEqual(await fipe.listYears("Volkswagen", 9999), [
      { code: "2024-1", name: "2024 Gasolina" },
      { code: "2023-1", name: "2023 Gasolina" },
    ]);
  });

  test("ficha da versão no ano: marca, modelo, ano, combustível, código e valor FIPE", async () => {
    assert.deepEqual(await fipe.ficha("Volkswagen", 9999, "2024-1"), {
      marca: "VW - VolksWagen",
      modelo: "T-Cross Highline 250 TSI 1.4 Flex Aut.",
      anoModelo: 2024,
      combustivel: "Gasolina",
      codigoFipe: "005501-7",
      valor: 151234,
      mesReferencia: "novembro de 2026",
    });
  });

  test("ano ou código inválido não chega na FIPE e devolve vazio", async () => {
    const antes = pedidos.length;
    assert.equal(await fipe.ficha("Volkswagen", 9999, "../../x"), undefined);
    assert.equal(pedidos.length, antes, "não monta URL com texto do usuário");
    assert.equal(await fipe.ficha("Volkswagen", 9999, "2010-1"), undefined);
  });
});
