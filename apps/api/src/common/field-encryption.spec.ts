import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { blindIndex, decryptField, deriveDataKeys, encryptExistingRows, encryptField, isEncrypted } from "./field-encryption";

// CPF, telefones e chave Pix ficam criptografados no banco (AES-256-GCM).
// Para achar alguém pelo CPF/telefone sem descriptografar a tabela toda,
// cada campo tem um "índice cego" (HMAC-SHA256 do valor normalizado).

const keys = deriveDataKeys("chave-de-dados-so-de-teste-com-mais-de-32-caracteres");
const otherKeys = deriveDataKeys("outra-chave-de-dados-de-teste-com-mais-de-32-caracteres");

describe("Criptografia de campo", () => {
  test("ida e volta devolve o texto original", () => {
    const stored = encryptField("529.982.247-25", keys);
    assert.ok(isEncrypted(stored));
    assert.ok(!stored.includes("529"));
    assert.equal(decryptField(stored, keys), "529.982.247-25");
  });

  test("o mesmo valor criptografado duas vezes sai diferente (IV aleatório)", () => {
    assert.notEqual(encryptField("31988887777", keys), encryptField("31988887777", keys));
  });

  test("texto adulterado ou chave errada é recusado", () => {
    const stored = encryptField("31988887777", keys);
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    assert.throws(() => decryptField(tampered, keys));
    assert.throws(() => decryptField(stored, otherKeys));
  });

  test("valor ainda não criptografado passa como está (dados antigos)", () => {
    assert.equal(decryptField("31988887777", keys), "31988887777");
  });

  test("índice cego ignora formatação e o 55 do Brasil no telefone", () => {
    const a = blindIndex("phone", "(31) 98888-7777", keys);
    assert.equal(blindIndex("phone", "31988887777", keys), a);
    assert.equal(blindIndex("phone", "+55 31 98888-7777", keys), a);
    assert.notEqual(blindIndex("phone", "31988887778", keys), a);
    assert.equal(blindIndex("cpf", "529.982.247-25", keys), blindIndex("cpf", "52998224725", keys));
    assert.notEqual(blindIndex("cpf", "52998224725", otherKeys), blindIndex("cpf", "52998224725", keys));
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Campos sensíveis criptografados no banco (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const stamp = Date.now();
  const cpf = `${String(stamp).slice(-11).padStart(11, "1")}`;
  const ids: string[] = [];

  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.affiliate.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  test("CPF e telefone gravam criptografados e voltam legíveis", async () => {
    const user = await prisma.user.create({
      data: { name: "Cripto", email: `cripto-${stamp}@teste.local`, phone: "(31) 97777-1234", cpf },
    });
    ids.push(user.id);
    assert.equal(user.phone, "(31) 97777-1234");
    assert.equal(user.cpf, cpf);
    assert.ok(!Object.keys(user).includes("cpfHash"), "índice cego não sai do serviço do banco");

    const [raw] = await prisma.$queryRaw<Array<{ phone: string; cpf: string; cpf_hash: string }>>`
      SELECT phone, cpf, cpf_hash FROM users WHERE id = ${user.id}`;
    assert.ok(isEncrypted(raw.phone) && !raw.phone.includes("7777"));
    assert.ok(isEncrypted(raw.cpf) && !raw.cpf.includes(cpf));
    assert.match(raw.cpf_hash, /^[0-9a-f]{64}$/);
  });

  test("busca por CPF e por telefone continua funcionando", async () => {
    const byCpf = await prisma.user.findFirst({ where: { cpf } });
    assert.equal(byCpf?.email, `cripto-${stamp}@teste.local`);
    const byPhone = await prisma.user.findFirst({ where: { phone: { in: ["31977771234", "5531977771234"] } } });
    assert.equal(byPhone?.cpf, cpf);
    assert.equal(await prisma.user.count({ where: { phone: "31977771234", id: { in: ids } } }), 1);
  });

  test("dado em relação aninhada também volta legível", async () => {
    const affiliate = await prisma.affiliate.create({
      data: { userId: ids[0], code: `cripto${stamp}`, channels: "instagram", pixKey: "cripto@teste.local" },
      include: { user: { select: { phone: true, cpf: true } } },
    });
    assert.equal(affiliate.pixKey, "cripto@teste.local");
    assert.equal(affiliate.user.phone, "(31) 97777-1234");
    const [raw] = await prisma.$queryRaw<Array<{ pix_key: string }>>`SELECT pix_key FROM affiliates WHERE id = ${affiliate.id}`;
    assert.ok(isEncrypted(raw.pix_key));
  });

  test("atualizar o telefone regrava criptografado e o índice acompanha", async () => {
    await prisma.user.update({ where: { id: ids[0] }, data: { phone: "31966665555" } });
    assert.equal((await prisma.user.findFirst({ where: { phone: "(31) 96666-5555" } }))?.id, ids[0]);
    assert.equal(await prisma.user.count({ where: { phone: "31977771234", id: { in: ids } } }), 0);
  });

  test("busca por pedaço do telefone é recusada (não dá para buscar texto criptografado)", async () => {
    await assert.rejects(prisma.user.findMany({ where: { phone: { contains: "9666" } } }), /criptografado/);
  });

  test("dados antigos em texto puro são criptografados na subida", async () => {
    const plain = await prisma.user.create({ data: { name: "Antigo", email: `antigo-${stamp}@teste.local` } });
    ids.push(plain.id);
    await prisma.$executeRaw`UPDATE users SET phone = '31955554444', cpf = NULL WHERE id = ${plain.id}`;
    await encryptExistingRows(prisma);
    const [raw] = await prisma.$queryRaw<Array<{ phone: string; phone_hash: string }>>`
      SELECT phone, phone_hash FROM users WHERE id = ${plain.id}`;
    assert.ok(isEncrypted(raw.phone));
    assert.ok(raw.phone_hash);
    assert.equal((await prisma.user.findFirst({ where: { phone: "31955554444" } }))?.id, plain.id);
  });
});
