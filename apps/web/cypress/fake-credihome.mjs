// Credihome de mentira, só para os testes de ponta a ponta: responde ao
// login, ao simulador e ao envio do lead com dados fixos, para o Cypress
// chegar até a etapa de pedido de proposta (onde ficam as autorizações).
// Nunca usar fora de teste. Uso: node apps/web/cypress/fake-credihome.mjs 4010
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4010);

function fakeJwt() {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({ relatedId: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 100_000) req.destroy();
  });
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "POST" && path === "/login") return res.end(JSON.stringify({ token: fakeJwt() }));
    if (!req.headers.authorization?.startsWith("Bearer ")) {
      res.statusCode = 401;
      return res.end("{}");
    }
    if (req.method === "POST" && path === "/simulador") {
      return res.end(
        JSON.stringify({
          financiamentoMaximo: 400000,
          errorMessage: [],
          resultados: [
            { operador: "Banco A", prestacaoFinal: 3900.25, taxaJurosAnual: 10.9, rendaMinima: 13000, tabela: "SAC" },
            { operador: "Banco B", prestacaoFinal: 4100.5, taxaJurosAnual: 11.5, rendaMinima: 13700, tabela: "SAC" },
          ],
        }),
      );
    }
    if (req.method === "POST" && path === "/simulations") {
      return res.end(JSON.stringify({ leadId: `lead-teste-${Date.now()}`, firstPayment: 3900.25 }));
    }
    if (req.method === "GET" && /^\/leads\/[^/]+\/journey$/.test(path)) return res.end(JSON.stringify({ phase: "lead" }));
    res.statusCode = 404;
    res.end("{}");
  });
}).listen(port, "127.0.0.1", () => console.log(`Credihome de teste em http://127.0.0.1:${port}`));
