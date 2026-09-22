import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchMyConversations } from "@/lib/api";

export default async function ConversationsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const conversations = await fetchMyConversations(session.accessToken);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Mensagens</h1>

      {conversations.length === 0 ? (
        <p className="mt-6 text-ink-muted">
          Nenhuma conversa ainda.{" "}
          <Link href="/busca" className="font-semibold text-brand-blue">
            Buscar carros e imóveis
          </Link>
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/conta/mensagens/${conversation.id}`}
                className="flex flex-col gap-1 rounded-brand border border-border bg-surface-raised p-4 hover:border-brand-blue"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{conversation.otherPartyName}</span>
                  {conversation.lastMessageAt && (
                    <span className="text-xs text-ink-muted">
                      {new Date(conversation.lastMessageAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-ink-muted">{conversation.listingTitle}</span>
                {conversation.lastMessagePreview && (
                  <p className="truncate text-sm text-ink-muted">{conversation.lastMessagePreview}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
