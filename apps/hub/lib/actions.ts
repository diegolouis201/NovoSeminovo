"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { HubApiError, hubFetch } from "./api";

// Ações do Hub. Toda entrada é validada de novo na API (zod); aqui só
// limitamos o tamanho e repassamos. Ações do Comercial usam as rotas
// /sales/* do site, as do Hub as rotas /hub/*.
export type Resultado = { ok?: string; erro?: string };
const txt = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const id = (v: string) => (/^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : "");
// "2026-11-10" + "14:30" no horário de Brasília -> ISO com fuso.
const quando = (dia: string, hora: string) => (/^\d{4}-\d{2}-\d{2}$/.test(dia) ? `${dia}T${/^\d{2}:\d{2}$/.test(hora) ? hora : "09:00"}:00-03:00` : "");

async function run(fn: () => Promise<unknown>, ok: string, paths: string[]): Promise<Resultado> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Seu perfil não tem permissão para isto." : e.message };
    throw e;
  }
  for (const p of paths) revalidatePath(p, "layout");
  return { ok };
}

export async function entrar(_: Resultado, form: FormData): Promise<Resultado> {
  try {
    await signIn("credentials", { email: txt(form, "email", 200), password: txt(form, "password", 200), redirectTo: "/" });
  } catch (e) {
    if ((e as { type?: string }).type === "CredentialsSignin") return { erro: "E-mail ou senha incorretos, ou esta conta não tem acesso ao Hub." };
    throw e;
  }
  return {};
}

export async function sair() {
  await signOut({ redirectTo: "/entrar" });
}

export async function registrarAtividade(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  if (!card) return { erro: "Esta empresa ainda não tem card no Comercial." };
  return run(() => hubFetch(`/sales/prospects/${card}/notes`, { method: "POST", body: { body: txt(form, "texto"), kind: txt(form, "tipo", 20) || "note" } }), "Atividade registrada.", ["/"]);
}

export async function novaTarefa(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  const dueAt = quando(txt(form, "dia", 10), txt(form, "hora", 5));
  if (!dueAt) return { erro: "Escolha o dia da tarefa." };
  return run(
    () => hubFetch("/hub/tarefas", { method: "POST", body: { title: txt(form, "titulo", 200), kind: txt(form, "tipo", 20) || "tarefa", dueAt, notes: txt(form, "obs") || undefined, prospectId: card || undefined } }),
    "Tarefa criada.",
    ["/"],
  );
}

export async function concluirTarefa(form: FormData) {
  const t = id(txt(form, "id", 40));
  if (t) await run(() => hubFetch(`/hub/tarefas/${t}/concluir`, { method: "POST" }), "", ["/"]);
}

export async function moverEtapa(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  const stage = txt(form, "etapa", 30);
  const body: Record<string, string> = { stage };
  if (stage === "perdida") {
    body.lostCategory = txt(form, "categoria", 30);
    if (txt(form, "motivo", 500)) body.lostReason = txt(form, "motivo", 500);
  }
  return run(() => hubFetch(`/sales/prospects/${card}/move`, { method: "POST", body }), "Etapa atualizada.", ["/"]);
}

export async function marcarContato(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  const at = quando(txt(form, "dia", 10), txt(form, "hora", 5));
  return run(() => hubFetch(`/sales/prospects/${card}/next-contact`, { method: "POST", body: { at: at || null, kind: txt(form, "tipo", 20) || undefined } }), at ? "Próximo contato marcado." : "Próximo contato removido.", ["/"]);
}

export async function marcar(_: Resultado, form: FormData): Promise<Resultado> {
  const key = id(txt(form, "chave", 40));
  const tags = txt(form, "tags", 600).split(",").map((t) => t.trim()).filter(Boolean);
  return run(
    () =>
      hubFetch(`/hub/marcacoes/${key}`, {
        method: "POST",
        body: {
          importante: form.get("importante") === "on",
          motivoImportante: txt(form, "motivoImportante", 300) || undefined,
          naoContatar: form.get("naoContatar") === "on",
          motivoNaoContatar: txt(form, "motivoNaoContatar", 300) || undefined,
          tags,
          nota: txt(form, "nota") || undefined,
        },
      }),
    "Marcações salvas.",
    ["/"],
  );
}

export async function salvarMeta(_: Resultado, form: FormData): Promise<Resultado> {
  const num = (k: string) => Number(txt(form, k, 20).replace(/\./g, "").replace(",", "."));
  return run(() => hubFetch("/hub/meta", { method: "POST", body: { month: txt(form, "mes", 7), newSubscriptions: Math.round(num("assinaturas")), revenue: num("faturamento") } }), "Meta salva.", ["/vendas"]);
}

export async function salvarMembro(_: Resultado, form: FormData): Promise<Resultado> {
  return run(() => hubFetch("/hub/equipe", { method: "POST", body: { email: txt(form, "email", 200), name: txt(form, "nome", 120) || undefined, profile: txt(form, "perfil", 20) } }), "Acesso salvo. A pessoa define a senha em “Esqueci minha senha” no site.", ["/equipe"]);
}

export async function ativarMembro(form: FormData) {
  const u = id(txt(form, "userId", 40));
  if (u) await run(() => hubFetch(`/hub/equipe/${u}/ativo`, { method: "POST", body: { active: form.get("ativo") === "1" } }), "", ["/equipe"]);
}

export async function irPara(form: FormData) {
  const q = txt(form, "q", 100);
  redirect(`/empresas${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}
