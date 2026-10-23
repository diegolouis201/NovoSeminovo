"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsLeftRight, Image as ImageIcon, PaperPlaneRight, Printer, ShoppingCart, Sparkle } from "@phosphor-icons/react";
import { ARCHITECT_STORES, formatBRL, type ArchitectSessionView, type ArchitectShoppingItem } from "@novoseminovo/shared-types";
import { architectMessageAction } from "@/lib/actions/architect";

// Tela do Arquiteto NovoSeminovo: fotos do anúncio (escolher o cômodo),
// conversa com a IA, imagens "antes x depois" e a lista de compras com
// links de lojas (passam pela API pra contar o clique — ver affiliate.ts).

const SUGGESTIONS = [
  "Quero deixar a sala mais moderna e aconchegante",
  "Como ficaria a cozinha integrada com a sala?",
  "Tenho uns R$ 30 mil. O que vale mais a pena reformar?",
  "Monte a lista de compras da reforma",
];

const CATEGORY_LABEL: Record<ArchitectShoppingItem["category"], string> = {
  material: "Materiais",
  acabamento: "Acabamentos",
  movel: "Móveis",
  decoracao: "Decoração",
  iluminacao: "Iluminação",
  servico: "Mão de obra",
};

const STORES_BY_CATEGORY: Record<ArchitectShoppingItem["category"], string[]> = {
  material: ["leroymerlin", "mercadolivre", "amazon"],
  acabamento: ["leroymerlin", "mercadolivre", "amazon"],
  iluminacao: ["leroymerlin", "mercadolivre", "amazon"],
  movel: ["magalu", "mercadolivre", "amazon"],
  decoracao: ["magalu", "mercadolivre", "amazon"],
  servico: [],
};

function media(apiBase: string, url: string): string {
  return url.startsWith("http") ? url : `${apiBase}${url}`;
}

export function ArchitectStudio({ initial, apiBase }: { initial: ArchitectSessionView; apiBase: string }) {
  const [view, setView] = useState(initial);
  const [text, setText] = useState("");
  const [photoId, setPhotoId] = useState<string | undefined>(initial.photos[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [view.messages.length, busy]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    setText("");
    setView((current) => ({ ...current, messages: [...current.messages, { role: "user", text: trimmed }] }));
    const result = await architectMessageAction(view.id, trimmed, photoId).catch(() => ({ ok: false as const, error: "Não foi possível falar com o servidor." }));
    setBusy(false);
    if (result.ok) setView(result.value);
    else {
      setError(result.error);
      setText(trimmed);
      setView((current) => ({ ...current, messages: current.messages.slice(0, -1) }));
    }
  }

  const list = view.shoppingList;
  const total = list ? list.items.reduce((acc, item) => ({ min: acc.min + item.priceMin, max: acc.max + item.priceMax }), { min: 0, max: 0 }) : undefined;
  const selectedPhoto = view.photos.find((photo) => photo.id === photoId);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Fotos + imagens geradas */}
        <section className="flex flex-col gap-4 print:hidden">
          <div>
            <h2 className="text-sm font-bold text-ink">1. Escolha o cômodo</h2>
            {view.photos.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Este anúncio ainda não tem fotos — dá para conversar, mas sem imagens.</p>
            ) : (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {view.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setPhotoId(photo.id)}
                    aria-pressed={photo.id === photoId}
                    className={`relative shrink-0 overflow-hidden rounded-brand border-2 ${photo.id === photoId ? "border-brand-green" : "border-transparent opacity-80 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={media(apiBase, photo.url)} alt={photo.caption ?? `Foto ${index + 1}`} className="h-20 w-28 object-cover" />
                    {photo.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">{photo.caption}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media(apiBase, selectedPhoto.url)} alt="Foto selecionada" className="mt-3 aspect-[4/3] w-full rounded-brand-lg object-cover" />
            )}
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ImageIcon size={18} /> Antes e depois
              <span className="ml-auto text-xs font-normal text-ink-muted">
                {view.imageGenerationEnabled ? `${view.imagesLeftToday} de ${view.dailyImageLimit} imagens hoje` : "Imagens em breve"}
              </span>
            </h2>
            {view.images.length === 0 ? (
              <p className="mt-2 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink-muted">
                Converse com o Arquiteto e peça para ver como ficaria — as imagens aparecem aqui.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-4">
                {[...view.images].reverse().map((image) => (
                  <li key={image.id} className="rounded-brand-lg border border-border bg-surface-raised p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={media(apiBase, image.sourceUrl)} alt="Antes" className="aspect-[4/3] w-full rounded-brand object-cover" />
                        <figcaption className="mt-1 text-center text-xs font-semibold text-ink-muted">Hoje</figcaption>
                      </figure>
                      <figure>
                        <a href={media(apiBase, image.resultUrl)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={media(apiBase, image.resultUrl)} alt="Depois da reforma (ilustração)" className="aspect-[4/3] w-full rounded-brand object-cover" />
                        </a>
                        <figcaption className="mt-1 text-center text-xs font-semibold text-brand-green">Depois (ilustração)</figcaption>
                      </figure>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-ink">
                      <ArrowsLeftRight size={16} className="mt-0.5 shrink-0 text-ink-muted" /> {image.instructions}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Conversa */}
        <section className="flex min-h-[28rem] flex-col rounded-brand-lg border border-border bg-surface-raised print:hidden lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold text-ink">
            <Sparkle size={18} weight="fill" className="text-brand-purple" /> 2. Converse com o Arquiteto
          </h2>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <p className="rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">
              Olá! Sou o Arquiteto NovoSeminovo. Escolha um cômodo nas fotos e me conte o que você imagina — estilo, orçamento, quem vai morar.
              Eu mostro como poderia ficar e monto a lista de compras.
            </p>
            {view.messages.map((message, index) => (
              <p
                key={index}
                className={`whitespace-pre-wrap rounded-brand px-3 py-2 text-sm ${
                  message.role === "user" ? "ml-8 bg-brand-blue text-on-blue" : "mr-4 bg-surface-sober text-ink"
                }`}
              >
                {message.text}
              </p>
            ))}
            {busy && <p className="mr-4 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink-muted">O Arquiteto está pensando… se ele for gerar uma imagem, pode levar até 1 minuto.</p>}
            <div ref={chatEnd} />
          </div>
          {view.messages.length === 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={busy} className="rounded-full border border-border px-3 py-1.5 text-xs text-ink hover:bg-surface-sober disabled:opacity-60">
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {error && <p role="alert" className="mx-4 mb-2 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
            className="flex items-end gap-2 border-t border-border p-3"
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(text);
                }
              }}
              rows={2}
              maxLength={1500}
              placeholder={selectedPhoto?.caption ? `Ex.: como ficaria ${selectedPhoto.caption.toLowerCase()} com piso de madeira?` : "Conte sua ideia de reforma…"}
              className="min-h-[2.75rem] flex-1 resize-none rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="rounded-full bg-brand-green p-3 text-on-green disabled:opacity-50">
              <PaperPlaneRight size={18} weight="fill" />
            </button>
          </form>
        </section>
      </div>

      {/* Lista de compras */}
      <section className="architect-print rounded-brand-lg border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <ShoppingCart size={22} /> Lista de compras da reforma
          </h2>
          {list && (
            <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sober print:hidden">
              <Printer size={16} /> Imprimir ou salvar PDF
            </button>
          )}
        </div>
        <p className="hidden text-sm print:block">
          {view.listing.title} — {view.listing.location}
        </p>
        {!list ? (
          <p className="mt-2 text-sm text-ink-muted">Quando vocês combinarem a reforma, peça “monte a lista de compras” — ela aparece aqui com quantidades, faixa de preço e onde comprar.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase text-ink-muted">
                  <tr>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Qtd.</th>
                    <th className="py-2 pr-3">Faixa de preço</th>
                    <th className="py-2 print:hidden">Onde comprar</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item, index) => (
                    <tr key={index} className="border-t border-border align-top">
                      <td className="py-2 pr-3">
                        <span className="block font-semibold text-ink">{item.name}</span>
                        <span className="text-xs text-ink-muted">
                          {[CATEGORY_LABEL[item.category], item.room, item.spec].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-ink">
                        {item.quantity.toLocaleString("pt-BR")} {item.unit}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-ink [font-variant-numeric:tabular-nums]">
                        {formatBRL(item.priceMin)} – {formatBRL(item.priceMax)}
                      </td>
                      <td className="py-2 print:hidden">
                        <span className="flex flex-wrap gap-1.5">
                          {STORES_BY_CATEGORY[item.category].map((store) => (
                            <a
                              key={store}
                              href={`${apiBase}/architect/go/${encodeURIComponent(view.id)}/${index}/${store}`}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                              className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-brand-blue hover:bg-surface-sober"
                            >
                              {ARCHITECT_STORES.find((candidate) => candidate.id === store)?.name}
                            </a>
                          ))}
                          {item.category === "servico" && <span className="text-xs text-ink-muted">Peça orçamento a profissionais da região</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {total && (
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold text-ink">
                      <td className="py-2 pr-3">Total estimado</td>
                      <td />
                      <td className="whitespace-nowrap py-2 pr-3 [font-variant-numeric:tabular-nums]">
                        {formatBRL(total.min)} – {formatBRL(total.max)}
                      </td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {list.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{list.notes}</p>}
          </>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          Quantidades e preços são estimativas da IA a partir das fotos e da metragem do anúncio — confira medidas e valores antes de comprar. As imagens
          são ilustrativas e não substituem projeto: mudanças em paredes, hidráulica, elétrica ou fachada exigem profissional habilitado (CREA/CAU) e, em
          apartamento, autorização do condomínio. Os links levam a buscas nas lojas; o NovoSeminovo pode receber comissão por compras feitas por eles,
          sem custo extra para você.
        </p>
      </section>
    </div>
  );
}
