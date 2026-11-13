import { auth } from "@/auth";
import { dateBr, toCsv } from "@/lib/planilha-excel";
import type { PartnerSendsReport } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STATUS: Record<string, string> = {
  new: "Novo",
  contacted: "Contato feito",
  documents: "Documentação",
  credit_analysis: "Análise de crédito",
  approved: "Aprovado",
  property_appraisal: "Avaliação do imóvel",
  contract: "Contrato",
  converted: "Concluído",
  lost: "Perdido",
};

// Envios aos parceiros de crédito da IBS no mês (ver
// FinancingDealsService.partnerSends): um pedido por linha, com o id do lead
// na Creditas/Credihome para conferir com a IBS. ?mes=AAAA-MM
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return new Response("Acesso restrito.", { status: 403 });

  const month = new URL(request.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Informe o mês no formato AAAA-MM.", { status: 400 });

  const upstream = await fetch(`${API_URL}/admin/partner-sends?month=${month}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Não foi possível gerar o relatório agora.", { status: upstream.status });
  const report = (await upstream.json()) as PartnerSendsReport;

  const csv = toCsv(
    [
      "Data do envio", "Parceiro", "Id do lead no parceiro", "Fase no parceiro", "Cliente", "Tipo", "Anúncio",
      "Valor do bem", "Entrada", "Valor a financiar", "Comissão %", "Comissão potencial (R$)", "Etapa no quadro",
    ],
    [
      ...report.rows.map((row) => [
        dateBr(row.sentAt), row.partner, row.partnerLeadId, row.partnerPhase, row.client,
        row.assetType === "vehicle" ? "Veicular" : row.assetType === "property" ? "Imobiliário" : "",
        row.listingTitle, row.assetValue, row.downPayment, row.financingValue, row.commissionRate, row.potentialCommission,
        STATUS[row.status] ?? row.status,
      ]),
      ["TOTAL", `${report.total.count} envio(s)`, "", "", "", "", "", "", "", report.total.financingValue, "", report.total.potentialCommission, ""],
    ],
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="envios-parceiros-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
