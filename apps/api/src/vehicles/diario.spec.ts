import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { VehiclesService } from "./vehicles.service";

// Diário do Carro (fase 2) no banco: momentos com foto e a carta para o
// próximo dono. Só o dono atual escreve; contato no texto é bloqueado.

const withDb = Boolean(process.env.DATABASE_URL);

describe("Diário do Carro: momentos e carta (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const vehicles = new VehiclesService(prisma, { notify: async () => undefined } as never);
  const tag = `diario-${Date.now()}`;
  const ids = { owner: "", other: "", vehicle: "" };
  let foto: Express.Multer.File;

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dona", email: `dona-${tag}@teste.local` } })).id;
    ids.other = (await prisma.user.create({ data: { name: "Outro", email: `outro-${tag}@teste.local` } })).id;
    ids.vehicle = (await prisma.vehicle.create({ data: { currentOwnerId: ids.owner, color: "Prata" } })).id;
    const buffer = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer();
    foto = { buffer, originalname: "viagem.jpg", mimetype: "image/jpeg", size: buffer.length } as Express.Multer.File;
  });

  after(async () => {
    await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("momento com foto entra no histórico; telefone no texto é recusado", async () => {
    const m = await vehicles.addEvent(ids.vehicle, ids.owner, { type: "moment", title: "Viagem para a Chapada", description: "Primeira viagem longa", mileageAtEvent: 21000 }, [foto]);
    assert.equal(m.type, "moment");
    assert.equal(m.photos.length, 1);
    await assert.rejects(vehicles.addEvent(ids.vehicle, ids.owner, { type: "moment", title: "Viagem", description: "me chama no 31 99999-8888" }, [foto]), /telefone|contato/i);
  });

  test("carta para o próximo dono: só o dono atual, uma por dono (editar substitui), sem contato", async () => {
    await assert.rejects(vehicles.saveLetter(ids.vehicle, ids.other, { texto: "Carta de quem não é dono do carro." }), /dono atual/);
    await vehicles.saveLetter(ids.vehicle, ids.owner, { texto: "Ele gosta de gasolina aditivada. Cuide bem!" });
    await vehicles.saveLetter(ids.vehicle, ids.owner, { texto: "Ele gosta de gasolina aditivada e revisão em dia." });
    const cartas = await prisma.vehicleEvent.findMany({ where: { vehicleId: ids.vehicle, type: "letter" } });
    assert.equal(cartas.length, 1);
    assert.equal(cartas[0]!.description, "Ele gosta de gasolina aditivada e revisão em dia.");
    await assert.rejects(vehicles.saveLetter(ids.vehicle, ids.owner, { texto: "Qualquer dúvida: dona@email.com" }), /e-mail|contato/i);
    const perfil = await vehicles.getProfile(ids.vehicle, undefined);
    assert.ok(perfil.events.some((e) => e.type === "letter"));
  });

  test("depois de trocar de dono, o novo dono escreve a carta dele sem apagar a anterior", async () => {
    await prisma.vehicle.update({ where: { id: ids.vehicle }, data: { currentOwnerId: ids.other } });
    await prisma.vehicleEvent.create({ data: { vehicleId: ids.vehicle, type: "ownership_change", source: "system", title: "Troca de dono", occurredAt: new Date() } });
    await vehicles.saveLetter(ids.vehicle, ids.other, { texto: "Segunda carta, do segundo dono." });
    const cartas = await prisma.vehicleEvent.findMany({ where: { vehicleId: ids.vehicle, type: "letter" } });
    assert.equal(cartas.length, 2);
  });
});
