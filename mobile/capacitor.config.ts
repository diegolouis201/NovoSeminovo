import type { CapacitorConfig } from "@capacitor/cli";

// O app abre o site de produção: toda mudança no site chega no app na hora,
// sem nova versão nas lojas. O que é nativo (notificação, compartilhar, botão
// voltar) o site chama pela ponte do Capacitor (apps/web/lib/native-app.ts).
const config: CapacitorConfig = {
  appId: "br.com.novoseminovo.app",
  appName: "NovoSeminovo",
  webDir: "www",
  // O site reconhece o app por aqui (ex.: não oferecer "baixe o app" dentro dele).
  appendUserAgent: "NovoSeminovoApp",
  backgroundColor: "#FAF8F3",
  server: {
    url: "https://novoseminovo.com.br",
    // Fica dentro do app: o site, a API e o pagamento do Stripe. Qualquer outro
    // endereço (WhatsApp, Instagram, mapas) abre no app certo do celular.
    allowNavigation: ["novoseminovo.com.br", "*.novoseminovo.com.br", "checkout.stripe.com", "*.stripe.com"],
    // Sem internet ou site fora do ar: página local com botão "Tentar de novo".
    errorPath: "sem-conexao.html",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#FAF8F3",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
