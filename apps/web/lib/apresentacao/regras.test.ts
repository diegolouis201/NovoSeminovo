import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ACQUISITION_COOKIE, parseAcquisition } from "@novoseminovo/shared-types";
import {
  APRESENTACAO_MAX_BYTES,
  cabecalhosPdf,
  cabecalhosRedirect,
  cookieDeOrigem,
  ehPdf,
  etagDe,
  naoModificado,
} from "./regras";

// PDF de apresentação para empresas: tipo decidido pelos bytes (%PDF-),
// abre no navegador (inline) com nome fixo, cache curto, nunca indexado.

describe("ehPdf: decide pelos bytes", () => {
  test("começa com %PDF- = PDF", () => {
    assert.equal(ehPdf(Buffer.from("%PDF-1.4\n%âãÏÓ\n")), true);
  });
  test("HTML, imagem, texto vazio ou %PDF sem hífen não são PDF", () => {
    assert.equal(ehPdf(Buffer.from("<html><script>alert(1)</script>")), false);
    assert.equal(ehPdf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), false);
    assert.equal(ehPdf(Buffer.alloc(0)), false);
    assert.equal(ehPdf(Buffer.from("%PDF")), false);
    assert.equal(ehPdf(Buffer.from(" %PDF-1.4")), false);
  });
  test("limite de 20 MB", () => {
    assert.equal(APRESENTACAO_MAX_BYTES, 20 * 1024 * 1024);
  });
});

describe("cabeçalhos do PDF", () => {
  const mtime = new Date("2026-11-26T15:00:00Z");
  const h = cabecalhosPdf({ size: 1319594, mtime });

  test("abre no navegador com o nome do arquivo de marketing", () => {
    assert.equal(h["Content-Type"], "application/pdf");
    assert.equal(h["Content-Disposition"], 'inline; filename="NovoSeminovo-para-empresas.pdf"');
    assert.equal(h["Content-Length"], "1319594");
  });
  test("cache curto (5 min), ETag e Last-Modified para a troca aparecer rápido", () => {
    assert.equal(h["Cache-Control"], "public, max-age=300");
    assert.equal(h.ETag, etagDe(1319594, mtime));
    assert.equal(h["Last-Modified"], "Thu, 26 Nov 2026 15:00:00 GMT");
  });
  test("não indexa e não deixa o navegador adivinhar o tipo", () => {
    assert.equal(h["X-Robots-Tag"], "noindex, nofollow");
    assert.equal(h["X-Content-Type-Options"], "nosniff");
  });
  test("ETag muda quando o arquivo é trocado", () => {
    assert.notEqual(etagDe(1319594, mtime), etagDe(1319594, new Date(mtime.getTime() + 1000)));
    assert.notEqual(etagDe(1319594, mtime), etagDe(1319595, mtime));
  });
  test("304 quando o navegador já tem a mesma versão", () => {
    const etag = etagDe(10, mtime);
    assert.equal(naoModificado(new Headers({ "if-none-match": etag }), etag, mtime), true);
    assert.equal(naoModificado(new Headers({ "if-none-match": '"outro"' }), etag, mtime), false);
    assert.equal(naoModificado(new Headers({ "if-modified-since": "Thu, 26 Nov 2026 16:00:00 GMT" }), etag, mtime), true);
    assert.equal(naoModificado(new Headers({ "if-modified-since": "Thu, 26 Nov 2026 14:00:00 GMT" }), etag, mtime), false);
    assert.equal(naoModificado(new Headers(), etag, mtime), false);
  });
});

describe("redirecionamento de campanha", () => {
  test("destino fixo, sem cache, sem indexação", () => {
    const h = cabecalhosRedirect();
    assert.equal(h.Location, "/apresentacao-empresas.pdf");
    assert.equal(h["Cache-Control"], "no-store");
    assert.equal(h["X-Robots-Tag"], "noindex, nofollow");
  });

  test("cookie de origem no formato do AttributionCapture (cadastro depois herda)", () => {
    const set = cookieDeOrigem({ source: "prospeccao", medium: "email", campaign: "caio_veiculos", content: "apresentacao" }, { hasCookie: false, secure: true });
    assert.ok(set);
    assert.ok(set.startsWith(`${ACQUISITION_COOKIE}=`));
    assert.match(set, /Max-Age=7776000; Path=\/; SameSite=Lax; Secure$/);
    const value = set.slice(ACQUISITION_COOKIE.length + 1).split(";")[0];
    assert.deepEqual(parseAcquisition(value), { source: "prospeccao", medium: "email", campaign: "caio_veiculos", content: "apresentacao" });
  });

  test("origem não-direta sobrescreve; sem utm não apaga a origem que já existe", () => {
    assert.ok(cookieDeOrigem({ source: "prospeccao" }, { hasCookie: true, secure: false }));
    assert.equal(cookieDeOrigem({}, { hasCookie: true, secure: false }), undefined);
    const direto = cookieDeOrigem({}, { hasCookie: false, secure: false });
    assert.ok(direto?.startsWith(`${ACQUISITION_COOKIE}=direto`));
    assert.ok(!direto?.includes("Secure"));
  });
});
