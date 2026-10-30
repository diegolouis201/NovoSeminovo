import { createHmac, timingSafeEqual } from "node:crypto";

// O marketing (posts, campanhas, sequências) saiu do site em 10/2026 e passou
// a ser feito fora dele. Daqui só ficou o que e-mails já enviados e o
// formulário do rodapé ainda usam: endereço do site e assinatura de links.

export function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
}

function linkSecret(): string {
  // Sem fallback hardcoded (ver require-strong-secret.ts) — MARKETING_LINK_SECRET
  // é opcional, mas cai pro JWT_SECRET (que o boot da API já garante forte),
  // nunca pra um valor conhecido no código-fonte.
  const secret = process.env.MARKETING_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("MARKETING_LINK_SECRET ou JWT_SECRET precisa estar configurado pra assinar links de marketing.");
  }
  return secret;
}

export function signLink(value: string): string {
  return createHmac("sha256", linkSecret()).update(value).digest("base64url").slice(0, 22);
}

export function verifyLink(value: string, signature: string): boolean {
  const expected = Buffer.from(signLink(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
