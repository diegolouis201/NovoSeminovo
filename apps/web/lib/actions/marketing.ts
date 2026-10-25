"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MarketingDecisionInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { mktDecide, mktRefreshMetrics, mktSaveCampaign, mktSavePost, mktSuggestionToPost } from "@/lib/api";

const PAGE = "/admin/marketing";

async function token(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return session.accessToken;
}

function back(result: { ok: boolean; error?: string }, success: string, tab: string, page = PAGE): never {
  revalidatePath(page);
  const message = result.ok ? `sucesso=${encodeURIComponent(success)}` : `erro=${encodeURIComponent(result.error ?? "Não foi possível salvar agora.")}`;
  redirect(`${page}?aba=${tab}&${message}`);
}

function text(formData: FormData, name: string): string | undefined {
  return String(formData.get(name) ?? "").trim() || undefined;
}

// datetime-local vem sem fuso: é horário de Brasília.
function brtIso(value: string | undefined): string | undefined {
  return value ? `${value.length === 16 ? `${value}:00` : value}-03:00` : undefined;
}

const DECISION_MESSAGES: Record<MarketingDecisionInput["action"], string> = {
  approve: "Aprovado.",
  schedule: "Agendado.",
  changes: "Pedido de alteração enviado ao agente de Marketing.",
  reject: "Rejeitado.",
  pause: "Pausado — volta para a sua aprovação.",
};

export async function mktDecisionAction(kind: "posts" | "campaigns" | "sequences", id: string, formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "") as MarketingDecisionInput["action"];
  const result = await mktDecide(kind, id, { action, note: text(formData, "note"), scheduledFor: brtIso(text(formData, "scheduledFor")) }, await token());
  const tab = kind === "posts" ? "posts" : kind === "campaigns" ? "email" : "sequencias";
  back(result, DECISION_MESSAGES[action] ?? "Feito.", tab);
}

export async function mktSavePostAction(id: string | undefined, formData: FormData): Promise<void> {
  const result = await mktSavePost(
    id,
    {
      title: text(formData, "title") ?? "",
      caption: text(formData, "caption") ?? "",
      hashtags: (text(formData, "hashtags") ?? "").split(/[\s,]+/).filter(Boolean),
      extraText: text(formData, "extraText"),
      artSource: (text(formData, "artSource") ?? "brand") as "listing" | "ai" | "brand",
      artHeadline: text(formData, "artHeadline") ?? "",
      artSubline: text(formData, "artSubline"),
      listingId: text(formData, "listingId"),
      artPrompt: text(formData, "artPrompt"),
    },
    await token(),
  );
  back(result, id ? "Post atualizado — confira a nova arte e aprove." : "Post criado — confira a arte e aprove.", "posts");
}

export async function mktSaveCampaignAction(id: string | undefined, formData: FormData): Promise<void> {
  const result = await mktSaveCampaign(
    id,
    {
      name: text(formData, "name") ?? "",
      subject: text(formData, "subject") ?? "",
      preheader: text(formData, "preheader"),
      body: text(formData, "body") ?? "",
      ctaLabel: text(formData, "ctaLabel"),
      ctaUrl: text(formData, "ctaUrl"),
      interests: formData.getAll("interests").map(String) as ("geral" | "comprar_carro" | "comprar_imovel" | "vender" | "loja")[],
    },
    await token(),
  );
  back(result, id ? "Campanha atualizada — revise e aprove." : "Campanha criada — revise e aprove.", "email");
}

export async function mktSuggestionToPostAction(id: string): Promise<void> {
  const result = await mktSuggestionToPost(id, await token());
  back(result, "O agente de Marketing vai montar o post em instantes; ele aparece em Marketing → Posts para você aprovar.", "posts");
}

export async function mktRefreshMetricsAction(): Promise<void> {
  const result = await mktRefreshMetrics(await token());
  back(result, "Métricas atualizadas.", "resultados");
}
