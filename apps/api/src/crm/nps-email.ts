import { createHmac, timingSafeEqual } from "node:crypto";
import { NPS_TOKEN_RE, npsFaixa, type NpsConta } from "@novoseminovo/shared-types";
import { currentSecret } from "../auth/secret-file";
import { LOGO_PATH } from "../email/email-template";
import { webOrigin } from "../marketing/links";

// Regras puras da pesquisa NPS por e-mail (sem banco): assinatura dos links,
// janela de envio, dias úteis, conta do NPS e o modelo do e-mail.

export type NpsTokenKind = "nota" | "acompanhamento" | "sair";
export type NpsTokenPayload = { surveyId: string; kind: NpsTokenKind; score?: number };

const DAY_MS = 86_400_000;
const TZ = "America/Sao_Paulo";

// Chave própria opcional (NPS_LINK_SECRET); sem ela, o JWT_SECRET com prefixo
// próprio (assinatura de um uso não serve em outro). Nunca valor fixo no código.
function secret(): string {
  return process.env.NPS_LINK_SECRET || currentSecret("JWT_SECRET");
}

function sign(surveyId: string, what: string, exp36: string): string {
  return createHmac("sha256", secret()).update(`nps-email:v1:${surveyId}:${what}:${exp36}`).digest("base64url").slice(0, 22);
}

// Token = id da pesquisa . nota (0–10) | c (acompanhamento) | s (sair) . validade (segundos, base 36) . assinatura.
export function signNpsToken(surveyId: string, what: number | "c" | "s", exp: Date): string {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(surveyId)) throw new Error("id de pesquisa inválido");
  if (typeof what === "number" && !(Number.isInteger(what) && what >= 0 && what <= 10)) throw new Error("nota inválida");
  const w = String(what);
  const exp36 = Math.floor(exp.getTime() / 1000).toString(36);
  return `${surveyId}.${w}.${exp36}.${sign(surveyId, w, exp36)}`;
}

export function verifyNpsToken(token: string, now: Date): NpsTokenPayload | "expirado" | null {
  if (typeof token !== "string" || token.length > 120 || !NPS_TOKEN_RE.test(token)) return null;
  const [surveyId, what, exp36, sig] = token.split(".") as [string, string, string, string];
  const expected = Buffer.from(sign(surveyId, what, exp36));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const exp = Number.parseInt(exp36, 36) * 1000;
  if (!Number.isFinite(exp)) return null;
  if (now.getTime() > exp) return "expirado";
  if (what === "c") return { surveyId, kind: "acompanhamento" };
  if (what === "s") return { surveyId, kind: "sair" };
  return { surveyId, kind: "nota", score: Number(what) };
}

function spParts(d: Date): { weekday: string; hour: number; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")), day: `${get("year")}-${get("month")}-${get("day")}` };
}

const WEEKEND = new Set(["Sat", "Sun"]);

// Segunda a sexta, das 9h às 18h (Brasília).
export function isSendWindow(now: Date): boolean {
  const p = spParts(now);
  return !WEEKEND.has(p.weekday) && p.hour >= 9 && p.hour < 18;
}

// Dia (AAAA-MM-DD) em Brasília — para o limite diário.
export function spDay(d: Date): string {
  return spParts(d).day;
}

// Início do dia (meia-noite em Brasília, UTC−3) que contém `d`.
export function spDayStart(d: Date): Date {
  return new Date(`${spDay(d)}T00:00:00-03:00`);
}

export function addBusinessDays(from: Date, n: number): Date {
  let d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (!WEEKEND.has(spParts(d).weekday)) left--;
  }
  return d;
}

export function computeNps(scores: number[]): NpsConta {
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  for (const s of scores) {
    const f = npsFaixa(s);
    if (f === "promotor") promotores++;
    else if (f === "neutro") neutros++;
    else detratores++;
  }
  const respostas = scores.length;
  return { respostas, promotores, neutros, detratores, nps: respostas ? Math.round(((promotores - detratores) / respostas) * 100) : null };
}

export function firstName(name?: string | null): string | undefined {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : undefined;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Link do e-mail só pode ser http(s) do próprio site.
function safeLink(link: string): string {
  const site = new URL(webOrigin());
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("link inválido no e-mail do NPS");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== site.origin) throw new Error("link fora do site no e-mail do NPS");
  return url.toString();
}

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

export const NPS_EMPRESA_RODAPE = "DLRLVM Soluções Ltda. · CNPJ 60.327.011/0001-02 · Belo Horizonte/MG";

const COR = (n: number) => (n >= 9 ? { bg: "#e6f4d7", fg: "#2f5c0a", bd: "#76b82a" } : n >= 7 ? { bg: "#fff3cd", fg: "#7a4f00", bd: "#e0a800" } : { bg: "#fde7e3", fg: "#a8231a", bd: "#e06b5c" });

// Modelo do e-mail (texto aprovado pelo Diego). HTML em tabelas e estilo
// inline (Gmail/Outlook), com versão em texto listando os 11 links.
export function renderNpsEmail(p: { nome?: string; empresa: string; notas: string[]; sair: string }): { subject: string; html: string; text: string } {
  if (p.notas.length !== 11) throw new Error("o e-mail do NPS precisa de 11 links (0 a 10)");
  const notas = p.notas.map(safeLink);
  const sair = safeLink(p.sair);
  const empresa = oneLine(p.empresa).slice(0, 120);
  const nome = p.nome ? oneLine(p.nome) : "";
  const ola = nome ? `Olá, ${nome}! Tudo bem?` : "Olá! Tudo bem?";
  const subject = `${empresa}, 1 minuto para nos ajudar?`;
  const site = webOrigin();
  const par1 = "A cada 6 meses a gente pergunta aos parceiros como está a experiência com o NovoSeminovo, para melhorar o que importa para você.";
  const pergunta = "De 0 a 10, quanto você recomendaria o NovoSeminovo a outra loja, imobiliária ou corretor?";
  const dica = "É só clicar na nota. Leva menos de 1 minuto.";
  const obrigado = "Obrigado por anunciar com a gente!";
  const assinatura = "Equipe NovoSeminovo · Carros e imóveis, sem enrolação.";
  const porque = "Você recebeu este e-mail porque a sua empresa tem conta de parceiro no NovoSeminovo.";
  const sairTexto = "Não quero mais receber esta pesquisa";

  const botoes = notas
    .map((href, n) => {
      const c = COR(n);
      return `<td align="center" width="9%" style="padding:0 2px;"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Nota ${n}" style="display:block;background:${c.bg};border:1px solid ${c.bd};border-radius:8px;color:${c.fg};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:40px;min-width:24px;text-align:center;text-decoration:none;">${n}</a></td>`;
    })
    .join("");

  const p0 = 'style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;"';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;border-top:6px solid #006aa4;">
<tr><td style="padding:28px 20px 8px;">
<img src="${esc(site + LOGO_PATH)}" alt="NovoSeminovo" width="150" style="display:block;border:0;margin:0 0 20px;">
<p ${p0}>${esc(ola)}</p>
<p ${p0}>${esc(par1)}</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.4;font-weight:700;color:#0e2f4a;">${esc(pergunta)}</p>
</td></tr>
<tr><td style="padding:0 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${botoes}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" style="padding:6px 2px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;">0 = nada provável</td>
<td align="right" style="padding:6px 2px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;">10 = com certeza</td>
</tr></table>
</td></tr>
<tr><td style="padding:20px 20px 28px;">
<p ${p0}>${esc(dica)}</p>
<p ${p0}>${esc(obrigado)}</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0e2f4a;font-weight:700;">${esc(assinatura)}</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#666666;">
${esc(porque)}<br>
<a href="${esc(sair)}" target="_blank" rel="noopener noreferrer" style="color:#006aa4;text-decoration:underline;">${esc(sairTexto)}</a><br>
${esc(NPS_EMPRESA_RODAPE)} · <a href="${esc(`${site}/`)}" target="_blank" rel="noopener noreferrer" style="color:#006aa4;text-decoration:none;">novoseminovo.com.br</a>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    ola,
    "",
    par1,
    "",
    pergunta,
    "",
    ...notas.map((href, n) => `${n}: ${href}`),
    "",
    dica,
    "",
    obrigado,
    assinatura,
    "",
    "--",
    porque,
    `${sairTexto}: ${sair}`,
    NPS_EMPRESA_RODAPE,
  ].join("\n");

  return { subject, html, text };
}
