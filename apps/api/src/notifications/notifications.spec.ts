import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { EmailService } from "../email/email.service";
import type { PushService } from "./push.service";
import { NotificationsService } from "./notifications.service";

// O cashback no financiamento acabou (06/11/2026). Aviso antigo de cashback
// que tenha ficado no banco não aparece mais para ninguém (nem quebra a
// lista), e o contador de não lidas ignora esses avisos.
const withDb = Boolean(process.env.DATABASE_URL);

describe("Avisos antigos de cashback (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new NotificationsService(prisma, { isEnabled: () => false } as unknown as EmailService, {} as PushService);
  const tag = `notif-${Date.now()}`;
  let userId = "";

  before(async () => {
    userId = (await prisma.user.create({ data: { name: "Cliente", email: `cliente-${tag}@teste.local`, role: "buyer" } })).id;
    await prisma.notification.createMany({
      data: [
        { userId, type: "cashback_registered", payload: { amountLabel: "R$ 160,00" } },
        { userId, type: "cashback_paid", payload: { amountLabel: "R$ 160,00" } },
        { userId, type: "listing_approved", payload: { listingTitle: "Gol", listingId: "abc" } },
      ],
    });
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("lista e contador só mostram os avisos atuais", async () => {
    const mine = await service.listMine(userId);
    assert.deepEqual(
      mine.map((n) => n.type),
      ["listing_approved"],
    );
    assert.doesNotMatch(JSON.stringify(mine), /cashback|recompensa/i);
    assert.equal(await service.unreadCount(userId), 1);
  });
});
