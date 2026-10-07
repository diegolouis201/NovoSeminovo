"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { RealtimeMessage } from "@novoseminovo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Só cuida de mostrar mensagem nova de quem está do outro lado da conversa,
// sem precisar recarregar a página — a própria mensagem de quem envia já
// aparece na hora pelo formulário normal (revalidatePath depois do POST).
// accessToken vira prop de Client Component de propósito: é o mesmo JWT já
// usado em toda chamada autenticada, só que agora também chega ao navegador
// pra autenticar a conexão com o servidor de WebSocket (que fala direto com
// a API, sem passar pelo Next.js). Numa versão de produção de verdade isso
// devia virar um token de curta duração específico pra isso, não o JWT de
// 30 dias de sempre — fica como próximo passo, não como bug.
export function ConversationLive({
  conversationId,
  currentUserId,
  accessToken,
}: {
  conversationId: string;
  currentUserId: string;
  accessToken: string;
}) {
  const [incoming, setIncoming] = useState<RealtimeMessage[]>([]);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    const socket: Socket = io(API_URL, { auth: { token: accessToken }, transports: ["websocket"] });

    socket.emit("join", { conversationId });
    socket.on("message", (message: RealtimeMessage) => {
      if (message.senderId === currentUserId) return;
      if (seenIds.current.has(message.id)) return;
      seenIds.current.add(message.id);
      setIncoming((prev) => [...prev, message]);
    });

    return () => {
      socket.disconnect();
    };
  }, [conversationId, currentUserId, accessToken]);

  return (
    <>
      {incoming.map((message) => (
        <div key={message.id} className="max-w-[75%] self-start rounded-brand bg-surface-sober px-4 py-2 text-sm text-ink">
          <p>{message.body}</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
      ))}
    </>
  );
}
