import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { chaveDeIngestaoConfere, LimiteIngestao, linhasParaCsv } from "./ingestao";
import { ProspeccaoImportService } from "./prospeccao-import.service";

// Entrada de empresas por automação (POST /hub/prospects/ingest): chave de
// API lida do arquivo de segredo, comparação em tempo constante, limite de
// chamadas e o mesmo caminho da importação pelo Hub (sem duplicar nada).

const CHAVE = "chave-de-ingestao-de-teste-com-mais-de-32-caracteres";

describe("Chave da ingestão", () => {
  const ler = (valor?: string) => () => {
    if (!valor) throw new Error("sem arquivo");
    return valor;
  };
  test("chave certa passa; errada, vazia ou sem segredo configurado não", () => {
    assert.equal(chaveDeIngestaoConfere(CHAVE, ler(CHAVE)), "ok");
    assert.equal(chaveDeIngestaoConfere(`${CHAVE}x`, ler(CHAVE)), "recusada");
    assert.equal(chaveDeIngestaoConfere(CHAVE.slice(0, -1), ler(CHAVE)), "recusada");
    assert.equal(chaveDeIngestaoConfere(undefined, ler(CHAVE)), "recusada");
    assert.equal(chaveDeIngestaoConfere(["a", "b"], ler(CHAVE)), "recusada");
    assert.equal(chaveDeIngestaoConfere(CHAVE, ler(undefined)), "desligada");
  });
});

test("limite de chamadas por hora (e de tentativas com chave errada)", () => {
  const l = new LimiteIngestao({ porHora: 3, erradasPorHora: 2 });
  const t0 = new Date("2030-03-04T13:00:00Z");
  assert.equal(l.permitir(t0), true);
  assert.equal(l.permitir(t0), true);
  assert.equal(l.permitir(t0), true);
  assert.equal(l.permitir(t0), false);
  assert.equal(l.permitir(new Date(t0.getTime() + 61 * 60_000)), true, "janela de 1 hora");
  assert.equal(l.errou(t0), true);
  assert.equal(l.errou(t0), true);
  assert.equal(l.errou(t0), false, "chave errada demais: bloqueia");
});

test("linhas em JSON viram o CSV do Mailerfind (fórmula neutralizada, aspas escapadas)", () => {
  const csv = linhasParaCsv([
    { full_name: 'Loja "Boa"', email: "a@b.com", city: "BH" },
    { full_name: "=HYPERLINK(1)", phone_number: 31999990000, city: null },
  ]);
  const [cab, l1, l2] = csv.trim().split("\n");
  assert.equal(cab, "full_name,email,city,phone_number");
  assert.equal(l1, '"Loja ""Boa""","a@b.com","BH",""');
  assert.match(l2!, /^"'=HYPERLINK\(1\)"/);
});

const withDb = Boolean(process.env.DATABASE_URL);
describe("Ingestão no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `ing${Date.now().toString(36)}`;
  const service = new ProspeccaoImportService(prisma);
  after(async () => {
    await prisma.salesProspect.deleteMany({ where: { campaignTag: `Etq ${tag}` } });
    await prisma.prospectImport.deleteMany({ where: { tag: `Etq ${tag}` } });
    await prisma.$disconnect();
  });

  test("mesmo lote duas vezes: cria uma vez, depois só duplicadas", async () => {
    const linhas: Record<string, string>[] = [
      { full_name: `Auto ${tag} Um`, email: `um-${tag}@exemplo.com.br`, full_phone_number: "+5531988001100", city: "Belo Horizonte", state: "MG", website: `https://um-${tag}.com.br` },
      { full_name: `Auto ${tag} Dois`, email: `dois-${tag}@exemplo.com.br`, full_phone_number: "+5531988001101", city: "Contagem", state: "MG" },
    ];
    const a = await service.importarAutomatico({ etiqueta: `Etq ${tag}`, segmento: "vehicle", linhas });
    assert.equal(a.criadas, 2);
    const b = await service.importarAutomatico({ etiqueta: `Etq ${tag}`, segmento: "vehicle", linhas });
    assert.equal(b.criadas, 0);
    assert.equal(b.duplicadas, 2);
    assert.equal(await prisma.salesProspect.count({ where: { campaignTag: `Etq ${tag}` } }), 2);
    const c = await prisma.salesProspect.findFirstOrThrow({ where: { campaignTag: `Etq ${tag}`, city: "Contagem" } });
    assert.equal(c.stage, "a_abordar");
    assert.equal(c.source, "mailerfind");
  });

  test("CSV cru também entra; conteúdo que não é CSV é recusado", async () => {
    const csv = `full_name,email,city\nAuto ${tag} Tres,tres-${tag}@exemplo.com.br,Betim\n`;
    assert.equal((await service.importarAutomatico({ etiqueta: `Etq ${tag}`, segmento: "vehicle", csv })).criadas, 1);
    await assert.rejects(service.importarAutomatico({ etiqueta: `Etq ${tag}`, segmento: "vehicle", csv: "%PDF-1.4 lixo" }));
    await assert.rejects(service.importarAutomatico({ etiqueta: "=cmd|x", segmento: "vehicle", csv } as never), /Etiqueta/);
  });
});
