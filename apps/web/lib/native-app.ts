// Ponte com o app do celular (mobile/, Capacitor). Dentro do app o próprio
// Capacitor injeta window.Capacitor com os plugins nativos; no navegador
// comum nada disso existe e tudo aqui vira "não faz nada".

type Listener = { remove: () => Promise<void> };

type PushPlugin = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(event: "registration", cb: (token: { value: string }) => void): Promise<Listener>;
  addListener(event: "pushNotificationActionPerformed", cb: (action: { notification: { data?: { link?: string } } }) => void): Promise<Listener>;
};

type AppPlugin = {
  addListener(event: "appUrlOpen", cb: (data: { url: string }) => void): Promise<Listener>;
};

type SharePlugin = { share(options: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<void> };

type CapacitorGlobal = {
  isNativePlatform(): boolean;
  getPlatform(): "android" | "ios" | "web";
  Plugins: { PushNotifications?: PushPlugin; App?: AppPlugin; Share?: SharePlugin };
};

export const PUSH_TOKEN_KEY = "ns-push-token";

export function nativeApp(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform() ? capacitor : undefined;
}

// Compartilhar: no app abre o menu nativo; no celular, o do navegador; no
// computador copia o link. Devolve o que aconteceu para a tela avisar.
export async function shareLink(options: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "cancelled"> {
  const app = nativeApp();
  try {
    if (app?.Plugins.Share) {
      await app.Plugins.Share.share({ ...options, dialogTitle: "Compartilhar anúncio" });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share(options);
      return "shared";
    }
    await navigator.clipboard.writeText(options.url);
    return "copied";
  } catch {
    return "cancelled";
  }
}
