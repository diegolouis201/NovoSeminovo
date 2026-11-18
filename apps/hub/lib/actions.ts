"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import type { ProspeccaoAnalise, ProspeccaoResultado } from "@novoseminovo/shared-types";
import { HubApiError, hubFetch, hubUpload } from "./api";

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

// E-mail digitado na ficha (empresa sem e-mail): grava no cadastro do card.
export async function salvarEmailContato(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  if (!card) return { erro: "Esta empresa ainda não tem card no Comercial." };
  return run(() => hubFetch(`/sales/prospects/${card}/profile`, { method: "POST", body: { email: txt(form, "email", 200) } }), "E-mail salvo no cadastro.", ["/"]);
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

// -------------------------------------------------------------- Marketing
export async function aprovarConteudo(_: Resultado, form: FormData): Promise<Resultado> {
  const c = id(txt(form, "id", 40));
  const agora = form.get("agora") === "1";
  const quando = txt(form, "quando", 16); // "2026-11-10T14:30" (horário de Brasília)
  const publicarEm = agora ? new Date().toISOString() : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando) ? `${quando}:00-03:00` : undefined;
  return run(() => hubFetch(`/hub/marketing/conteudos/${c}/aprovar`, { method: "POST", body: publicarEm ? { publicarEm } : {} }), agora ? "Aprovado: publica em até 2 minutos." : "Aprovado e agendado.", ["/marketing"]);
}

export async function pedirAjuste(_: Resultado, form: FormData): Promise<Resultado> {
  const c = id(txt(form, "id", 40));
  return run(() => hubFetch(`/hub/marketing/conteudos/${c}/ajuste`, { method: "POST", body: { feedback: txt(form, "feedback") } }), "Pedido de ajuste enviado ao Claude do Marketing.", ["/marketing"]);
}

export async function cancelarConteudo(form: FormData) {
  const c = id(txt(form, "id", 40));
  if (c) await run(() => hubFetch(`/hub/marketing/conteudos/${c}/cancelar`, { method: "POST" }), "", ["/marketing"]);
}

// Excluir de vez um conteúdo cancelado e voltar para a lista.
export async function excluirConteudo(form: FormData) {
  const c = id(txt(form, "id", 40));
  if (!c) return;
  const r = await run(() => hubFetch(`/hub/marketing/conteudos/${c}`, { method: "DELETE" }), "", ["/marketing"]);
  if (!r.erro) redirect("/marketing/conteudos?status=cancelado");
}

export async function marcarPublicadoManual(_: Resultado, form: FormData): Promise<Resultado> {
  const c = id(txt(form, "id", 40));
  return run(() => hubFetch(`/hub/marketing/conteudos/${c}/publicado`, { method: "POST", body: { rede: txt(form, "rede", 20), link: txt(form, "link", 500) } }), "Marcado como publicado.", ["/marketing"]);
}

export async function atualizarMetricas(form: FormData) {
  const c = id(txt(form, "id", 40));
  if (c) await run(() => hubFetch(`/hub/marketing/conteudos/${c}/metricas`, { method: "POST" }), "", ["/marketing"]);
}

export async function salvarOrcamentos(_: Resultado, form: FormData): Promise<Resultado> {
  const mes = txt(form, "mes", 7);
  try {
    for (const p of ["meta_ads", "google_ads", "tiktok_ads"]) {
      const v = txt(form, p, 20);
      if (v) await hubFetch("/hub/marketing/orcamentos", { method: "POST", body: { mes, plataforma: p, valor: valorBr(v) } });
    }
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.message };
    throw e;
  }
  revalidatePath("/marketing", "layout");
  return { ok: "Orçamento salvo." };
}

export async function aprovarTodosConteudos(_: Resultado): Promise<Resultado & { aprovados?: number; semData?: number }> {
  try {
    const r = await hubFetch<{ aprovados: number; semData: number }>("/hub/marketing/aprovar-todos", { method: "POST" });
    revalidatePath("/marketing", "layout");
    return { ok: `${r.aprovados} aprovado(s) com a data e a hora de cada um.${r.semData ? ` ${r.semData} sem data ficaram na fila.` : ""}`, ...r };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.message };
    throw e;
  }
}

export async function aprovarImpulso(form: FormData) {
  const c = id(txt(form, "id", 40));
  if (c) await run(() => hubFetch(`/hub/marketing/conteudos/${c}/impulso/aprovar`, { method: "POST" }), "", ["/marketing"]);
}

export async function salvarEstrategia(_: Resultado, form: FormData): Promise<Resultado> {
  const p = txt(form, "plataforma", 20);
  const campos = ["status", "objetivo", "publico", "frequencia", "formatos", "horario", "tom", "notas"];
  return run(() => hubFetch(`/hub/marketing/estrategias/${encodeURIComponent(p)}`, { method: "POST", body: Object.fromEntries(campos.map((k) => [k, txt(form, k, 4000)])) }), "Estratégia salva.", ["/marketing"]);
}

export async function salvarRegrasImpulso(_: Resultado, form: FormData): Promise<Resultado> {
  const campos = ["objetivo", "criterios", "publicos", "orcamento", "execucao", "regras"];
  const limite = Number(txt(form, "limiteDia", 10).replace(",", "."));
  return run(() => hubFetch("/hub/marketing/impulso/regras", { method: "POST", body: { ...Object.fromEntries(campos.map((k) => [k, txt(form, k, 3000)])), ...(Number.isFinite(limite) && limite > 0 ? { limiteDia: limite } : {}) } }), "Estratégia salva.", ["/marketing"]);
}

export async function novoConteudo(_: Resultado, form: FormData): Promise<Resultado> {
  const arquivos = form.getAll("imagens").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  try {
    const midias: string[] = [];
    for (const f of arquivos) {
      if (/\.(mp4|mov)$/i.test(f.name) || f.type.startsWith("video/")) {
        if (f.size > 150_000_000) return { erro: `${f.name}: vídeo acima de 150 MB.` };
        midias.push((await hubUpload<{ url: string }>("/hub/marketing/midias/video", "video", f)).url);
        continue;
      }
      if (f.size > 8_000_000) return { erro: `${f.name}: imagem acima de 8 MB.` };
      const base64 = Buffer.from(await f.arrayBuffer()).toString("base64");
      midias.push((await hubFetch<{ url: string }>("/hub/marketing/midias", { method: "POST", body: { nome: f.name.slice(0, 120), base64 } })).url);
    }
    const quando = txt(form, "quando", 16);
    await hubFetch("/hub/marketing/conteudos", {
      method: "POST",
      body: {
        tipo: txt(form, "tipo", 20),
        redes: form.getAll("redes").map(String).slice(0, 9),
        titulo: txt(form, "titulo", 160),
        legenda: txt(form, "legenda", 5000),
        hashtags: txt(form, "hashtags", 1000).split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean).slice(0, 30),
        midias: [...midias, ...txt(form, "links", 2000).split(/\s+/).filter((u) => u.startsWith("https://")).slice(0, 10 - midias.length)],
        dataPlanejada: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando) ? `${quando}:00-03:00` : undefined,
      },
    });
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.message };
    throw e;
  }
  revalidatePath("/marketing", "layout");
  return { ok: "Conteúdo criado e enviado para aprovação." };
}

// Jornada: premissas (estimativas) do dono. "1.200" = mil e duzentos;
// "2.5" ou "2,5" = dois e meio. A API valida as faixas de novo (zod).
const numeroBr = (s: string) => {
  const v = s.replace(/R\$|\s|×|x/gi, "");
  if (!v) return Number.NaN;
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ""));
  return Number(v);
};
export async function salvarJornada(_: Resultado, form: FormData): Promise<Resultado> {
  const n = (k: string) => numeroBr(txt(form, k, 20));
  const body = {
    ticketMedio: n("ticketMedio"),
    multiploValuation: n("multiploValuation"),
    seguidoresPorCliente: { instagram: n("instagram"), facebook: n("facebook"), tiktok: n("tiktok"), youtube: n("youtube"), linkedin: n("linkedin") },
  };
  const valores = [body.ticketMedio, body.multiploValuation, ...Object.values(body.seguidoresPorCliente)];
  if (valores.some((v) => !Number.isFinite(v))) return { erro: "Preencha todos os campos com números." };
  return run(() => hubFetch("/hub/jornada/premissas", { method: "POST", body }), "Premissas salvas.", ["/jornada"]);
}

// Jornada: número de seguidores digitado pelo dono. "1.520" ou "1520" =
// mil quinhentos e vinte (seguidor é inteiro). A API valida rede e faixa (zod).
const REDES_JORNADA = ["instagram", "facebook", "tiktok", "youtube", "linkedin"];
export async function salvarSeguidoresJornada(_: Resultado, form: FormData): Promise<Resultado> {
  const rede = txt(form, "rede", 20);
  const bruto = txt(form, "valor", 20).replace(/\s/g, "");
  if (!REDES_JORNADA.includes(rede)) return { erro: "Rede inválida." };
  if (!/^\d{1,3}(\.\d{3})+$|^\d{1,10}$/.test(bruto)) return { erro: "Digite só o número inteiro (ex.: 1520)." };
  const valor = Number(bruto.replace(/\./g, ""));
  return run(() => hubFetch("/hub/jornada/seguidores", { method: "POST", body: { rede, valor } }), "Salvo.", ["/jornada"]);
}

// SEO (Search Console): o dono força a leitura, ignorando o cache de 6 horas.
// A API limita a uma vez a cada 5 minutos.
export async function atualizarSeo(_: Resultado, form: FormData): Promise<Resultado> {
  const dias = Number(txt(form, "dias", 3));
  if (![7, 28, 90].includes(dias)) return { erro: "Período inválido." };
  return run(() => hubFetch("/hub/seo/atualizar", { method: "POST", body: { dias } }), "Dados atualizados.", ["/marketing/seo"]);
}

// -------------------------------------------------------------- Prospecção
// Importar empresas do Mailerfind (CSV do Google Maps): analisar mostra a
// prévia sem gravar; confirmar manda o mesmo arquivo e grava. A API decide o
// tipo do arquivo pelo conteúdo e confere tudo de novo (zod).
export type ImportacaoAnalise = { erro?: string; analise?: ProspeccaoAnalise };
export type ImportacaoResultado = { erro?: string; resultado?: ProspeccaoResultado };
const LIMITE_CSV = 5 * 1024 * 1024;

function arquivoCsv(form: FormData): File | string {
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return "Escolha o arquivo CSV exportado do Mailerfind.";
  if (arquivo.size > LIMITE_CSV) return "Arquivo grande demais: o máximo é 5 MB.";
  return arquivo;
}

export async function analisarImportacao(form: FormData): Promise<ImportacaoAnalise> {
  const arquivo = arquivoCsv(form);
  if (typeof arquivo === "string") return { erro: arquivo };
  try {
    return { analise: await hubUpload<ProspeccaoAnalise>("/hub/prospeccao/importar/analisar", "arquivo", arquivo) };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Seu perfil não tem permissão para importar empresas." : e.message };
    throw e;
  }
}

export async function confirmarImportacao(form: FormData): Promise<ImportacaoResultado> {
  const arquivo = arquivoCsv(form);
  if (typeof arquivo === "string") return { erro: arquivo };
  try {
    const resultado = await hubUpload<ProspeccaoResultado>("/hub/prospeccao/importar/confirmar", "arquivo", arquivo, {
      hash: txt(form, "hash", 64),
      etiqueta: txt(form, "etiqueta", 60),
      segmento: txt(form, "segmento", 10),
    });
    revalidatePath("/", "layout");
    return { resultado };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Seu perfil não tem permissão para importar empresas." : e.message };
    throw e;
  }
}

// Sequências de e-mail de prospecção. Escrever, aprovar, inscrever e ajustar:
// só o dono (a API confere). Editar tira a aprovação.
function passosDoForm(form: FormData) {
  const passos = [];
  for (let i = 0; i < 3; i++) {
    const corpo = String(form.get(`corpo${i}`) ?? "").replace(/\r\n/g, "\n").slice(0, 5000);
    if (!corpo.trim()) continue;
    passos.push({ assunto: txt(form, `assunto${i}`, 150), corpo, esperaDias: passos.length === 0 ? 0 : Math.max(0, Math.min(30, Number(txt(form, `espera${i}`, 3)) || 0)) });
  }
  return passos;
}

export async function salvarSequencia(_: Resultado, form: FormData): Promise<Resultado> {
  const seq = id(txt(form, "id", 40));
  const body = { nome: txt(form, "nome", 80), passos: passosDoForm(form) };
  let novo = "";
  const r = await run(
    async () => {
      const s = await hubFetch<{ id: string }>(seq ? `/hub/prospeccao/sequencias/${seq}` : "/hub/prospeccao/sequencias", { method: "POST", body });
      novo = s.id;
    },
    seq ? "Sequência salva. Ela voltou para rascunho: aprove de novo para enviar." : "Sequência criada (rascunho).",
    ["/prospeccao"],
  );
  if (!seq && novo) redirect(`/prospeccao/${novo}`);
  return r;
}

export async function aprovarSequencia(_: Resultado, form: FormData): Promise<Resultado> {
  const seq = id(txt(form, "id", 40));
  if (form.get("confirmo") !== "1") return { erro: "Marque a confirmação de que leu os e-mails." };
  return run(() => hubFetch(`/hub/prospeccao/sequencias/${seq}/aprovar`, { method: "POST", body: {} }), "Sequência aprovada e ativa. Os envios seguem o horário e o limite do dia.", ["/prospeccao"]);
}

export async function pausarSequencia(_: Resultado, form: FormData): Promise<Resultado> {
  const seq = id(txt(form, "id", 40));
  return run(() => hubFetch(`/hub/prospeccao/sequencias/${seq}/pausar`, { method: "POST", body: {} }), "Sequência pausada.", ["/prospeccao"]);
}

export type ResultadoInscricao = Resultado & { detalhe?: string };
export async function inscreverSequencia(_: ResultadoInscricao, form: FormData): Promise<ResultadoInscricao> {
  const seq = id(txt(form, "id", 40));
  const etiqueta = txt(form, "etiqueta", 60);
  if (!etiqueta) return { erro: "Escolha a etiqueta." };
  try {
    const r = await hubFetch<{ inscritas: number; puladas: Record<string, number> }>(`/hub/prospeccao/sequencias/${seq}/inscrever`, { method: "POST", body: { etiqueta } });
    revalidatePath("/prospeccao", "layout");
    const p = r.puladas;
    const nomes: Record<string, string> = { jaInscritas: "já inscritas", emOutraSequencia: "em outra sequência ativa", semEmail: "sem e-mail", sairam: "pediram para sair", parceiras: "já parceiras", outraEtapa: "fora de “A abordar”" };
    const detalhe = Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${v} ${nomes[k] ?? k}`).join(" · ");
    return { ok: `${r.inscritas} empresa(s) inscrita(s).`, detalhe: detalhe ? `Fora: ${detalhe}.` : undefined };
  } catch (e) {
    if (e instanceof HubApiError) return { erro: e.status === 403 ? "Só o dono inscreve empresas nas sequências." : e.message };
    throw e;
  }
}

export async function salvarAjustesProspeccao(_: Resultado, form: FormData): Promise<Resultado> {
  const limiteDiario = Number(txt(form, "limite", 3));
  const pausado = form.get("pausado") === "1";
  return run(() => hubFetch("/hub/prospeccao/ajustes", { method: "POST", body: { limiteDiario, pausado } }), pausado ? "Envios pausados." : "Ajustes salvos.", ["/prospeccao"]);
}

export async function marcarRespondeu(_: Resultado, form: FormData): Promise<Resultado> {
  const card = id(txt(form, "card", 40));
  if (!card) return { erro: "Esta empresa ainda não tem card." };
  return run(() => hubFetch(`/hub/prospeccao/empresas/${card}/respondeu`, { method: "POST", body: {} }), "Marcado: respondeu. A sequência de e-mails parou para esta empresa.", ["/"]);
}
