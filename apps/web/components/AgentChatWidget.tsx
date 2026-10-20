"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowClockwise, Car, ChatCircleDots, House, PaperPlaneRight, X } from "@phosphor-icons/react";
import type { AgentChatMessage, AgentKind, ListingSummary } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";
import { agentStatusAction, loadAgentConversationAction, sendAgentMessageAction } from "@/lib/actions/agents";

type AgentConfig = {
  kind: AgentKind;
  title: string;
  subtitle: string;
  greeting: string;
  suggestions: string[];
};

const BUYER_AGENT: AgentConfig = {
  kind: "buyer",
  title: "Assistente NovoSeminovo",
  subtitle: "Busca, financiamento e dúvidas · com IA",
  greeting:
    "Oi! Sou o assistente do NovoSeminovo. Posso te ajudar a encontrar um carro ou imóvel e a entender quanto fica o financiamento. O que você procura?",
  suggestions: [
    "Quero um carro até R$ 80 mil",
    "Procuro apartamento de 2 quartos em BH",
    "Quanto fica a parcela de um carro de R$ 60 mil?",
  ],
};

const PARTNER_AGENT: AgentConfig = {
  kind: "partner",
  title: "Assistente da loja",
  subtitle: "Estoque, leads, vendas e posts · com IA",
  greeting:
    "Oi! Sou seu assistente de gestão. Posso analisar seu estoque e preços, apontar leads que precisam de retorno, resumir suas vendas e escrever descrições e legendas pro Instagram. Por onde começamos?",
  suggestions: [
    "Como está minha loja hoje?",
    "Quais leads preciso responder?",
    "Quais anúncios estão parados?",
    "Escreve uma legenda de Instagram pro meu último anúncio",
  ],
};

const ADMIN_AGENT: AgentConfig = {
  kind: "admin",
  title: "Assistente do admin",
  subtitle: "Resumo, moderação, financiamentos · com IA",
  greeting:
    "Oi! Sou seu assistente de gestão do NovoSeminovo. Posso resumir como está o site, mostrar o que precisa de aprovação, os interessados em financiamento e as recompensas a pagar. O que você quer ver?",
  suggestions: [
    "Como foi a última semana?",
    "O que precisa da minha aprovação?",
    "Quem pediu financiamento e ainda não teve contato?",
    "Quais parceiros mais venderam no mês?",
  ],
};

// Login/cadastro ficam sem chat pra não atrapalhar o formulário.
const HIDDEN_PREFIXES = ["/entrar", "/cadastro"];

function storageKey(kind: AgentKind): string {
  return `ns-agent-${kind}-conversation`;
}

type ChatEntry = AgentChatMessage & { listings?: ListingSummary[] };

// localStorage pode não existir (aba anônima, bloqueado) — o chat continua
// funcionando, só não lembra a conversa ao recarregar a página.
function readStoredId(kind: AgentKind): string | undefined {
  try {
    return window.localStorage.getItem(storageKey(kind)) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeId(kind: AgentKind, id: string | undefined) {
  try {
    if (id) window.localStorage.setItem(storageKey(kind), id);
    else window.localStorage.removeItem(storageKey(kind));
  } catch {
    // sem armazenamento: segue sem lembrar a conversa
  }
}

// Markdown mínimo que o agente usa: [texto](link), **negrito** e quebras de
// linha. Montado como elementos React (nunca HTML cru) — o texto vem de um
// modelo e não pode injetar nada na página. Só links internos (/...) ou
// https viram <a>.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      const href = match[2] ?? "";
      if (href.startsWith("/")) {
        parts.push(
          <Link key={match.index} href={href} className="font-bold text-brand-blue underline">
            {match[1]}
          </Link>,
        );
      } else if (href.startsWith("https://")) {
        parts.push(
          <a key={match.index} href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-blue underline">
            {match[1]}
          </a>,
        );
      } else {
        parts.push(match[1]);
      }
    } else {
      parts.push(<strong key={match.index}>{match[3]}</strong>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {renderInline(line)}
          {index < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

function MiniListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link
      href={`/anuncio/${listing.id}`}
      className="flex items-center gap-3 rounded-brand border border-border bg-surface-raised p-2 text-ink hover:bg-surface-sober"
    >
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sober bg-surface-sober">
        {listing.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveMediaUrl(listing.image)} alt="" className="h-full w-full object-cover" />
        ) : listing.assetType === "property" ? (
          <House size={22} weight="duotone" className="text-ink-muted" />
        ) : (
          <Car size={22} weight="duotone" className="text-ink-muted" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{listing.title}</p>
        <p className="text-sm font-extrabold [font-variant-numeric:tabular-nums]">{listing.priceLabel}</p>
        <p className="truncate text-xs text-ink-muted">{listing.location}</p>
      </div>
    </Link>
  );
}

// Um assistente por área do site: no admin (/admin/...) o do administrador,
// no painel do parceiro (/parceiro/...) o de gestão da loja, no resto o de
// compra. O `key` recria o chat do zero ao trocar de área, sem misturar as
// conversas.
export function AgentChatWidget({ isLoggedIn, isAdmin }: { isLoggedIn: boolean; isAdmin: boolean }) {
  const pathname = usePathname() ?? "/";
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void agentStatusAction().then(setEnabled);
  }, []);

  if (!enabled || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  if (pathname.startsWith("/admin")) {
    // A API confere de novo o papel no banco a cada mensagem — isto aqui só
    // evita mostrar o botão pra quem cai em /admin sem ser admin.
    return isAdmin ? <AgentChat key="admin" config={ADMIN_AGENT} /> : null;
  }
  if (pathname.startsWith("/parceiro")) {
    // Sem login o painel já manda pra /entrar; sem loja a API recusa e o
    // chat mostra o erro — não vale esconder o botão por isso.
    return isLoggedIn ? <AgentChat key="partner" config={PARTNER_AGENT} /> : null;
  }
  return <AgentChat key="buyer" config={BUYER_AGENT} />;
}

function AgentChat({ config }: { config: AgentConfig }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Histórico só é buscado quando a pessoa abre o chat pela primeira vez —
  // não custa nada pra quem nunca clica no botão.
  useEffect(() => {
    if (!open || loadedHistory) return;
    setLoadedHistory(true);
    const storedId = readStoredId(config.kind);
    if (!storedId) return;
    void loadAgentConversationAction(config.kind, storedId).then((view) => {
      if (!view) {
        storeId(config.kind, undefined);
        return;
      }
      setConversationId(view.conversationId);
      setEntries(view.messages);
    });
  }, [open, loadedHistory, config.kind]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft("");
    setError(undefined);
    setEntries((current) => [...current, { role: "user", text: message }]);
    setSending(true);
    const result = await sendAgentMessageAction(config.kind, conversationId, message);
    setSending(false);

    if (!result.ok) {
      setError(result.error);
      // Conversa sumiu/expirou do lado da API: a próxima mensagem começa uma nova.
      if (/não encontrada|longa demais/i.test(result.error)) {
        setConversationId(undefined);
        storeId(config.kind, undefined);
      }
      return;
    }

    setConversationId(result.reply.conversationId);
    storeId(config.kind, result.reply.conversationId);
    setEntries((current) => [
      ...current,
      { role: "assistant", text: result.reply.reply, listings: result.reply.listings },
    ]);
  }

  function restart() {
    setConversationId(undefined);
    storeId(config.kind, undefined);
    setEntries([]);
    setError(undefined);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-brand-green px-5 py-3 text-sm font-bold text-on-green shadow-pop transition-transform hover:-translate-y-0.5"
        >
          <ChatCircleDots size={22} weight="fill" />
          Assistente
        </button>
      )}

      {open && (
        <section
          aria-label={config.title}
          className="fixed inset-x-2 bottom-2 z-40 flex h-[min(600px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-brand-lg border border-border bg-surface-page shadow-pop sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
        >
          <header className="flex items-center justify-between gap-2 bg-brand-green px-4 py-3 text-on-green">
            <div>
              <p className="font-display text-base font-semibold">{config.title}</p>
              <p className="text-xs opacity-90">{config.subtitle}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={restart}
                aria-label="Começar nova conversa"
                title="Nova conversa"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10"
              >
                <ArrowClockwise size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar assistente"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/10"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
            {entries.length === 0 && (
              <div className="flex flex-col gap-2">
                <div className="max-w-[85%] self-start rounded-brand bg-surface-sober px-4 py-2 text-sm text-ink">
                  {config.greeting}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {config.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-left text-xs font-semibold text-ink hover:bg-surface-sober"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry, index) =>
              entry.role === "user" ? (
                <div
                  key={index}
                  className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-brand bg-brand-blue px-4 py-2 text-sm text-on-blue"
                >
                  {entry.text}
                </div>
              ) : (
                <div key={index} className="flex max-w-[90%] flex-col gap-2 self-start">
                  <div className="break-words rounded-brand bg-surface-sober px-4 py-2 text-sm text-ink">
                    <MessageText text={entry.text} />
                  </div>
                  {entry.listings?.map((listing) => <MiniListingCard key={listing.id} listing={listing} />)}
                </div>
              ),
            )}

            {sending && (
              <div className="self-start rounded-brand bg-surface-sober px-4 py-2 text-sm text-ink-muted">
                Pensando…
              </div>
            )}
            {error && (
              <p className="rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
            className="flex items-end gap-2 border-t border-border bg-surface-raised p-2"
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              maxLength={1500}
              placeholder="Escreva sua mensagem…"
              aria-label="Mensagem para o assistente"
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-brand border border-border bg-surface-page px-3 py-2 text-base text-ink outline-none focus:border-brand-blue sm:text-sm"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Enviar"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-brand bg-brand-green text-on-green disabled:opacity-50"
            >
              <PaperPlaneRight size={20} weight="fill" />
            </button>
          </form>
          <p className="bg-surface-raised px-3 pb-2 text-[11px] text-ink-muted">
            Respostas geradas por IA podem conter erros. Simulações são estimativas, sem garantia de aprovação.
          </p>
        </section>
      )}
    </>
  );
}
