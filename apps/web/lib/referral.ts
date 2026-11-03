import { AFFILIATE_CODE_PATTERN, AFFILIATE_RULES, SALES_CODE_PATTERN } from "@novoseminovo/shared-types";

// Link de afiliado: novoseminovo.com.br/qualquer-pagina?ref=CODIGO. O código
// fica num cookie por AFFILIATE_RULES.cookieDays dias e vai junto no cadastro
// (registerAction) — quem chegar pelo link e criar a conta depois fica
// indicado por aquele afiliado.
export const REFERRAL_COOKIE = "ns_ref";
export const REFERRAL_MAX_AGE = AFFILIATE_RULES.cookieDays * 24 * 60 * 60;

export function cleanReferralCode(value: string | null | undefined): string | undefined {
  const code = (value ?? "").trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : undefined;
}

// Link do vendedor da equipe comercial: ?vendedor=CODIGO (ex.: em /para-lojas).
// A empresa que se cadastrar depois entra na carteira dele (área /comercial).
export const SALES_COOKIE = "ns_vendedor";
export const SALES_MAX_AGE = 90 * 24 * 60 * 60;

export function cleanSalesCode(value: string | null | undefined): string | undefined {
  const code = (value ?? "").trim().toUpperCase();
  return SALES_CODE_PATTERN.test(code) ? code : undefined;
}
