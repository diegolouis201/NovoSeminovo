import { AFFILIATE_CODE_PATTERN, AFFILIATE_RULES } from "@novoseminovo/shared-types";

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
