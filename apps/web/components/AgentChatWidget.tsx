"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react";
import type { AgentKind } from "@novoseminovo/shared-types";
import { HIDE_TAB_BAR_PREFIXES } from "@/components/AppTabBar";
import { agentStatusAction } from "@/lib/actions/agents";

// Login/cadastro ficam sem chat pra não atrapalhar o formulário.
const HIDDEN_PREFIXES = ["/entrar", "/cadastro"];

// A janela do chat (mensagens, sugestões, cartões de anúncio) vem num arquivo
// de JS à parte, baixado só quando a pessoa encosta no botão ou clica: o
// botão aparece em toda página e a maioria das visitas nunca abre o chat.
const loadPanel = () => import("@/components/AgentChatPanel");
const AgentChatPanel = dynamic(() => loadPanel().then((mod) => mod.AgentChatPanel), {
  ssr: false,
  // Enquanto o arquivo chega (rede lenta): a janela já aparece no lugar certo.
  loading: () => (
    <section
      aria-busy="true"
      aria-label="Assistente"
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(600px,calc(100dvh-1rem))] flex-col items-center justify-center rounded-brand-lg border border-border bg-surface-page text-sm text-ink-muted shadow-pop sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
    >
      Abrindo o assistente…
    </section>
  ),
});

// Um assistente por área do site: no painel do parceiro (/parceiro/...) o
// de gestão da loja; pra quem é admin, o do administrador no resto do site;
// pra todo o resto, o de compra. O `key` recria o chat do zero ao trocar de área, sem misturar as
// conversas.
export function AgentChatWidget({ isLoggedIn, isAdmin, inApp = false }: { isLoggedIn: boolean; isAdmin: boolean; inApp?: boolean }) {
  const pathname = usePathname() ?? "/";
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void agentStatusAction().then(setEnabled);
  }, []);

  if (!enabled || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  if (pathname.startsWith("/parceiro")) {
    // Sem login o painel já manda pra /entrar; sem loja a API recusa e o
    // chat mostra o erro — não vale esconder o botão por isso.
    return isLoggedIn ? <AgentChat key="partner" kind="partner" inApp={inApp} /> : null;
  }
  // Logado como admin, o assistente dele acompanha o site todo (conta,
  // moderação, páginas públicas) — pedido do Diego, que usa o site como
  // admin e quer o painel de gestão à mão em qualquer página. A API confere
  // de novo o papel no banco a cada mensagem.
  if (isAdmin) return <AgentChat key="admin" kind="admin" inApp={inApp} />;
  if (pathname.startsWith("/admin")) return null;
  return <AgentChat key="buyer" kind="buyer" inApp={inApp} />;
}

function AgentChat({ kind, inApp }: { kind: AgentKind; inApp: boolean }) {
  const pathname = usePathname() ?? "/";
  // No passo a passo do anúncio a barra de "Continuar" fica presa no rodapé,
  // e no app o menu fixo também: no celular o botão vira só o ícone, acima
  // da barra, para não cobrir.
  const hasBottomBar = pathname.startsWith("/anunciar") || (inApp && !HIDE_TAB_BAR_PREFIXES.some((prefix) => pathname.startsWith(prefix)));
  const [open, setOpen] = useState(false);
  // Depois de aberta uma vez, a janela continua montada (fechar só esconde):
  // a conversa não some ao fechar e abrir de novo.
  const [mounted, setMounted] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
          // Começa a baixar a janela antes do clique (mouse em cima, dedo
          // encostando, foco pelo teclado): ao clicar ela já está pronta.
          onPointerEnter={() => void loadPanel()}
          onTouchStart={() => void loadPanel()}
          onFocus={() => void loadPanel()}
          aria-label="Assistente"
          className={`fixed right-4 z-40 flex items-center gap-2 rounded-full bg-brand-green text-sm font-bold text-on-green shadow-pop transition-transform hover:-translate-y-0.5 ${
            hasBottomBar ? "bottom-28 p-3 sm:bottom-4 sm:px-5 sm:py-3" : "bottom-4 px-5 py-3"
          }`}
        >
          <ChatCircleDots size={22} weight="fill" />
          <span className={hasBottomBar ? "hidden sm:inline" : undefined}>Assistente</span>
        </button>
      )}
      {mounted && <AgentChatPanel kind={kind} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
