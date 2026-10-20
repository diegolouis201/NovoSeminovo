"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";
import type { FinancingLeadStatus, FinancingLeadSummary } from "@novoseminovo/shared-types";
import { moveFinancingLeadAction, saveFinancingLeadDetailsAction } from "@/lib/actions/agents";

export type KanbanColumn = { status: FinancingLeadStatus; label: string; tone: string };

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPhone(phone: string): string {
  const local = phone.startsWith("55") && phone.length > 11 ? phone.slice(2) : phone;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function whatsappLink(lead: FinancingLeadSummary): string {
  const digits = lead.phone.startsWith("55") ? lead.phone : `55${lead.phone}`;
  const text = `Olá, ${lead.name.split(" ")[0]}! Aqui é do NovoSeminovo, sobre o financiamento que você pediu pelo nosso assistente.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function daysIn(lead: FinancingLeadSummary): number {
  const since = new Date(lead.statusChangedAt ?? lead.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - since) / 86_400_000));
}

function LeadCard({
  lead,
  columns,
  onMove,
  onDragStart,
}: {
  lead: FinancingLeadSummary;
  columns: KanbanColumn[];
  onMove: (status: FinancingLeadStatus) => void;
  onDragStart: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, startSaving] = useTransition();
  const days = daysIn(lead);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      className="cursor-grab rounded-brand border border-border bg-surface-raised p-3 shadow-card active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink">{lead.name}</p>
        <span
          className={`shrink-0 text-[11px] font-semibold ${days >= 3 && lead.status !== "converted" && lead.status !== "lost" ? "text-status-danger" : "text-ink-muted"}`}
          title="Dias nesta etapa"
        >
          {days === 0 ? "hoje" : `${days}d`}
        </span>
      </div>
      <p className="text-xs text-ink-muted [font-variant-numeric:tabular-nums]">{formatPhone(lead.phone)}</p>
      {lead.listingId && (
        <Link href={`/anuncio/${lead.listingId}`} className="mt-1 block truncate text-xs font-semibold text-brand-blue hover:underline">
          {lead.listingTitle ?? "ver anúncio"}
        </Link>
      )}

      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Valor negociado</dt>
          <dd className="font-semibold text-ink [font-variant-numeric:tabular-nums]">
            {lead.negotiatedValueLabel ?? <span className="font-normal text-ink-muted">—</span>}
          </dd>
        </div>
        {!lead.negotiatedValueLabel && lead.assetValueLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Valor do bem (informado)</dt>
            <dd className="text-ink [font-variant-numeric:tabular-nums]">{lead.assetValueLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Comissão ({lead.commissionRate.toLocaleString("pt-BR")}%)</dt>
          <dd className="font-bold text-brand-green [font-variant-numeric:tabular-nums]">
            {lead.commissionAmountLabel ? (
              <>
                {lead.commissionIsEstimate && <span className="font-normal text-ink-muted">≈ </span>}
                {lead.commissionAmountLabel}
              </>
            ) : (
              <span className="font-normal text-ink-muted">—</span>
            )}
          </dd>
        </div>
        {lead.partnerShare && (
          <div className="flex justify-between gap-2" title={lead.partnerShare.receiverLabel}>
            <dt className="min-w-0 truncate text-ink-muted">
              Repasse {lead.partnerShare.percent.toLocaleString("pt-BR")}% · {lead.partnerShare.receiverLabel}
            </dt>
            <dd className="shrink-0 text-ink [font-variant-numeric:tabular-nums]">
              {lead.partnerShare.amountLabel ? `− ${lead.partnerShare.amountLabel}` : "—"}
            </dd>
          </div>
        )}
        {lead.partnerShare && lead.netCommissionLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Seu líquido</dt>
            <dd className="font-semibold text-ink [font-variant-numeric:tabular-nums]">{lead.netCommissionLabel}</dd>
          </div>
        )}
        {lead.partnerShare && lead.partnerShare.stage !== "expected" && (
          <div className="flex justify-end">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                lead.partnerShare.stage === "paid" ? "bg-brand-green text-on-green" : "bg-brand-orange text-on-orange"
              }`}
            >
              {lead.partnerShare.stage === "paid"
                ? `Repasse pago${lead.partnerShare.paidAt ? ` em ${new Date(lead.partnerShare.paidAt).toLocaleDateString("pt-BR")}` : ""}`
                : "Repasse a pagar"}
            </span>
          </div>
        )}
        {lead.bank && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Banco</dt>
            <dd className="text-ink">{lead.bank}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <a
          href={whatsappLink(lead)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Chamar ${lead.name} no WhatsApp`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-brand bg-brand-green text-on-green"
        >
          <WhatsappLogo size={18} weight="fill" />
        </a>
        <select
          value={lead.status}
          onChange={(event) => onMove(event.target.value as FinancingLeadStatus)}
          aria-label="Etapa"
          className="min-w-0 flex-1 rounded-brand border border-border bg-surface-page px-2 py-1.5 text-xs text-ink"
        >
          {columns.map((column) => (
            <option key={column.status} value={column.status}>
              {column.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          className="shrink-0 rounded-brand border border-border px-2 py-1.5 text-xs font-semibold text-ink hover:bg-surface-sober"
        >
          {editing ? "Fechar" : "Editar"}
        </button>
      </div>

      {editing && (
        <form
          action={(formData) =>
            startSaving(async () => {
              const result = await saveFinancingLeadDetailsAction(lead.id, formData);
              if (!result.ok) setError(result.error);
              else {
                setError(undefined);
                setEditing(false);
              }
            })
          }
          className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs"
        >
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">Valor negociado (financiado)</span>
            <input
              name="negotiatedValue"
              inputMode="decimal"
              defaultValue={lead.negotiatedValue?.toLocaleString("pt-BR") ?? ""}
              placeholder="Ex.: 350.000"
              className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex w-24 flex-col gap-1">
              <span className="font-semibold text-ink">Comissão %</span>
              <input
                name="commissionRate"
                inputMode="decimal"
                defaultValue={lead.commissionRate.toLocaleString("pt-BR")}
                className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold text-ink">Banco</span>
              <input
                name="bank"
                defaultValue={lead.bank ?? ""}
                maxLength={80}
                placeholder="Ex.: Caixa, Itaú…"
                className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">Anotações</span>
            <textarea
              name="adminNotes"
              defaultValue={lead.adminNotes ?? ""}
              maxLength={2000}
              rows={3}
              className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
            />
          </label>
          {lead.notes && (
            <p className="rounded-sober bg-surface-sober px-2 py-1.5 text-ink-muted">
              <span className="font-semibold text-ink">Do assistente:</span> {lead.notes}
            </p>
          )}
          <p className="text-ink-muted">
            {[
              lead.downPaymentLabel && `Entrada ${lead.downPaymentLabel}`,
              lead.monthlyIncomeLabel && `Renda ${lead.monthlyIncomeLabel}`,
              lead.email,
              lead.channel === "whatsapp" ? "Veio pelo WhatsApp" : "Veio pelo chat do site",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {error && <p className="text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-brand bg-brand-blue px-3 py-2 text-sm font-bold text-on-blue disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
      )}
    </article>
  );
}

export function FinancingKanban({ leads: initialLeads, columns }: { leads: FinancingLeadSummary[]; columns: KanbanColumn[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | undefined>();
  const [over, setOver] = useState<FinancingLeadStatus | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Depois de salvar (revalidatePath), o servidor manda a lista atualizada.
  useEffect(() => setLeads(initialLeads), [initialLeads]);

  async function move(id: string, status: FinancingLeadStatus) {
    const previous = leads;
    const current = leads.find((lead) => lead.id === id);
    if (!current || current.status === status) return;
    // Otimista: o card muda de coluna na hora; volta se a API recusar.
    setLeads((list) =>
      list.map((lead) => (lead.id === id ? { ...lead, status, statusChangedAt: new Date().toISOString() } : lead)),
    );
    setError(undefined);
    const result = await moveFinancingLeadAction(id, status);
    if (!result.ok) {
      setLeads(previous);
      setError(result.error);
    }
  }

  return (
    <div>
      {error && <p className="mb-3 rounded-brand bg-status-danger/10 px-4 py-2 text-sm text-status-danger">{error}</p>}
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="flex gap-3" style={{ minWidth: `${columns.length * 260}px` }}>
          {columns.map((column) => {
            const items = leads.filter((lead) => lead.status === column.status);
            const commission = items.reduce((total, lead) => total + (lead.commissionAmount ?? 0), 0);
            const value = items.reduce((total, lead) => total + (lead.negotiatedValue ?? 0), 0);
            return (
              <section
                key={column.status}
                aria-label={column.label}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column.status);
                }}
                onDragLeave={() => setOver((current) => (current === column.status ? undefined : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain") || dragging;
                  setOver(undefined);
                  setDragging(undefined);
                  if (id) void move(id, column.status);
                }}
                className={`flex w-[250px] shrink-0 flex-col rounded-brand bg-surface-sober p-2 transition-colors ${
                  over === column.status ? "ring-2 ring-brand-blue" : ""
                }`}
              >
                <header className="px-1 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} aria-hidden />
                      {column.label}
                    </h3>
                    <span className="rounded-full bg-surface-raised px-2 text-xs font-bold text-ink">{items.length}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted [font-variant-numeric:tabular-nums]">
                    {value > 0 ? `${brl(value)} negociado · ` : ""}
                    {brl(commission)} comissão
                  </p>
                </header>
                <div className="flex min-h-[80px] flex-col gap-2">
                  {items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      columns={columns}
                      onMove={(status) => void move(lead.id, status)}
                      onDragStart={() => setDragging(lead.id)}
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="rounded-brand border border-dashed border-border px-2 py-4 text-center text-xs text-ink-muted">
                      Arraste um card para cá
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
