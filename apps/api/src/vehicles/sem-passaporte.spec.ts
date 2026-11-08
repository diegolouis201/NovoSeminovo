import "reflect-metadata";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { MODULE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";

// O Passaporte Digital / Diário do Carro foi descontinuado (08/11/2026,
// decisão do Diego, por risco jurídico das informações). Nenhuma rota pública
// do Diário pode continuar existindo; a placa segue só no cadastro do anúncio
// (hash e borrar nas fotos) e a FIPE do cadastro continua.

type Route = { method: string; path: string };

// Mapa de rotas da API real: percorre o grafo de módulos do AppModule e lê os
// metadados de cada controller (mesmos que o Nest usa para registrar as rotas).
function routeTable(): Route[] {
  process.env.JWT_SECRET ??= "segredo-so-para-testes-locais-0123456789";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require("../app.module") as typeof import("../app.module");
  const seen = new Set<unknown>();
  const controllers = new Set<Function>();
  const walk = (mod: unknown) => {
    if (!mod || seen.has(mod)) return;
    seen.add(mod);
    const target = (mod as { module?: unknown }).module ?? mod; // módulo dinâmico
    for (const c of (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target as object) ?? []) as Function[]) controllers.add(c);
    const imports = [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, target as object) ?? []) as unknown[]),
      ...(((mod as { imports?: unknown[] }).imports ?? []) as unknown[]),
    ];
    for (const imp of imports) walk(typeof imp === "object" && imp && "forwardRef" in imp ? (imp as { forwardRef: () => unknown }).forwardRef() : imp);
  };
  walk(AppModule);

  const routes: Route[] = [];
  const join2 = (...parts: string[]) => "/" + parts.flatMap((p) => p.split("/")).filter(Boolean).join("/");
  for (const controller of controllers) {
    const bases = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
    for (const key of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[key];
      if (typeof handler !== "function" || key === "constructor") continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const paths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || paths === undefined) continue;
      for (const base of bases) for (const p of ([] as string[]).concat(paths)) routes.push({ method: RequestMethod[method], path: join2(base, p) });
    }
  }
  return routes;
}

// Como o Express casa a URL com a rota (":param" = um segmento qualquer).
function matches(route: Route, method: string, url: string): boolean {
  if (route.method !== method && route.method !== "ALL") return false;
  const pattern = new RegExp("^" + route.path.replace(/:[^/]+/g, "[^/]+") + "/?$");
  return pattern.test(url);
}

const routes = routeTable();
const answers = (method: string, url: string) => routes.filter((r) => matches(r, method, url));

describe("Passaporte Digital / Diário do Carro descontinuado", () => {
  test("o mapa de rotas foi lido (controle positivo: FIPE do cadastro continua)", () => {
    assert.ok(routes.length > 50, `poucas rotas lidas: ${routes.length}`);
    for (const url of [
      "/listings/fipe-brands",
      "/listings/fipe-models",
      "/listings/fipe-versions",
      "/listings/fipe-price",
      "/listings/fipe-reference",
    ]) {
      assert.ok(answers("GET", url).length, `${url} deveria continuar`);
    }
  });

  test("rotas públicas do Diário respondem 404 (nenhuma rota casa)", () => {
    const gone: [string, string][] = [
      ["GET", "/vehicles/abc123"],
      ["GET", "/vehicles/by-plate/ABC1D23"],
      ["GET", "/vehicles/mine"],
      ["GET", "/vehicles/workshops"],
      ["GET", "/vehicles/pending-confirmations"],
      ["POST", "/vehicles"],
      ["POST", "/vehicles/abc123/events"],
      ["GET", "/vehicles/abc123/events"],
      ["POST", "/vehicles/events/ev1/confirm"],
      ["POST", "/vehicles/abc123/carta"],
      ["POST", "/vehicles/abc123/seguir"],
      ["DELETE", "/vehicles/abc123/seguir"],
    ];
    for (const [method, url] of gone) {
      assert.deepEqual(answers(method, url), [], `${method} ${url} ainda existe`);
    }
    assert.deepEqual(
      routes.filter((r) => r.path === "/vehicles" || r.path.startsWith("/vehicles/")),
      [],
      "nenhuma rota /vehicles",
    );
    // A ficha técnica pela FIPE só servia ao Passaporte. Sem rota própria, a
    // URL cai em GET /listings/:id, que responde 404 (não existe anúncio
    // com esse id).
    for (const path of ["/listings/fipe-years", "/listings/fipe-ficha"]) {
      assert.deepEqual(routes.filter((r) => r.path === path), [], `${path} ainda existe`);
    }
  });

  test("nenhum texto da API (prompts dos assistentes, avisos, e-mails) fala do Passaporte/Diário", () => {
    // dist-test/vehicles → apps/api/src
    const root = resolve(__dirname, "../../src");
    const proibido = /passaporte|di[aá]rio do carro|hist[oó]rico (completo )?do (ve[ií]culo|carro)|historico_do_veiculo|oficina verificada|carta para o pr[oó]ximo dono|seguir o carro|\/veiculo\/|\/consultar-veiculo|\/parceiro\/servicos/i;
    const offenders: string[] = [];
    const walkDir = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkDir(path);
        else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) {
          const rel = relative(root, path).split("\\").join("/");
          if (proibido.test(readFileSync(path, "utf8"))) offenders.push(rel);
        }
      }
    };
    walkDir(root);
    assert.deepEqual(offenders, []);
  });
});

// A placa continua no cadastro do anúncio de carro (uso interno): mesma placa
// = mesmo registro, placa nunca em texto puro, e ninguém recebe aviso.
const withDb = Boolean(process.env.DATABASE_URL);

describe("Placa no cadastro do anúncio continua só interna (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  test("mesma placa reaproveita o registro, guarda só hash/máscara e não avisa ninguém", async () => {
    const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
    const { VehiclesService } = require("./vehicles.service") as typeof import("./vehicles.service");
    const prisma = new PrismaService();
    const vehicles = new VehiclesService(prisma);
    const tag = `semdiario-${Date.now()}`;
    const plate = `ZZ${String(Date.now()).slice(-5)}`;
    const ids: { users: string[]; vehicle?: string } = { users: [] };
    try {
      const dono = await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local` } });
      const seguidor = await prisma.user.create({ data: { name: "Seguidor", email: `seg-${tag}@teste.local` } });
      ids.users.push(dono.id, seguidor.id);
      const bm = await vehicles.resolveBrandAndModel("Marca Teste " + tag, "Modelo");
      const input = { plate, ownerUserId: dono.id, brandId: bm.brand.connect.id, modelId: bm.model.connect.id };
      const id1 = await vehicles.resolveForListing(input);
      ids.vehicle = id1;
      assert.equal(await vehicles.resolveForListing(input), id1);
      const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: id1 } });
      assert.ok(!JSON.stringify(row).includes(plate), "placa em texto puro no banco");

      // Seguidor antigo (dado que ficou no banco) não recebe aviso quando o carro é anunciado.
      await prisma.vehicleFollow.create({ data: { vehicleId: id1, userId: seguidor.id } });
      await vehicles.logListingPublished(id1, dono.id, "Carro teste");
      assert.equal(await prisma.notification.count({ where: { userId: seguidor.id } }), 0);
    } finally {
      if (ids.vehicle) await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
      await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.vehicleModel.deleteMany({ where: { brand: { name: "Marca Teste " + tag } } });
      await prisma.vehicleBrand.deleteMany({ where: { name: "Marca Teste " + tag } });
      await prisma.$disconnect();
    }
  });
});
