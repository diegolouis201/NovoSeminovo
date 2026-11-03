import Link from "next/link";
import { SALES_STAGES, SALES_STAGE_LABEL } from "@novoseminovo/shared-types";
import { fetchSalesProspect } from "@/lib/api";
import { addNoteAction, addSocioAction, assignAction, moveProspectAction, nextContactAction, socioBirthdayAction } from "@/lib/actions/sales";
import { Flash, SalesDenied, money, salesSession, whatsappHref } from "@/components/sales/SalesAccess";

export const dynamic = "force-dynamic";

const input = "rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink";
const STATUS_LABEL: Record<string, string> = { active: "Em dia", past_due: "Pagamento atrasado", canceled: "Cancelada" };
const KIND_LABEL: Record<string, string> = { note: "Anotação", stage: "Etapa", contact: "Contato" };

function when(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
// Valor para o campo datetime-local, no horário de Brasília.
function localValue(iso?: string) {
  if (!iso) return "";
  const date = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return date.toISOString().slice(0, 16);
}

export default async function ProspectPage({ params, searchParams }: { params: { id: string }; searchParams: { sucesso?: string; erro?: string; perder?: string } }) {
  const { allowed, token, session } = await salesSession(`/comercial/${params.id}`);
  if (!allowed) return <SalesDenied />;
  const detail = await fetchSalesProspect(params.id, token);
  if (!detail) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-status-danger">Card não encontrado.</p>
      </main>
    );
  }
  const { card, notes, socios, foundedAt } = detail;
  const wa = whatsappHref(card.phone);
  const mine = card.ownerId === session.user.id;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-10">
      <Link href="/comercial" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Quadro comercial
      </Link>
      <Flash sucesso={searchParams.sucesso} erro={searchParams.erro} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{card.segment === "vehicle" ? "Veículos" : "Imóveis"}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{card.name}</h1>
          <p className="mt-1 font-semibold text-brand-blue">{SALES_STAGE_LABEL[card.stage]}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-muted">Cidade</dt>
            <dd className="text-ink">{[card.city, card.state].filter(Boolean).join(" - ") || "—"}</dd>
            {card.cnpj && (
              <>
                <dt className="text-ink-muted">CNPJ</dt>
                <dd className="text-ink">{card.cnpj}</dd>
              </>
            )}
            <dt className="text-ink-muted">Contato</dt>
            <dd className="text-ink">{card.contactName ?? "—"}</dd>
            <dt className="text-ink-muted">Telefone</dt>
            <dd className="text-ink">
              {card.phone ?? "—"}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-brand-green hover:underline">
                  WhatsApp
                </a>
              )}
            </dd>
            <dt className="text-ink-muted">E-mail</dt>
            <dd className="break-all text-ink">{card.email ? <a href={`mailto:${card.email}`} className="hover:underline">{card.email}</a> : "—"}</dd>
            <dt className="text-ink-muted">Dono do card</dt>
            <dd className="text-ink">{card.ownerName ?? "Sem dono"}</dd>
            <dt className="text-ink-muted">Origem</dt>
            <dd className="text-ink">{card.source === "manual" ? "Cadastrado pela equipe" : card.source === "link" ? "Link do vendedor" : "Cadastro direto no site"}</dd>
          </dl>
          {!mine && (
            <form action={assignAction.bind(null, card.id)} className="mt-3">
              <button type="submit" className="rounded-brand border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sober">
                Assumir este card
              </button>
            </form>
          )}
        </div>

        <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <h2 className="font-display text-lg font-semibold text-ink">Plano e assinatura</h2>
          {card.partnerId ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-ink-muted">Anúncios no ar</dt>
              <dd className="text-ink">{card.activeListings ?? 0}</dd>
              <dt className="text-ink-muted">Período grátis</dt>
              <dd className="text-ink">{card.trialDaysLeft !== undefined ? `${card.trialDaysLeft} dia(s) restantes` : "Encerrado"}</dd>
              <dt className="text-ink-muted">Plano</dt>
              <dd className="text-ink">{card.planName ?? "Sem plano"}</dd>
              <dt className="text-ink-muted">Mensalidade</dt>
              <dd className="text-ink">{money(card.monthlyValue)}</dd>
              <dt className="text-ink-muted">Situação</dt>
              <dd className="text-ink">{STATUS_LABEL[card.subscriptionStatus ?? ""] ?? "—"}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-ink-muted">Ainda não se cadastrou no site. Mande o seu link de indicação para ela entrar na sua carteira.</p>
          )}
          {card.partnerSlug && (
            <Link href={`/lojas/${card.partnerSlug}`} className="mt-3 inline-block font-semibold text-brand-blue hover:underline">
              Ver página pública da empresa →
            </Link>
          )}
        </div>
      </section>

      {card.partnerId && (
        <section aria-label="Sócios e datas" className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <h2 className="font-display text-lg font-semibold text-ink">Sócios e datas</h2>
          <p className="mt-1 text-ink-muted">
            {foundedAt ? `Empresa aberta em ${new Date(foundedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}. ` : ""}
            Os sócios vêm da Receita; o aniversário você preenche quando souber (DD/MM).
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {socios.length === 0 && <li className="text-ink-muted">Sócios ainda não carregados da Receita.</li>}
            {socios.map((socio) => (
              <li key={socio.id} className="flex flex-wrap items-center justify-between gap-2 rounded-brand bg-surface-sober px-3 py-2">
                <span>
                  <span className="font-semibold text-ink">{socio.name}</span>
                  {socio.role && <span className="text-ink-muted"> · {socio.role}</span>}
                </span>
                <form action={socioBirthdayAction.bind(null, card.id, socio.id)} className="flex items-center gap-2">
                  <label className="text-xs text-ink-muted" htmlFor={`aniv-${socio.id}`}>
                    Aniversário
                  </label>
                  <input id={`aniv-${socio.id}`} name="birthday" defaultValue={socio.birthday} placeholder="DD/MM" pattern="\d{2}/\d{2}" maxLength={5} className="w-20 rounded-brand border border-border bg-surface-page px-2 py-1 text-sm text-ink" />
                  <button type="submit" className="rounded-brand border border-border px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-page">
                    Salvar
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form aria-label="Adicionar sócio ou contato" action={addSocioAction.bind(null, card.id)} className="mt-3 flex flex-wrap items-end gap-2">
            <input name="name" required minLength={2} maxLength={160} placeholder="Nome" className={input} />
            <input name="role" maxLength={120} placeholder="Cargo (opcional)" className={input} />
            <input name="birthday" placeholder="Aniversário DD/MM" pattern="\d{2}/\d{2}" maxLength={5} className={`${input} w-40`} />
            <button type="submit" className="rounded-brand border border-border px-3 py-2 font-semibold text-ink hover:bg-surface-sober">
              Adicionar
            </button>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <h2 className="font-display text-lg font-semibold text-ink">Etapa</h2>
          {card.partnerId ? (
            <p className="mt-2 text-ink-muted">A empresa já se cadastrou: a etapa anda sozinha pelo site (cadastrou → publicou → assinante).</p>
          ) : (
            <form aria-label="Mudar etapa" action={moveProspectAction.bind(null, card.id)} className="mt-2 flex flex-col gap-2">
              <select name="stage" defaultValue={searchParams.perder ? "perdida" : card.stage} className={input}>
                {SALES_STAGES.filter((s) => s.manual).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <textarea name="lostReason" rows={2} maxLength={500} defaultValue={card.lostReason} placeholder="Motivo (obrigatório se perdida)" className={input} />
              <button type="submit" className="rounded-brand bg-brand-blue px-3 py-2 font-semibold text-on-blue hover:opacity-90">
                Salvar etapa
              </button>
            </form>
          )}
        </div>
        <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <h2 className="font-display text-lg font-semibold text-ink">Próximo contato</h2>
          <form aria-label="Próximo contato" action={nextContactAction.bind(null, card.id)} className="mt-2 flex flex-col gap-2">
            <input type="datetime-local" name="at" defaultValue={localValue(card.nextContactAt)} className={input} />
            <button type="submit" className="rounded-brand border border-border px-3 py-2 font-semibold text-ink hover:bg-surface-sober">
              Salvar data
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Histórico</h2>
        <form key={notes.length} aria-label="Nova anotação" action={addNoteAction.bind(null, card.id)} className="mt-2 flex flex-col gap-2">
          <textarea name="body" required rows={2} maxLength={2000} placeholder="Ex.: falei com o Carlos, pediu retorno na segunda." className={input} />
          <button type="submit" className="self-start rounded-brand bg-brand-green px-3 py-2 font-semibold text-on-green hover:opacity-90">
            Salvar anotação
          </button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {notes.length === 0 && <li className="text-ink-muted">Nada anotado ainda.</li>}
          {notes.map((note) => (
            <li key={note.id} className="rounded-brand bg-surface-sober px-3 py-2">
              <p className="text-xs text-ink-muted">
                {when(note.createdAt)} · {KIND_LABEL[note.kind] ?? note.kind}
                {note.authorName ? ` · ${note.authorName}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-ink">{note.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
