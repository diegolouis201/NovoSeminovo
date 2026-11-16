// Escolha do aviso de cookies (Aceitar/Recusar). Fica guardada no navegador
// (CONSENT_STORAGE_KEY, é ela que libera Analytics e Pixel) e copiada no
// cookie CONSENT_COOKIE, que o servidor lê para a API de Conversões da Meta
// (lib/meta-server.ts) e para não mandar o aviso no HTML de quem já escolheu
// (auditoria web, item 3: o aviso vem pronto do servidor, sem esperar o
// JavaScript, e sem script no <head>).
export const CONSENT_STORAGE_KEY = "ns-cookie-consent";

export type Consent = "granted" | "denied";

// Só os dois valores conhecidos; qualquer outra coisa no cookie = sem escolha.
export function parseConsent(value: string | undefined): Consent | undefined {
  return value === "granted" || value === "denied" ? value : undefined;
}
