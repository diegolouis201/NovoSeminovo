import { headers } from "next/headers";

// O app do celular (mobile/capacitor.config.ts) se identifica no user agent.
// Dentro dele não se vende plano pago: Apple e Google exigem o pagamento
// delas para isso, então a compra fica só no site (ver mobile/README.md).
export const APP_USER_AGENT_MARK = "NovoSeminovoApp";

export function isAppRequest(): boolean {
  return (headers().get("user-agent") ?? "").includes(APP_USER_AGENT_MARK);
}

export const IN_APP_PURCHASE_BLOCKED = "Planos pagos não estão disponíveis no app.";
