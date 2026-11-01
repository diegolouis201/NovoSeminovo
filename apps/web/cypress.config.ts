import { defineConfig } from "cypress";

// Testes de ponta a ponta do site (Cypress). Precisam do site e da API
// rodando com o banco de teste populado (pnpm db:seed). Rodar:
//   pnpm --filter @novoseminovo/web e2e          (sem janela)
//   pnpm --filter @novoseminovo/web e2e:open     (com janela)
// No GitHub roda sozinho a cada envio (.github/workflows/e2e.yml).
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 900,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 120000,
    video: false,
    env: {
      apiUrl: process.env.CYPRESS_API_URL ?? "http://localhost:4000",
    },
  },
});
