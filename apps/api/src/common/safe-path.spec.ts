import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath } from "@novoseminovo/shared-types";

// Redirecionamento depois do login (?voltar=) e links do chat: só caminho do
// próprio site. "//golpe.com" e "/\golpe.com" o navegador abre como outro site.
describe("Caminho interno seguro", () => {
  test("aceita caminhos do site", () => {
    for (const path of ["/conta", "/anuncio/abc?x=1", "/busca?assetType=vehicle&state=MG", "/anuncio/abc/arquiteto#fotos"]) {
      assert.equal(safeInternalPath(path, "/"), path);
    }
  });
  test("recusa outro site disfarçado", () => {
    for (const path of ["//golpe.com", "/\\golpe.com", "/\\/golpe.com", "https://golpe.com", "javascript:alert(1)", " /conta", "", "conta", "/%2F%2Fgolpe.com"]) {
      assert.equal(safeInternalPath(path, "/conta"), "/conta", path);
    }
  });
});

describe("Link externo no chat dos assistentes", () => {
  test("só domínios confiáveis viram link clicável", async () => {
    const { isTrustedExternalLink } = await import("@novoseminovo/shared-types");
    assert.equal(isTrustedExternalLink("https://novoseminovo.com.br/anuncio/x"), true);
    assert.equal(isTrustedExternalLink("https://api.novoseminovo.com.br/m/u/abc"), true);
    for (const url of ["https://golpe.shop/pix", "https://novoseminovo.com.br.golpe.com", "http://novoseminovo.com.br", "https://user@golpe.com", "javascript:alert(1)"]) {
      assert.equal(isTrustedExternalLink(url), false, url);
    }
  });
});
