"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { IntegrationFeedFormat } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  createIntegrationFeed,
  createPartnerApiKey,
  deleteIntegrationFeed,
  revokePartnerApiKey,
  syncIntegrationFeed,
} from "@/lib/api";

const PAGE = "/parceiro/integracoes";

async function token(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return session.accessToken;
}

function back(result: { ok: boolean; error?: string }, success: string): never {
  revalidatePath(PAGE);
  if (!result.ok) redirect(`${PAGE}?error=${encodeURIComponent(result.error ?? "Erro")}`);
  redirect(`${PAGE}?sucesso=${encodeURIComponent(success)}`);
}

export async function createIntegrationFeedAction(formData: FormData): Promise<void> {
  const accessToken = await token();
  const url = String(formData.get("url") ?? "").trim();
  const format = String(formData.get("format") ?? "vrsync") as IntegrationFeedFormat;
  const result = await createIntegrationFeed({ url, format }, accessToken);
  back(result, "Feed cadastrado! A primeira sincronização começou — atualize a página em alguns instantes para ver o resultado.");
}

export async function syncIntegrationFeedAction(feedId: string): Promise<void> {
  const accessToken = await token();
  back(await syncIntegrationFeed(feedId, accessToken), "Sincronização iniciada. Atualize a página em alguns instantes para ver o resultado.");
}

export async function deleteIntegrationFeedAction(feedId: string): Promise<void> {
  const accessToken = await token();
  back(await deleteIntegrationFeed(feedId, accessToken), "Feed removido. Os anúncios já importados continuam no seu estoque.");
}

export async function revokePartnerApiKeyAction(keyId: string): Promise<void> {
  const accessToken = await token();
  back(await revokePartnerApiKey(keyId, accessToken), "Chave revogada. Integrações que usavam essa chave param de funcionar na hora.");
}

// Devolve a chave pro componente em vez de redirecionar: ela só pode
// aparecer uma vez, na tela, nunca numa URL (ficaria no histórico).
export async function createPartnerApiKeyAction(
  name: string,
): Promise<{ ok: true; key: string; prefix: string } | { ok: false; error: string }> {
  const accessToken = await token();
  const result = await createPartnerApiKey(name, accessToken);
  revalidatePath(PAGE);
  if (!result.ok) return result;
  return { ok: true, key: result.value.key, prefix: result.value.prefix };
}
