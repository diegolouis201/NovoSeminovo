import { createHash, timingSafeEqual } from "node:crypto";
import { readSecret } from "../auth/secret-file";

// Entrada de empresas por automação (um agendamento fora do servidor chama
// POST /hub/prospects/ingest). Regras puras, testadas em ingestao.spec.ts.

const COMO = "gere com `openssl rand -hex 32 > secrets/prospeccao_ingest_key && chmod 600 secrets/prospeccao_ingest_key` (ver DEPLOY.md, \"Vendedores IA\")";

// Lê a chave do arquivo secrets/prospeccao_ingest_key (readSecret) e compara
// em tempo constante (hash dos dois lados: tamanho diferente não vaza nada).
export function chaveDeIngestaoConfere(recebida: unknown, ler: () => string = () => readSecret("PROSPECCAO_INGEST_KEY", process.env, undefined, { howTo: COMO })): "ok" | "recusada" | "desligada" {
  let esperada: string;
  try {
    esperada = ler();
  } catch {
    return "desligada";
  }
  if (typeof recebida !== "string" || !recebida || recebida.length > 500) return "recusada";
  const a = createHash("sha256").update(recebida).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b) ? "ok" : "recusada";
}

// Limite simples em memória (a API roda numa instância só): chamadas por
// hora e tentativas com chave errada por hora.
export class LimiteIngestao {
  private chamadas: number[] = [];
  private erradas: number[] = [];
  constructor(private readonly limites = { porHora: 30, erradasPorHora: 10 }) {}

  private dentro(lista: number[], agora: Date): number[] {
    return lista.filter((t) => agora.getTime() - t < 3_600_000);
  }

  permitir(agora = new Date()): boolean {
    this.chamadas = this.dentro(this.chamadas, agora);
    if (this.chamadas.length >= this.limites.porHora) return false;
    this.chamadas.push(agora.getTime());
    return true;
  }

  bloqueado(agora = new Date()): boolean {
    this.erradas = this.dentro(this.erradas, agora);
    return this.erradas.length >= this.limites.erradasPorHora;
  }

  // Devolve false quando passou do limite de chaves erradas.
  errou(agora = new Date()): boolean {
    if (this.bloqueado(agora)) return false;
    this.erradas.push(agora.getTime());
    return true;
  }
}

const celula = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
};

// Linhas JSON → CSV com o cabeçalho do Mailerfind (o mesmo leitor do Hub).
export function linhasParaCsv(linhas: Record<string, string | number | null>[]): string {
  const colunas: string[] = [];
  for (const l of linhas) for (const k of Object.keys(l)) if (!colunas.includes(k) && colunas.length < 60) colunas.push(k);
  const nomes = colunas.map((c) => c.replace(/[",\r\n]/g, " ").trim());
  return `${nomes.join(",")}\n${linhas.map((l) => colunas.map((c) => celula(l[c])).join(",")).join("\n")}\n`;
}
