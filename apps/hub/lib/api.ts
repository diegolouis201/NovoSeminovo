import { redirect } from "next/navigation";
import { auth } from "@/auth";

// O Hub fala com a API só pelo servidor (nunca pelo navegador): no Docker,
// pela rede interna (http://api:4000), sem passar pela internet nem pelo CORS.
export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class HubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function token(): Promise<string> {
  const session = await auth();
  const t = (session as unknown as { accessToken?: string } | null)?.accessToken;
  if (!t) redirect("/entrar");
  return t;
}

export async function hubFetch<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await token()}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401) redirect("/entrar?expirou=1");
  if (!res.ok) {
    let message = "Não foi possível concluir. Tente de novo.";
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    } catch {
      /* resposta sem JSON */
    }
    throw new HubApiError(message, res.status);
  }
  return (await res.json()) as T;
}
