import { cookies, headers } from "next/headers";
import { ACQUISITION_COOKIE, APRESENTACAO_TARGET, cleanCampaignUtm } from "@novoseminovo/shared-types";
import { cabecalhosRedirect, cookieDeOrigem } from "@/lib/apresentacao/regras";

// Link de campanha da apresentação para empresas (e-mails do Caio e da Nina):
// /apresentacao-empresas?utm_source=prospeccao&utm_campaign=caio_veiculos&utm_content=apresentacao
// grava a origem no cookie ns_origem (o cadastro feito depois herda), conta a
// abertura no Hub (/prospeccao, só a soma por dia) e manda para o PDF. Destino
// fixo; utm só [a-z0-9_-] (o resto é descartado, nunca devolvido na resposta).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function visitorIp(): string | undefined {
  const h = headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip"))?.split(",")[0]?.trim().slice(0, 64) || undefined;
}

async function contarVisita(utm: ReturnType<typeof cleanCampaignUtm>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  const ip = visitorIp();
  try {
    await fetch(`${API_URL}/campaign-visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip ? { "x-client-ip": ip } : {}) },
      body: JSON.stringify({ target: APRESENTACAO_TARGET, source: utm.source, medium: utm.medium, campaign: utm.campaign, content: utm.content }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    // API fora do ar: a pessoa vai para o PDF do mesmo jeito.
  } finally {
    clearTimeout(timeout);
  }
}

function redirecionar(request: Request, utm: ReturnType<typeof cleanCampaignUtm>): Response {
  const out = new Headers(cabecalhosRedirect());
  const secure = new URL(request.url).protocol === "https:" || headers().get("x-forwarded-proto") === "https";
  const cookie = cookieDeOrigem(utm, { hasCookie: cookies().has(ACQUISITION_COOKIE), secure });
  if (cookie) out.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers: out });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const utm = cleanCampaignUtm((name) => params.get(name));
  await contarVisita(utm);
  return redirecionar(request, utm);
}

// HEAD (verificador de link do e-mail, curl -I) não conta abertura.
export function HEAD(request: Request) {
  const params = new URL(request.url).searchParams;
  return redirecionar(request, cleanCampaignUtm((name) => params.get(name)));
}
