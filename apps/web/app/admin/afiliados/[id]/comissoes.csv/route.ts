import { auth } from "@/auth";
import { fetchAdminAffiliateDetail } from "@/lib/api";
// Fórmula neutralizada (=, +, -, @) e formato do Excel em português.
import { dateBr, toCsv } from "@/lib/planilha-excel";

// Planilha das comissões de um afiliado (contabilidade e conferência do Pix).
// Separador ";" e vírgula decimal — abre direto no Excel em português.
const STATUS: Record<string, string> = { pending: "Em análise", available: "A pagar", paid: "Pago", canceled: "Cancelado" };

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.accessToken || session.user?.role !== "admin") return new Response("Acesso restrito", { status: 403 });
  const detail = await fetchAdminAffiliateDetail(params.id, session.accessToken);
  if (!detail) return new Response("Afiliado não encontrado", { status: 404 });

  const header = ["Data", "Indicado", "Origem", "Valor pago pelo cliente", "Percentual", "Comissão", "Situação", "Libera em", "Pago em", "Comprovante"];
  const rows = detail.commissions.map((row) => [
    dateBr(row.createdAt),
    row.referredName ?? "",
    row.description ?? "",
    row.baseAmount,
    row.rate,
    row.amount,
    STATUS[row.status] ?? row.status,
    dateBr(row.availableAt ?? ""),
    dateBr(row.paidAt ?? ""),
    row.paidNote ?? "",
  ]);
  const csv = toCsv(header, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${detail.affiliate.code}.csv"`,
    },
  });
}
