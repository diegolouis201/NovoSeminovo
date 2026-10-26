// Nunca dar um valor padrão pra segredo de assinatura (JWT, link de
// marketing etc.) — um fallback hardcoded no código-fonte vira um segredo
// público assim que o repositório existe, e quem souber esse valor forja
// qualquer token (inclusive de admin) se a variável de ambiente real não
// tiver sido configurada. Preferimos a API recusar subir a rodar insegura
// silenciosamente.
export function requireStrongSecret(envVar: string, minLength = 32): string {
  const value = process.env[envVar];
  if (!value || value.length < minLength) {
    throw new Error(
      `${envVar} ausente ou curta demais (mínimo ${minLength} caracteres) — gere com \`openssl rand -hex 32\` e configure antes de subir a API.`,
    );
  }
  return value;
}
