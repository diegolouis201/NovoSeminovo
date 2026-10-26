"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  ChatCircle,
  EnvelopeSimple,
  InstagramLogo,
  Phone,
  Plus,
  Storefront,
  UserPlus,
  UsersThree,
  WhatsappLogo,
  type Icon,
} from "@phosphor-icons/react";
import { formatBRL, type CreateLeadInput, type LeadSource, type LeadStatus, type LeadSummary } from "@novoseminovo/shared-types";
import { createLeadAction, openLeadChatAction, registerSaleFromLeadAction, updateLeadAction } from "@/lib/actions/partners";

// Kanban de leads do parceiro (/parceiro/leads), no mesmo jeito do funil de
// financiamento do admin: arrasta o card (ou escolhe no seletor, no celular),
// anota, registra o valor da proposta e, no "Vendido", já registra a venda
// do anúncio com o custo — que vira o lucro em /parceiro/vendas.

const SOURCE: Record<LeadSource, { icon: Icon; label: string }> = {
  chat: { icon: ChatCircle, label: "Chat do site" },
  whatsapp: { icon: WhatsappLogo, label: "WhatsApp" },
  phone: { icon: Phone, label: "Telefone" },
  walk_in: { icon: Storefront, label: "Foi à loja" },
  referral: { icon: UsersThree, label: "Indicação" },
  social: { icon: InstagramLogo, label: "Redes sociais" },
  other: { icon: UserPlus, label: "Outro" },
};

const MANUAL_SOURCES: CreateLeadInput["source"][] = ["phone", "walk_in", "referral", "social", "other"];

type Column = { status: LeadStatus; label: string; tone: string };

function columnsFor(isVehicle: boolean): Column[] {
  return [
    { status: "new", label: "Novo", tone: "bg-brand-orange" },
    { status: "contacted", label: "Em contato", tone: "bg-brand-blue" },
    { status: "visit_scheduled", label: isVehicle ? "Visita / test-drive" : "Visita agendada", tone: "bg-brand-purple" },
    { status: "negotiating", label: "Proposta", tone: "bg-brand-pink" },
    { status: "won", label: "Vendido", tone: "bg-brand-green" },
    { status: "lost", label: "Perdido", tone: "bg-ink-muted" },
  ];
}

const OPEN = new Set<LeadStatus>(["new", "contacted", "visit_scheduled", "negotiating"]);

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function money(value: string): number | undefined {
  const d = digits(value);
  return d ? Number(d) : undefined;
}

function formatPhone(phone: string): string {
  const local = phone.startsWith("55") && phone.length > 11 ? phone.slice(2) : phone;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function whatsappLink(lead: LeadSummary, storeName: string): string | undefined {
  const phone = lead.buyerPhone ? digits(lead.buyerPhone) : "";
  if (phone.length < 10) return undefined;
  const full = phone.startsWith("55") && phone.length > 11 ? phone : `55${phone}`;
  const about = lead.listingTitle ? ` sobre o ${lead.listingTitle}` : "";
  const text = `Olá, ${lead.buyerName.split(" ")[0]}! Aqui é da ${storeName}${about}.`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

function daysIn(lead: LeadSummary): number {
  return Math.max(0, Math.floor((Date.now() - new Date(lead.statusChangedAt).getTime()) / 86_400_000));
}

const channelClass = "inline-flex items-center gap-1 rounded-brand px-2 py-1 text-xs font-bold";

const fieldClass = "rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink";

function LeadCard({
  lead,
  columns,
  storeName,
  onChange,
  onDragStart,
}: {
  lead: LeadSummary;
  columns: Column[];
  storeName: string;
  onChange: (updated: LeadSummary) => void;
  onDragStart: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [proposal, setProposal] = useState(lead.proposalValue ? lead.proposalValue.toLocaleString("pt-BR") : "");
  const [soldPrice, setSoldPrice] = useState(lead.proposalValue ? lead.proposalValue.toLocaleString("pt-BR") : "");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const source = SOURCE[lead.source];
  const days = daysIn(lead);
  const whatsapp = whatsappLink(lead, storeName);
  const email = lead.buyerEmail.includes("@") ? lead.buyerEmail : undefined;

  // Falou com o cliente por algum canal: card novo vai pra "Em contato"
  // sozinho — o funil (do parceiro e do admin) mostra quem já foi atendido.
  function markContacted() {
    if (lead.status === "new") save({ status: "contacted" });
  }

  function save(input: Parameters<typeof updateLeadAction>[1], after?: () => void) {
    start(async () => {
      const result = await updateLeadAction(lead.id, input);
      if (!result.ok) setError(result.error);
      else {
        setError(undefined);
        onChange(result.value);
        after?.();
      }
    });
  }

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      className="cursor-grab rounded-brand border border-border bg-surface-raised p-3 shadow-card active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink">{lead.buyerName}</p>
        <span
          className={`shrink-0 text-[11px] font-semibold ${OPEN.has(lead.status) && days >= 3 ? "text-status-danger" : "text-ink-muted"}`}
          title="Dias nesta etapa"
        >
          {days === 0 ? "hoje" : `${days}d`}
        </span>
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
        <source.icon size={13} weight="bold" /> {source.label}
        {lead.buyerPhone && <span className="[font-variant-numeric:tabular-nums]"> · {formatPhone(digits(lead.buyerPhone))}</span>}
      </p>
      {lead.listingId && (
        <Link href={`/anuncio/${lead.listingId}`} className="mt-1 block truncate text-xs font-semibold text-brand-blue hover:underline">
          {lead.listingTitle ?? "ver anúncio"}
        </Link>
      )}
      {lead.proposalValue !== undefined && (
        <p className="mt-1 text-xs text-ink">
          Proposta: <strong className="[font-variant-numeric:tabular-nums]">{formatBRL(lead.proposalValue)}</strong>
        </p>
      )}
      {lead.notes && !editing && <p className="mt-1.5 whitespace-pre-line rounded-brand bg-surface-sober px-2 py-1 text-xs text-ink">{lead.notes}</p>}

      {(whatsapp || email || lead.canChat) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={markContacted}
              aria-label={`Chamar ${lead.buyerName} no WhatsApp`}
              className={`${channelClass} bg-brand-green text-on-green`}
            >
              <WhatsappLogo size={15} weight="fill" /> WhatsApp
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(lead.listingTitle ? `Sobre o ${lead.listingTitle}` : storeName)}`}
              onClick={markContacted}
              aria-label={`Mandar e-mail para ${lead.buyerName}`}
              className={`${channelClass} border border-border text-ink hover:bg-surface-sober`}
            >
              <EnvelopeSimple size={15} weight="bold" /> E-mail
            </a>
          )}
          {lead.canChat &&
            (lead.conversationId ? (
              <Link
                href={`/conta/mensagens/${lead.conversationId}`}
                onClick={markContacted}
                className={`${channelClass} border border-brand-blue text-brand-blue hover:bg-surface-sober`}
              >
                <ChatCircle size={15} weight="bold" /> Chat
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  markContacted();
                  start(async () => {
                    const result = await openLeadChatAction(lead.id);
                    if (result && !result.ok) setError(result.error);
                  });
                }}
                className={`${channelClass} border border-brand-blue text-brand-blue hover:bg-surface-sober disabled:opacity-50`}
              >
                <ChatCircle size={15} weight="bold" /> Chat
              </button>
            ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <select
          value={lead.status}
          onChange={(event) => save({ status: event.target.value as LeadStatus })}
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
          onClick={() => setEditing((value) => !value)}
          className="shrink-0 rounded-brand border border-border px-2 py-1.5 text-xs font-semibold text-ink hover:bg-surface-sober"
        >
          {editing ? "Fechar" : "Anotar"}
        </button>
      </div>

      {editing && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">Valor da proposta (R$)</span>
            <input inputMode="numeric" value={proposal} onChange={(event) => setProposal(event.target.value)} placeholder="Ex.: 85.000" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink">Anotações</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Ex.: quer dar o Gol 2015 na troca; volta sábado" className={fieldClass} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => save({ notes, proposalValue: money(proposal) ?? null }, () => setEditing(false))}
            className="self-end rounded-brand bg-brand-green px-3 py-1.5 font-bold text-on-green disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}

      {lead.status === "won" && lead.listingId && lead.listingStatus === "sold" && !saved && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-ink">
          <span className="font-bold text-brand-green">Anúncio marcado como vendido</span>
          {lead.listingSoldPrice ? ` por ${formatBRL(lead.listingSoldPrice)}` : ""}. Ajuste o valor final e o custo em{" "}
          <Link href="/parceiro/vendas" className="font-semibold underline">
            Vendas
          </Link>
          .
        </p>
      )}
      {lead.status === "won" && lead.listingId && lead.listingStatus !== "sold" && !saved && (
        <div className="mt-2 border-t border-border pt-2 text-xs">
          {!selling ? (
            <button type="button" onClick={() => setSelling(true)} className="font-bold text-brand-green hover:underline">
              Registrar a venda do anúncio →
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-ink">Vendido por (R$)</span>
                <input inputMode="numeric" value={soldPrice} onChange={(event) => setSoldPrice(event.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-ink">Quanto custou pra loja (compra + preparação)</span>
                <input inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Opcional — para calcular o lucro" className={fieldClass} />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const price = money(soldPrice);
                    if (!price) {
                      setError("Informe o valor da venda.");
                      return;
                    }
                    const result = await registerSaleFromLeadAction(lead.listingId!, price, money(cost));
                    if (!result.ok) setError(result.error);
                    else {
                      setError(undefined);
                      setSaved("Venda registrada — veja o lucro em Vendas.");
                    }
                  })
                }
                className="self-end rounded-brand bg-brand-green px-3 py-1.5 font-bold text-on-green disabled:opacity-60"
              >
                {pending ? "Registrando…" : "Registrar venda"}
              </button>
            </div>
          )}
        </div>
      )}
      {saved && (
        <p className="mt-2 text-xs font-semibold text-brand-green">
          {saved}{" "}
          <Link href="/parceiro/vendas" className="underline">
            Abrir
          </Link>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}
    </article>
  );
}

function NewLeadForm({
  listings,
  onCreated,
  onClose,
}: {
  listings: { id: string; title: string }[];
  onCreated: (lead: LeadSummary) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateLeadInput>({ contactName: "", contactPhone: "", source: "phone", listingId: "", notes: "" });
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await createLeadAction({ ...form, listingId: form.listingId || undefined });
          if (!result.ok) setError(result.error);
          else onCreated(result.value);
        });
      }}
      className="mt-4 grid gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Nome do cliente</span>
        <input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Telefone/WhatsApp</span>
        <input inputMode="tel" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="(31) 99999-9999" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Como chegou</span>
        <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as CreateLeadInput["source"] })} className={fieldClass}>
          {MANUAL_SOURCES.map((value) => (
            <option key={value} value={value}>
              {SOURCE[value].label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Interesse em</span>
        <select value={form.listingId} onChange={(event) => setForm({ ...form, listingId: event.target.value })} className={fieldClass}>
          <option value="">Nenhum anúncio específico</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-semibold text-ink">Observação</span>
        <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ex.: procura SUV até R$ 90 mil, tem carro na troca" className={fieldClass} />
      </label>
      {error && <p className="text-sm text-status-danger sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onClose} className="rounded-brand border border-border px-4 py-2 text-sm font-bold text-ink">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green disabled:opacity-60">
          {pending ? "Salvando…" : "Adicionar lead"}
        </button>
      </div>
    </form>
  );
}

export function LeadsKanban({
  leads: initialLeads,
  listings,
  storeName,
  isVehicle,
}: {
  leads: LeadSummary[];
  listings: { id: string; title: string }[];
  storeName: string;
  isVehicle: boolean;
}) {
  const columns = columnsFor(isVehicle);
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | undefined>();
  const [over, setOver] = useState<LeadStatus | undefined>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => setLeads(initialLeads), [initialLeads]);

  const replace = (updated: LeadSummary) => setLeads((list) => list.map((lead) => (lead.id === updated.id ? updated : lead)));

  async function move(id: string, status: LeadStatus) {
    const previous = leads;
    const current = leads.find((lead) => lead.id === id);
    if (!current || current.status === status) return;
    // Otimista: muda de coluna na hora; volta se a API recusar.
    setLeads((list) => list.map((lead) => (lead.id === id ? { ...lead, status, statusChangedAt: new Date().toISOString() } : lead)));
    const result = await updateLeadAction(id, { status });
    if (!result.ok) {
      setLeads(previous);
      setError(result.error);
    } else setError(undefined);
  }

  const open = leads.filter((lead) => OPEN.has(lead.status));
  const proposals = open.reduce((total, lead) => total + (lead.proposalValue ?? 0), 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <strong className="text-ink">{open.length}</strong> em aberto
          {proposals > 0 && (
            <>
              {" "}
              · <strong className="text-ink">{formatBRL(proposals)}</strong> em propostas
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="flex items-center gap-1.5 rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
        >
          <Plus size={16} weight="bold" /> Novo lead
        </button>
      </div>

      {adding && (
        <NewLeadForm
          listings={listings}
          onClose={() => setAdding(false)}
          onCreated={(lead) => {
            setLeads((list) => [lead, ...list]);
            setAdding(false);
          }}
        />
      )}

      {error && <p className="mt-3 rounded-brand bg-status-danger/10 px-4 py-2 text-sm text-status-danger">{error}</p>}

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-4">
        <div className="flex gap-3" style={{ minWidth: `${columns.length * 250}px` }}>
          {columns.map((column) => {
            const items = leads.filter((lead) => lead.status === column.status);
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
                className={`flex w-[240px] shrink-0 flex-col rounded-brand bg-surface-sober p-2 ${over === column.status ? "ring-2 ring-brand-blue" : ""}`}
              >
                <header className="flex items-center justify-between gap-2 px-1 pb-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                    <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} aria-hidden />
                    {column.label}
                  </h3>
                  <span className="rounded-full bg-surface-raised px-2 text-xs font-bold text-ink">{items.length}</span>
                </header>
                <div className="flex min-h-[80px] flex-col gap-2">
                  {items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      columns={columns}
                      storeName={storeName}
                      onChange={replace}
                      onDragStart={() => setDragging(lead.id)}
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="rounded-brand border border-dashed border-border px-2 py-4 text-center text-xs text-ink-muted">
                      {column.status === "new" ? "Leads do site chegam aqui" : "Arraste um card para cá"}
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
