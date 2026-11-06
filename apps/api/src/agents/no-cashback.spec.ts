import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ListingsService } from "../listings/listings.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AdminService } from "../admin/admin.service";
import type { FinancingDealsService } from "../financing-deals/financing-deals.service";
import { buildBuyerAgent } from "./buyer-agent";
import { buildAdminAgent } from "./admin-agent";

// O NovoSeminovo deixou de oferecer cashback no financiamento (06/11/2026,
// decisão do Diego). Nenhum assistente de IA pode prometer ou mencionar
// cashback; o aviso legal do financiamento continua.

const CASHBACK = /cashback|recompensa/i;

describe("Assistentes de IA não oferecem cashback", () => {
  test("assistente de compra: instruções e ferramentas sem cashback, com o aviso de que não concede crédito", () => {
    const agent = buildBuyerAgent(
      { channel: "web", siteUrl: "https://novoseminovo.com.br", humanWhatsapp: "5500000000000", seenListings: new Map() },
      { listings: {} as ListingsService, saveFinancingLead: async () => ({ id: "x" }) },
    );
    assert.doesNotMatch(agent.system, CASHBACK);
    assert.doesNotMatch(JSON.stringify(agent.tools.map((tool) => tool.definition)), CASHBACK);
    assert.match(agent.system, /não concede crédito/);
    assert.doesNotMatch(agent.system, /Belo Horizonte|\/MG\b/, "escopo nacional");
  });

  test("assistente de gestão: sem ferramenta nem instrução de cashback; comissão de financiamento continua", () => {
    const agent = buildAdminAgent(
      { adminId: "a", adminName: "Diego" },
      {
        prisma: {} as PrismaService,
        admin: {} as AdminService,
        financingDeals: {} as FinancingDealsService,
        listFinancingLeads: async () => [],
        updateFinancingLeadStatus: async () => undefined,
      },
    );
    assert.doesNotMatch(agent.system, CASHBACK);
    assert.doesNotMatch(JSON.stringify(agent.tools.map((tool) => tool.definition)), CASHBACK);
    assert.ok(agent.tools.some((tool) => tool.definition.name === "comissoes_financiamento"));
    assert.doesNotMatch(agent.system, /Belo Horizonte|\/MG\b/, "escopo nacional");
  });

  test("nenhum texto da API (prompts, avisos, relatórios) fala em cashback", () => {
    // dist-test/agents → apps/api/src
    const root = resolve(__dirname, "../../src");
    // Único lugar autorizado: a lista de avisos antigos que deixam de aparecer.
    const allowed = new Set(["notifications/notifications.service.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) {
          const rel = relative(root, path).split("\\").join("/");
          if (!allowed.has(rel) && /cashback/i.test(readFileSync(path, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(root);
    assert.deepEqual(offenders, []);
  });
});
