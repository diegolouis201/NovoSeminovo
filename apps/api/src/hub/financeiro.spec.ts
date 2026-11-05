import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceiroService } from "./financeiro.service";

// Financeiro do Hub no banco: lançamentos (parcelas, baixa, cancelamento),
// contas, transferências, Stripe automático e importação sem duplicar.

const withDb = Boolean(process.env.DATABASE_URL);

describe("Financeiro do Hub (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const fin = new FinanceiroService(prisma);
  const tag = `fin-${Date.now()}`;
  const ids = { owner: "", partner: "", conta: "", conta2: "" };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dona", email: `dona-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.partner = (await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja ${tag}`, document: `9${Date.now()}`.slice(0, 14), slug: tag } })).id;
    await prisma.subscriptionPayment.create({ data: { stripeInvoiceId: `in_${tag}`, partnerId: ids.partner, partnerType: "dealership", amount: 199, refundedAmount: 49, paidAt: new Date("2026-10-07T15:00:00Z") } });
  });

  after(async () => {
    await prisma.finEntry.deleteMany({ where: { OR: [{ descricao: { contains: tag } }, { contaId: { in: [ids.conta, ids.conta2] } }] } });
    await prisma.finTransfer.deleteMany({ where: { OR: [{ deContaId: ids.conta }, { paraContaId: ids.conta }] } });
    await prisma.finAccount.deleteMany({ where: { id: { in: [ids.conta, ids.conta2] } } });
    await prisma.subscriptionPayment.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  test("mensalidade do Stripe entra sozinha como receita recebida (menos o estorno)", async () => {
    const movs = await fin.movimentos();
    const m = movs.find((x) => x.id === `stripe-sub-in_${tag}`);
    assert.ok(m, "pagamento do Stripe aparece");
    assert.equal(m.categoria, "R01");
    assert.equal(m.valor, 150);
    assert.equal(m.status, "pago");
    assert.equal(m.pagoEm, "2026-10-07");
    assert.equal(m.contaId, "stripe");
    assert.equal(m.origem, "stripe");
  });

  test("conta, lançamento parcelado, baixa, cancelamento e transferência", async () => {
    ids.conta = (await fin.criarConta({ nome: `Inter ${tag}`, banco: "Inter", tipo: "corrente", saldoInicial: 1000, saldoInicialEm: "2026-10-01" })).id;
    ids.conta2 = (await fin.criarConta({ nome: `C6 ${tag}`, tipo: "corrente", saldoInicial: 0, saldoInicialEm: "2026-10-01" })).id;
    const criados = await fin.criarLancamento({ tipo: "pagar", descricao: `Notebook ${tag}`, categoria: "F06", valor: 300, competencia: "2026-10-10", vencimento: "2026-10-10", parcelas: 3 }, "u1");
    assert.equal(criados.length, 3);
    const lista = (await fin.movimentos()).filter((m) => m.descricao.includes(`Notebook ${tag}`));
    assert.deepEqual(lista.map((m) => m.vencimento).sort(), ["2026-10-10", "2026-11-10", "2026-12-10"]);
    assert.deepEqual(lista.map((m) => m.competencia).sort(), ["2026-10-10", "2026-11-10", "2026-12-10"], "cada parcela na sua competência");
    const primeira = lista.find((m) => m.vencimento === "2026-10-10")!;
    await fin.baixar(primeira.id, { pagoEm: "2026-10-11", contaId: ids.conta });
    await assert.rejects(fin.baixar(primeira.id, { pagoEm: "2026-10-11", contaId: ids.conta }), /já/);
    await assert.rejects(fin.baixar(lista[1].id, { pagoEm: "2026-10-11", contaId: "nao-existe" }), /Conta/);
    await fin.cancelar(lista.find((m) => m.vencimento === "2026-12-10")!.id);
    await fin.transferir({ deContaId: ids.conta, paraContaId: ids.conta2, valor: 50, data: "2026-10-12" });
    await assert.rejects(fin.transferir({ deContaId: ids.conta, paraContaId: ids.conta, valor: 1, data: "2026-10-12" }), /mesma conta/);
    const s = await fin.saldos("2026-10-31");
    assert.equal(s.porConta.find((c) => c.id === ids.conta)!.saldo, 850);
    assert.equal(s.porConta.find((c) => c.id === ids.conta2)!.saldo, 50);
    const depois = (await fin.movimentos()).filter((m) => m.descricao.includes(`Notebook ${tag}`));
    assert.deepEqual(depois.map((m) => m.status).sort(), ["aberto", "cancelado", "pago"]);
  });

  test("lançamento já pago na hora de criar exige conta; recorrente cria 12 meses", async () => {
    await assert.rejects(fin.criarLancamento({ tipo: "pagar", descricao: `x ${tag}`, categoria: "F02", valor: 10, competencia: "2026-10-01", vencimento: "2026-10-01", pago: true }, "u1"), /conta/);
    const r = await fin.criarLancamento({ tipo: "pagar", descricao: `Servidor ${tag}`, categoria: "C02", valor: 120, competencia: "2026-11-05", vencimento: "2026-11-05", recorrente: true, parcelas: 12 }, "u1");
    assert.equal(r.length, 12);
  });

  test("importar OFX duas vezes não duplica; Stripe no extrato vira transferência", async () => {
    const ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015<TRNAMT>-80.00<FITID>X1-${tag}<MEMO>LOCAWEB ${tag}</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261016<TRNAMT>100.00<FITID>X2-${tag}<MEMO>STRIPE PAYOUT</STMTTRN></OFX>`;
    const a = await fin.importar({ formato: "ofx", texto: ofx, contaId: ids.conta }, "u1");
    assert.deepEqual([a.lancamentos, a.transferencias, a.repetidos], [1, 1, 0]);
    const b = await fin.importar({ formato: "ofx", texto: ofx, contaId: ids.conta }, "u1");
    assert.deepEqual([b.lancamentos, b.transferencias, b.repetidos], [0, 0, 2]);
    const loc = (await fin.movimentos()).find((m) => m.descricao.includes(`LOCAWEB ${tag}`))!;
    assert.equal(loc.status, "pago");
    assert.equal(loc.categoria, "F06", "sem categoria: vai para Outras despesas, para classificar depois");
    await fin.editar(loc.id, { categoria: "F02", contraparte: "Locaweb" });
    assert.equal((await fin.movimentos()).find((m) => m.id === loc.id)!.categoria, "F02");
  });

  test("importar planilha: linhas válidas viram lançamentos e as ruins viram aviso", async () => {
    const csv = `Data;Descrição;Valor;Categoria;Situação\n01/10/2026;Contador ${tag};-350,00;F04;pago\n05/11/2026;Aluguel ${tag};-900,00;F05;aberto\nruim;x;y;;`;
    const r = await fin.importar({ formato: "planilha", texto: csv, contaId: ids.conta }, "u1");
    assert.equal(r.lancamentos, 2);
    assert.deepEqual(r.erros, ["Linha 4: data ou valor inválido"]);
    const again = await fin.importar({ formato: "planilha", texto: csv, contaId: ids.conta }, "u1");
    assert.equal(again.repetidos, 2);
  });
});
