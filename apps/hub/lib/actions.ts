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

// ------------------------------------------------------------ Financeiro
const valorBr = (s: string) => Number(s.replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."));
const dataOk = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

export async function novoLancamento(_: Resultado, form: FormData): Promise<Resultado> {
  const vencimento = dataOk(txt(form, "vencimento", 10));
  const pago = form.get("pago") === "on";
  const body = {
    tipo: txt(form, "tipo", 10),
    descricao: txt(form, "descricao", 200),
    contraparte: txt(form, "contraparte", 120) || undefined,
    categoria: txt(form, "categoria", 3),
    valor: valorBr(txt(form, "valor", 20)),
    competencia: dataOk(txt(form, "competencia", 10)) || vencimento,
    vencimento,
    parcelas: Math.max(1, Number(txt(form, "parcelas", 3)) || 1),
    recorrente: txt(form, "repetir", 20) === "recorrente",
    pago,
    pagoEm: pago ? vencimento : undefined,
    contaId: txt(form, "conta", 40) || undefined,
    observacao: txt(form, "observacao", 1000) || undefined,
  };
  if (!vencimento) return { erro: "Escolha a data de vencimento." };
  if (!Number.isFinite(body.valor) || body.valor <= 0) return { erro: "Valor inválido." };
  return run(() => hubFetch("/hub/financeiro/lancamentos", { method: "POST", body }), "Lançamento criado.", ["/financeiro"]);
}

export async function baixarLancamento(_: Resultado, form: FormData): Promise<Resultado> {
  const l = id(txt(form, "id", 40));
  return run(() => hubFetch(`/hub/financeiro/lancamentos/${l}/baixar`, { method: "POST", body: { pagoEm: dataOk(txt(form, "pagoEm", 10)), contaId: txt(form, "conta", 40) } }), "Baixado.", ["/financeiro"]);
}

export async function acaoLancamento(form: FormData) {
  const l = id(txt(form, "id", 40));
  const acao = txt(form, "acao", 10);
  if (l && (acao === "cancelar" || acao === "reabrir")) await run(() => hubFetch(`/hub/financeiro/lancamentos/${l}/${acao}`, { method: "POST" }), "", ["/financeiro"]);
}

export async function editarCategoria(form: FormData) {
  const l = id(txt(form, "id", 40));
  const categoria = txt(form, "categoria", 3);
  if (l && /^[A-Z]\d{2}$/.test(categoria)) await run(() => hubFetch(`/hub/financeiro/lancamentos/${l}`, { method: "POST", body: { categoria } }), "", ["/financeiro"]);
}

export async function novaConta(_: Resultado, form: FormData): Promise<Resultado> {
  const saldo = valorBr(txt(form, "saldoInicial", 20) || "0");
  return run(
    () => hubFetch("/hub/financeiro/contas", { method: "POST", body: { nome: txt(form, "nome", 80), banco: txt(form, "banco", 80) || undefined, tipo: txt(form, "tipo", 20) || "corrente", saldoInicial: Number.isFinite(saldo) ? saldo : 0, saldoInicialEm: dataOk(txt(form, "saldoInicialEm", 10)) } }),
    "Conta criada.",
    ["/financeiro"],
  );
}

export async function transferir(_: Resultado, form: FormData): Promise<Resultado> {
  return run(
    () => hubFetch("/hub/financeiro/transferencias", { method: "POST", body: { deContaId: txt(form, "de", 40), paraContaId: txt(form, "para", 40), valor: valorBr(txt(form, "valor", 20)), data: dataOk(txt(form, "data", 10)), descricao: txt(form, "descricao", 200) || undefined } }),
    "Transferência registrada.",
    ["/financeiro"],
  );
}

export type ResultadoImportacao = Resultado & { lancamentos?: number; transferencias?: number; repetidos?: number; erros?: string[] };
export async function importarArquivo(_: ResultadoImportacao, form: FormData): Promise<ResultadoImportacao> {
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha o arquivo." };
  if (arquivo.size > 2_000_000) return { erro: "Arquivo grande demais (máximo 2 MB)." };
  const nome = arquivo.name.toLowerCase();
  const formato = nome.endsWith(".ofx") ? "ofx" : nome.endsWith(".csv") || nome.endsWith(".txt") ? "planilha" : "";
  if (!formato) return { erro: "Use o extrato do banco em .ofx ou a planilha salva como .csv." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  // Planilha do Excel em CSV costuma vir em Windows-1252; o resto em UTF-8.
  let texto = bytes.toString("utf8");
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes);
  try {
    const r = await hubFetch<{ lancamentos: number; transferencias: number; repetidos: number; erros: string[] }>("/hub/financeiro/importar", { method: "POST", body: { formato, texto, contaId: txt(form, "conta", 40) || undefined } });
    revalidatePath("/financeiro", "layout");
    return { ok: "Importação concluída.", ...r };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.message };
    throw e;
  }
}
