import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { getMyConversation, sendMessageAction } from "@/lib/actions/conversations";

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const conversation = await getMyConversation(params.id);
  if (!conversation) notFound();

  const send = sendMessageAction.bind(null, conversation.id);

  return (
    <main className="mx-auto flex h-[calc(100vh-64px)] max-w-2xl flex-col px-4 py-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{conversation.otherPartyName}</h1>
          <Link href={`/anuncio/${conversation.listingId}`} className="text-sm text-brand-blue hover:underline">
            {conversation.listingTitle}
          </Link>
        </div>
        <Link href="/conta/mensagens" className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← Todas as conversas
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
        {conversation.messages.length === 0 && (
          <p className="text-sm text-ink-muted">
            Envie a primeira mensagem — pergunte sobre o estado, disponibilidade ou combine uma visita.
          </p>
        )}
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[75%] rounded-brand px-4 py-2 text-sm ${
              message.isMine
                ? "self-end bg-brand-green text-on-green"
                : "self-start bg-surface-sober text-ink"
            }`}
          >
            <p>{message.body}</p>
            <p className={`mt-1 text-[11px] ${message.isMine ? "text-on-green/70" : "text-ink-muted"}`}>
              {new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
        ))}
      </div>

      <form action={send} className="flex gap-2 border-t border-border pt-4">
        <input
          name="body"
          required
          placeholder="Escreva uma mensagem..."
          className="flex-1 rounded-brand border border-border bg-surface-page px-4 py-3 text-sm text-ink placeholder:text-ink-muted"
        />
        <Button type="submit">Enviar</Button>
      </form>
    </main>
  );
}
