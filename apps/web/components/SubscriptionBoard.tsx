"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SealCheck, WhatsappLogo } from "@phosphor-icons/react";
import type { SubscriptionBoardCard, SubscriptionBoardColumn } from "@novoseminovo/shared-types";
import { savePartnerAdminNotesAction } from "@/lib/actions/admin";

// Quem move os cards é o Stripe (webhooks) — o quadro só mostra e deixa
// anotar. Ver comentário em SubscriptionBoardCardSchema.
export const SUBSCRIPTION_COLUMNS: { column: SubscriptionBoardColumn; label: string; tone: string; empty: string }[] = [
  { column: "none", label: "Sem plano", tone: "bg-brand-orange", empty: "Toda loja cadastrada já tem plano." },
  { column: "active", label: "Ativo", tone: "bg-brand-green", empty: "Nenhuma assinatura ativa ainda." },
  { column: "past_due", label: "Pagamento atrasado", tone: "bg-status-danger", empty: "Nenhum pagamento atrasado." },
  { column: "canceled", label: "Cancelado", tone: "bg-ink-muted", empty: "Nenhum cancelamento." },
];

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a)",
  workshop: "Oficina",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function date(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function whatsappLink(card: SubscriptionBoardCard): string | undefined {
  const digits = card.ownerPhone?.replace(/\D/g, "");
  if (!digits || digits.length < 10) return undefined;
  const full = digits.startsWith("55") && digits.length > 11 ? digits : `55${digits}`;
  const firstName = card.ownerName.split(" ")[0];
  const text =
    card.column === "past_due"
      ? `Olá, ${firstName}! Aqui é do NovoSeminovo. O pagamento da renovação do plano da ${card.legalName} não passou no cartão — posso te ajudar a atualizar?`
      : card.column === "none"
        ? `Olá, ${firstName}! Aqui é do NovoSeminovo. Vi que a ${card.legalName} já está cadastrada — posso te mostrar os planos e ajudar a subir o estoque?`
        : `Olá, ${firstName}! Aqui é do NovoSeminovo, sobre o plano da ${card.legalName}.`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

function Card({ card }: { card: SubscriptionBoardCard }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(card.adminNotes ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saving, startSaving] = useTransition();
  const whatsapp = whatsappLink(card);
  const days = card.statusChangedAt ? daysSince(card.statusChangedAt) : daysSince(card.partnerCreatedAt);
  const nearLimit = card.listingsLimit !== undefined && card.listingsUsed >= card.listingsLimit * 0.8;
  const late = (card.column === "past_due" && days >= 1) || (card.column === "none" && days >= 3);

  return (
    <article className="rounded-brand border border-border bg-surface-raised p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/lojas/${card.slug}`} className="min-w-0 text-sm font-bold text-ink hover:underline">
          {card.legalName}
          {card.verified && (
            <SealCheck size={14} weight="fill" className="ml-1 inline align-[-2px] text-brand-blue" aria-label="Verificada" />
          )}
        </Link>
        <span
          className={`shrink-0 text-[11px] font-semibold ${late ? "text-status-danger" : "text-ink-muted"}`}
          title={card.column === "none" ? "Dias desde o cadastro" : "Dias nesta etapa"}
        >
          {days === 0 ? "hoje" : `${days}d`}
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        {PARTNER_TYPE_LABEL[card.type] ?? card.type} · {card.ownerName}
      </p>

      <dl className="mt-2 space-y-0.5 text-xs">
        {card.planName && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Plano</dt>
            <dd className="font-semibold text-ink [font-variant-numeric:tabular-nums]">
              {card.planName} · {card.priceLabel}
            </dd>
          </div>
        )}
        {card.column === "none" ? (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Cadastro</dt>
            <dd className="text-ink">{date(card.partnerCreatedAt)}</dd>
          </div>
        ) : (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">{card.column === "canceled" ? "Cancelado em" : "Início"}</dt>
            <dd className="text-ink">{date(card.column === "canceled" ? card.statusChangedAt : card.startedAt)}</dd>
          </div>
        )}
        {(card.column === "active" || card.column === "past_due") && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Renova em</dt>
            <dd className="text-ink">{date(card.currentPeriodEnd)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Anúncios</dt>
          <dd className={`[font-variant-numeric:tabular-nums] ${nearLimit ? "font-bold text-brand-orange" : "text-ink"}`}>
            {card.listingsLimit !== undefined ? `${card.listingsUsed} de ${card.listingsLimit}` : card.listingsUsed}
          </dd>
        </div>
      </dl>

      {(card.simulated || nearLimit) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.simulated && (
            <span className="rounded-full bg-surface-sober px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              Simulação (sem cobrança)
            </span>
          )}
          {nearLimit && (
            <span className="rounded-full bg-brand-orange px-2 py-0.5 text-[11px] font-bold text-on-orange">
              Perto do limite
            </span>
          )}
        </div>
      )}

      {card.adminNotes && !editing && (
        <p className="mt-2 whitespace-pre-line rounded-brand bg-surface-sober px-2 py-1.5 text-xs text-ink">{card.adminNotes}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chamar ${card.ownerName} no WhatsApp`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-brand bg-brand-green text-on-green"
          >
            <WhatsappLogo size={18} weight="fill" />
          </a>
        ) : (
          <a
            href={`mailto:${card.ownerEmail}`}
            className="min-w-0 truncate text-xs font-semibold text-brand-blue hover:underline"
            title="Sem telefone no cadastro"
          >
            {card.ownerEmail}
          </a>
        )}
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          className="ml-auto shrink-0 rounded-brand border border-border px-2 py-1.5 text-xs font-semibold text-ink hover:bg-surface-sober"
        >
          {editing ? "Fechar" : card.adminNotes ? "Editar anotação" : "Anotar"}
        </button>
      </div>

      {editing && (
        <form
          action={() =>
            startSaving(async () => {
              const result = await savePartnerAdminNotesAction(card.partnerId, notes);
              if (!result.ok) setError("Não foi possível salvar agora.");
              else {
                setError(undefined);
                setEditing(false);
              }
            })
          }
          className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs"
        >
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: liguei dia 10, vai subir o estoque semana que vem"
            className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
          />
          {error && <p className="text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="self-end rounded-brand bg-brand-green px-3 py-1.5 text-xs font-bold text-on-green disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
      )}
    </article>
  );
}

export function SubscriptionBoard({ cards }: { cards: SubscriptionBoardCard[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <div className="flex gap-3" style={{ minWidth: `${SUBSCRIPTION_COLUMNS.length * 270}px` }}>
        {SUBSCRIPTION_COLUMNS.map((column) => {
          const items = cards.filter((card) => card.column === column.column);
          const monthly = items.filter((card) => !card.simulated).reduce((total, card) => total + (card.priceMonth ?? 0), 0);
          return (
            <section
              key={column.column}
              aria-label={column.label}
              className="flex min-w-[260px] flex-1 flex-col rounded-brand bg-surface-sober p-2"
            >
              <header className="px-1 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                    <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} aria-hidden />
                    {column.label}
                  </h3>
                  <span className="rounded-full bg-surface-raised px-2 text-xs font-bold text-ink">{items.length}</span>
                </div>
                {(column.column === "active" || column.column === "past_due") && (
                  <p className="mt-1 text-[11px] text-ink-muted [font-variant-numeric:tabular-nums]">{brl(monthly)}/mês</p>
                )}
              </header>
              <div className="flex min-h-[80px] flex-col gap-2">
                {items.map((card) => (
                  <Card key={card.partnerId} card={card} />
                ))}
                {items.length === 0 && (
                  <p className="rounded-brand border border-dashed border-border px-2 py-4 text-center text-xs text-ink-muted">
                    {column.empty}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
