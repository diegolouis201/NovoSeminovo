"use server";

import { revalidatePath } from "next/cache";
import { HubApiError, hubFetch } from "./api";
import type { Resultado } from "./actions";

// Envio automático da pesquisa NPS por e-mail: só o dono (permissão
// "equipe", conferida de novo na API) aprova, pausa ou manda o teste.
async function run(fn: () => Promise<unknown>, ok: string): Promise<Resultado> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Só o dono pode mudar o envio automático." : e.message };
    throw e;
  }
  revalidatePath("/nps", "layout");
  return { ok };
}

export async function aprovarEnvioNps(_: Resultado, _form: FormData): Promise<Resultado> {
  return run(() => hubFetch("/hub/nps/envio/aprovar", { method: "POST", body: {} }), "Envio automático ligado.");
}

export async function pausarEnvioNps(_: Resultado, form: FormData): Promise<Resultado> {
  const pausado = String(form.get("pausado") ?? "") === "1";
  return run(() => hubFetch("/hub/nps/envio/pausa", { method: "POST", body: { pausado } }), pausado ? "Envio pausado." : "Envio retomado.");
}

export type TesteNps = Resultado & { html?: string; assunto?: string };

export async function emailTesteNps(_: TesteNps, _form: FormData): Promise<TesteNps> {
  try {
    const r = await hubFetch<{ para: string; enviado: boolean; motivo?: string; previa: { subject: string; html: string } }>("/hub/nps/envio/teste", { method: "POST", body: {} });
    revalidatePath("/nps/envio");
    return {
      ok: r.enviado ? `E-mail de teste enviado para ${r.para}.` : `${r.motivo ?? "Não foi enviado."} Seria enviado para ${r.para}.`,
      html: r.previa.html,
      assunto: r.previa.subject,
    };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Só o dono pode mandar o e-mail de teste." : e.message };
    throw e;
  }
}
