"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerPushDeviceAction, removePushDeviceAction } from "@/lib/actions/notifications";
import { nativeApp, PUSH_TOKEN_KEY } from "@/lib/native-app";

function readToken(): string | undefined {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeToken(token: string | undefined) {
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Sem armazenamento: o token é pedido de novo na próxima abertura.
  }
}

// Só age dentro do app (mobile/). Logado: pede permissão de notificação e
// manda o token do celular para a API. Saiu da conta: tira o celular da
// lista. Toque na notificação ou link do site aberto no app: vai para a tela.
export function NativeAppBridge({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const app = nativeApp();
    if (!app) return;
    const listeners: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const go = (link?: string) => {
      if (!link) return;
      try {
        const url = new URL(link, window.location.origin);
        if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Link inválido: fica onde está.
      }
    };

    if (app.Plugins.App) listeners.push(app.Plugins.App.addListener("appUrlOpen", ({ url }) => go(url)));

    const push = app.Plugins.PushNotifications;
    const platform = app.getPlatform();
    if (push && (platform === "android" || platform === "ios")) {
      listeners.push(push.addListener("pushNotificationActionPerformed", ({ notification }) => go(notification.data?.link)));
      if (isLoggedIn) {
        listeners.push(
          push.addListener("registration", ({ value }) => {
            storeToken(value);
            void registerPushDeviceAction(value, platform);
          }),
        );
        void (async () => {
          let { receive } = await push.checkPermissions();
          if (receive === "prompt" || receive === "prompt-with-rationale") receive = (await push.requestPermissions()).receive;
          if (receive === "granted") await push.register();
        })().catch(() => undefined);
      } else {
        const token = readToken();
        if (token) {
          storeToken(undefined);
          void removePushDeviceAction(token);
        }
      }
    }

    return () => {
      for (const listener of listeners) void listener.then((handle) => handle.remove());
    };
  }, [isLoggedIn, router]);

  return null;
}
