import { PROSPECCAO_RODAPE, type ProspeccaoPasso } from "@novoseminovo/shared-types";

// Regras puras das sequências de e-mail de prospecção (testadas em
// sequencia-regras.spec.ts): horário de envio, teto, intervalo, quando parar
// e o texto do e-mail (com rodapé legal e link de saída sempre).

// Brasília (America/Sao_Paulo) está em UTC-3 o ano todo desde 2019 (sem
// horário de verão).
const FUSO_MS = -3 * 3_600_000;
const DIA_MS = 86_400_000;
const ABRE_MIN = 9 * 60;
const FECHA_MIN = 17 * 60;

const local = (d: Date) => new Date(d.getTime() + FUSO_MS);
const diaUtil = (l: Date) => l.getUTCDay() >= 1 && l.getUTCDay() <= 5;
const minutos = (l: Date) => l.getUTCHours() * 60 + l.getUTCMinutes();
// Meia-noite local (como instante UTC) do dia de `l`.
const meiaNoite = (l: Date) => Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - FUSO_MS;

export function dentroDoHorario(d: Date): boolean {
  const l = local(d);
  return diaUtil(l) && minutos(l) >= ABRE_MIN && minutos(l) < FECHA_MIN;
}

export function proximoHorarioUtil(d: Date): Date {
  if (dentroDoHorario(d)) return d;
  const l = local(d);
  let dia = meiaNoite(l);
  if (!(diaUtil(l) && minutos(l) < ABRE_MIN)) dia += DIA_MS;
  while (!diaUtil(local(new Date(dia)))) dia += DIA_MS;
  return new Date(dia + ABRE_MIN * 60_000);
}

export function agendarPasso(base: Date, esperaDias: number): Date {
  return proximoHorarioUtil(new Date(base.getTime() + esperaDias * DIA_MS));
}

export function inicioDoDiaBr(d: Date): Date {
  return new Date(meiaNoite(local(d)));
}

export type MotivoEspera = "pausado" | "fora_do_horario" | "teto_do_dia" | "intervalo";
export function podeEnviar(s: { agora: Date; enviadosHoje: number; limite: number; pausado: boolean; liberadoApos?: Date }): { ok: true } | { ok: false; motivo: MotivoEspera } {
  if (s.pausado) return { ok: false, motivo: "pausado" };
  if (!dentroDoHorario(s.agora)) return { ok: false, motivo: "fora_do_horario" };
  if (s.enviadosHoje >= s.limite) return { ok: false, motivo: "teto_do_dia" };
  // Liberação mais longe que o intervalo máximo é estado velho (relógio voltou): ignora.
  if (s.liberadoApos && s.agora < s.liberadoApos && s.liberadoApos.getTime() - s.agora.getTime() <= INTERVALO_MAX_MS) return { ok: false, motivo: "intervalo" };
  return { ok: true };
}

// Entre um e-mail e outro: de 2 a 6 minutos, sorteado (parece envio à mão).
const INTERVALO_MAX_MS = 360_000;
export function intervaloEntreEnvios(sorteio: () => number = Math.random): number {
  return 120_000 + Math.floor(sorteio() * (INTERVALO_MAX_MS - 120_000));
}

export type MotivoParada = "respondeu" | "saiu" | "mudou_etapa" | "virou_parceira" | "sem_email";
export function motivoParaParar(
  card: { stage: string; repliedAt: Date | null; optedOutAt: Date | null; partnerId: string | null; email: string | null },
  bloqueio: { suprimido: boolean; naoContatar: boolean },
): MotivoParada | undefined {
  if (card.optedOutAt || bloqueio.suprimido || bloqueio.naoContatar) return "saiu";
  if (card.repliedAt) return "respondeu";
  if (card.partnerId) return "virou_parceira";
  if (card.stage !== "a_abordar") return "mudou_etapa";
  if (!card.email) return "sem_email";
  return undefined;
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Corpo em HTML: texto escapado; só http(s):// vira link; quebra de linha vira <br>.
function corpoHtml(texto: string): string {
  return escapar(texto)
    .replace(/https?:\/\/[^\s<]+/g, (url) => {
      const fim = url.match(/[.,;:!?)]+$/)?.[0] ?? "";
      const limpo = fim ? url.slice(0, -fim.length) : url;
      return `<a href="${limpo}">${limpo}</a>${fim}`;
    })
    .replace(/\r?\n/g, "<br>\n");
}

export type EmailPronto = { assunto: string; texto: string; html: string };
export function renderizarEmail(passo: ProspeccaoPasso, dados: { empresa: string; cidade?: string }, opcoes: { linkSair: string; numero: number; assuntoPrimeiro?: string }): EmailPronto {
  if (!/^https?:\/\//.test(opcoes.linkSair)) throw new Error("Link de saída precisa ser http(s).");
  const preencher = (s: string) => s.replace(/\{\{\s*empresa\s*\}\}/g, dados.empresa).replace(/\{\{\s*cidade\s*\}\}/g, dados.cidade || "sua cidade");
  const proprio = preencher(passo.assunto).replace(/[\r\n]+/g, " ").trim();
  const assunto = (proprio || `Re: ${(opcoes.assuntoPrimeiro ?? "").replace(/[\r\n]+/g, " ").trim()}`).slice(0, 200);
  const corpo = preencher(passo.corpo);
  const r = PROSPECCAO_RODAPE;
  const texto = `${corpo}\n\n--\n${r.antes} ${r.link}: ${opcoes.linkSair} ${r.depois}\n`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">
<div>${corpoHtml(corpo)}</div>
<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 12px;">
<p style="font-size:12px;color:#666;">${escapar(r.antes)} <a href="${escapar(opcoes.linkSair)}">${escapar(r.link)}</a> ${escapar(r.depois)}</p>
</body></html>`;
  return { assunto, texto, html };
}

// ------------------------------------------------------------ falha temporária
// O SMTP às vezes recusa por um problema dele, passageiro (ex.: Locaweb
// "451 4.3.0 Error: queue file write error"), ou a conexão cai. Isso não é
// culpa do endereço: a inscrição tenta de novo mais tarde (+30 min, +2 h,
// sempre dentro da janela de envio). Na 3ª falha temporária seguida no mesmo
// passo, vira "erro". Resposta 5xx (ex.: 550 caixa inexistente) é permanente.

const CODIGOS_CONEXAO = ["ECONNRESET", "ETIMEDOUT", "ESOCKET", "ECONNECTION"];
const PERMANENTE_TEXTO = /(^|[\s:])5\d\d[\s-]|(^|\s)5\.\d{1,3}\.\d{1,3}\b/;
const TEMPORARIA_TEXTO = /(^|[\s:])4\d\d[\s-]|(^|\s)4\.\d{1,3}\.\d{1,3}\b|\b(ECONNRESET|ETIMEDOUT|ESOCKET|ECONNECTION|ECONNREFUSED)\b|connection timeout|greeting never received|unexpected socket close|socket closed unexpectedly/i;

// Adiamentos das falhas temporárias: 1ª → +30 min, 2ª → +2 h; a 3ª vira erro.
export const ADIAMENTOS_MS = [30 * 60_000, 2 * 3_600_000];
export const MAX_FALHAS_TEMPORARIAS = 3;

// Texto da falha (o que já está gravado em lastError serve também).
export function textoDeFalhaTemporaria(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const t = texto.slice(0, 300);
  if (PERMANENTE_TEXTO.test(t)) return false;
  return TEMPORARIA_TEXTO.test(t);
}

export function falhaTemporaria(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { responseCode, code } = error as Error & { responseCode?: unknown; code?: unknown };
  if (typeof responseCode === "number") {
    if (responseCode >= 400 && responseCode < 500) return true;
    if (responseCode >= 500) return false;
  }
  if (typeof code === "string" && CODIGOS_CONEXAO.includes(code)) return true;
  return textoDeFalhaTemporaria(error.message);
}

// Mensagem gravada: inclui o código de conexão quando a mensagem não tem,
// para dar para reconhecer depois (botão "Reenviar falhas temporárias").
export function descreverErroSmtp(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && CODIGOS_CONEXAO.includes(code) && !error.message.includes(code)) return `${code}: ${error.message}`;
  return error.message;
}

// Quando tentar de novo depois da n-ésima falha temporária (1, 2…).
export function reagendarFalha(agora: Date, falha: number): Date {
  const espera = ADIAMENTOS_MS[Math.min(falha, ADIAMENTOS_MS.length) - 1] ?? ADIAMENTOS_MS[0]!;
  return proximoHorarioUtil(new Date(agora.getTime() + espera));
}
