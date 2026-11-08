"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle, SealCheck, Star, Storefront, House, Car, CalendarBlank, User } from "@phosphor-icons/react";
import type { ListingDetail } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";
import { sendListingContactAction, type ListingContactState } from "@/lib/actions/listing-contact";

type Seller = NonNullable<ListingDetail["seller"]>;

const inputClass =
  "w-full rounded-brand border border-border bg-surface-page px-4 py-3 text-base text-ink placeholder:text-ink-muted focus:border-brand-blue focus:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-brand bg-brand-green px-4 py-3.5 text-base font-bold text-on-green hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Enviar mensagem"}
    </button>
  );
}

function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function SellerHeader({ seller, assetType }: { seller: Seller; assetType: "vehicle" | "property" }) {
  const isPartner = seller.kind === "partner";
  const Fallback = isPartner ? Storefront : User;
  const ListingIcon = assetType === "property" ? House : Car;
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-brand border border-border bg-surface-page">
        {seller.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveMediaUrl(seller.logoUrl)} alt="" className="h-full w-full object-contain" />
        ) : (
          <Fallback size={26} className="text-ink-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex items-center gap-1 font-bold text-ink">
          <span className="truncate">{seller.name}</span>
          {seller.verified && <SealCheck size={18} weight="fill" className="shrink-0 text-brand-blue" aria-label="Verificado" />}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-ink">
          {seller.rating !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-sober px-2 py-1">
              <Star size={14} weight="fill" className="text-brand-orange" />
              {seller.rating.toLocaleString("pt-BR")}/5
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-sober px-2 py-1">
            <ListingIcon size={14} />
            {seller.activeListings} {seller.activeListings === 1 ? "anúncio" : "anúncios"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-sober px-2 py-1">
            <CalendarBlank size={14} />
            {isPartner ? "No NovoSeminovo" : "Particular"} desde {sinceLabel(seller.since)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Cartão de contato do anúncio (carro e imóvel): preço, quem anuncia e o
// formulário "Enviar mensagem", aberto a quem não tem conta.
export function ListingContactCard({
  listingId,
  title,
  priceLabel,
  assetType,
  seller,
  hasInstallments,
  prefill,
  isLoggedIn,
}: {
  listingId: string;
  title: string;
  priceLabel: string;
  assetType: "vehicle" | "property";
  seller?: Seller;
  hasInstallments: boolean;
  prefill: { name?: string; email?: string; phone?: string };
  isLoggedIn: boolean;
}) {
  const [state, action] = useFormState<ListingContactState, FormData>(sendListingContactAction.bind(null, listingId), { status: "idle" });
  const defaultMessage =
    assetType === "property"
      ? `Olá, gostaria de mais informações sobre o imóvel "${title}" que encontrei no NovoSeminovo.`
      : `Olá, tenho interesse no ${title}. Ainda está disponível?`;

  return (
    <section id="contato" aria-label="Contatar anunciante" className="flex flex-col gap-5 rounded-brand-lg border border-border bg-surface-raised p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-3xl font-bold text-ink [font-variant-numeric:tabular-nums]">{priceLabel}</p>
        {hasInstallments && (
          <a href="#financiamento" className="rounded-brand border-2 border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue hover:bg-brand-blue hover:text-white">
            Ver parcelas
          </a>
        )}
      </div>

      {seller && <SellerHeader seller={seller} assetType={assetType} />}

      {state.status === "sent" ? (
        <div className="flex flex-col items-center gap-3 rounded-brand bg-brand-green/10 px-4 py-6 text-center">
          <CheckCircle size={40} weight="fill" className="text-brand-green" />
          <p className="font-display text-lg font-semibold text-ink">Mensagem enviada!</p>
          <p className="text-sm text-ink-muted">
            {seller?.name ?? "O anunciante"} recebeu seu contato e vai responder pelo telefone ou e-mail que você informou.
          </p>
          {state.conversationId ? (
            <Link href={`/conta/mensagens/${state.conversationId}`} className="text-sm font-bold text-brand-blue hover:underline">
              Acompanhar no chat
            </Link>
          ) : (
            !isLoggedIn && (
              <Link href={`/cadastro?voltar=${encodeURIComponent(`/anuncio/${listingId}`)}`} className="text-sm font-bold text-brand-blue hover:underline">
                Crie sua conta para acompanhar pelo chat
              </Link>
            )
          )}
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">Enviar mensagem ao anunciante</h2>
          <input name="name" required autoComplete="name" placeholder="Seu nome" defaultValue={prefill.name} className={inputClass} />
          <input name="email" type="email" required autoComplete="email" placeholder="Seu e-mail" defaultValue={prefill.email} className={inputClass} />
          <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="Seu telefone com DDD" defaultValue={prefill.phone} className={inputClass} />
          <textarea name="message" required rows={4} defaultValue={defaultMessage} className={inputClass} />
          {/* Campo isca: escondido de pessoas, só robô preenche. */}
          <input name="site" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input name="wantsSimilar" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-blue" />
            Quero receber ofertas parecidas por e-mail
          </label>
          {state.status === "error" && (
            <p role="alert" className="rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {state.error}
            </p>
          )}
          <SubmitButton />
          <p className="text-xs leading-relaxed text-ink-muted">
            Ao enviar, você concorda com os{" "}
            <Link href="/termos" className="font-semibold underline">
              Termos de uso
            </Link>
            . Seu nome, e-mail, telefone e mensagem vão para o anunciante, para ele responder ao seu contato. Veja a{" "}
            <Link href="/privacidade" className="font-semibold underline">
              Política de privacidade
            </Link>
            .
          </p>
        </form>
      )}
    </section>
  );
}
