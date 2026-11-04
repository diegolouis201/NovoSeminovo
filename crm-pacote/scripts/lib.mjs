// Funções comuns dos scripts do CRM. Node 18 ou mais novo, sem instalar nada.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const path = (...parts) => join(ROOT, ...parts);

// Lê o .env sem nunca mostrar o valor das chaves.
export function env(name) {
  if (process.env[name]) return process.env[name];
  const file = path(".env");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && match[1] === name) return match[2].replace(/^["']|["']$/g, "").trim() || undefined;
  }
  return undefined;
}

export async function api(pathname, { method = "GET", body } = {}) {
  const base = (env("NSN_API") ?? "https://api.novoseminovo.com.br").replace(/\/$/, "");
  const key = env("NSN_CRM_KEY");
  if (!key) throw new Error("Falta NSN_CRM_KEY no arquivo .env (veja .env.exemplo).");
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {}
    throw new Error(`O site respondeu ${res.status}: ${String(message).slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
}

export function readJson(relative, fallback) {
  const file = path(relative);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(relative, data) {
  const file = path(relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function writeText(relative, text) {
  const file = path(relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// ---------------- Datas (fuso de Brasília) ----------------

export function today(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()));
}
export const iso = (date) => date.toISOString().slice(0, 10);
export const br = (date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
const DAY = 86_400_000;
export const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / DAY);

// Próxima ocorrência (hoje ou depois) de um dia/mês. 29/02 cai em 28/02 em ano comum.
export function nextOccurrence(day, month, from) {
  for (const year of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const date = new Date(Date.UTC(year, month - 1, Math.min(day, last)));
    if (date >= from) return date;
  }
  return undefined;
}

// "DD/MM" -> próxima data; undefined se inválida.
export function nextFromDdMm(text, from) {
  const match = /^(\d{2})\/(\d{2})$/.exec(String(text ?? "").trim());
  if (!match) return undefined;
  return nextOccurrence(Number(match[1]), Number(match[2]), from);
}

// "2o domingo de maio", "ultima sexta de novembro" ou "DD/MM" -> data no ano.
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
export function sectorDate(rule, year) {
  const text = rule.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const fixed = /^(\d{2})\/(\d{2})$/.exec(text);
  if (fixed) return new Date(Date.UTC(year, Number(fixed[2]) - 1, Number(fixed[1])));
  const nth = /^(\d)o (\w+) de (\w+)$/.exec(text);
  if (nth) {
    const month = MONTHS.indexOf(nth[3]);
    const weekday = WEEKDAYS.indexOf(nth[2]);
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, month, 1 + offset + (Number(nth[1]) - 1) * 7));
  }
  const last = /^ultima (\w+) de (\w+)$/.exec(text);
  if (last) {
    const month = MONTHS.indexOf(last[2]);
    const weekday = WEEKDAYS.indexOf(last[1]);
    const end = new Date(Date.UTC(year, month + 1, 0));
    return new Date(Date.UTC(year, month, end.getUTCDate() - ((end.getUTCDay() - weekday + 7) % 7)));
  }
  return undefined;
}

export function sectorCalendar() {
  const file = path("docs", "datas-do-setor.csv");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [data, nome, publico, ideia] = line.split(";");
      return { data, nome, publico, ideia };
    });
}

// Planilha: campo que começa com = + - @ vira texto (proteção contra fórmula).
export function csvCell(value) {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(item);
  }
  return out;
}
