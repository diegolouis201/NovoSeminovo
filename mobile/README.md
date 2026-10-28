# App NovoSeminovo (Android e iPhone)

App feito com [Capacitor](https://capacitorjs.com): abre o site de produção
(`https://novoseminovo.com.br`) e soma o que é nativo. Mudança no site chega
no app na hora; só precisa de versão nova nas lojas quando mudar algo aqui
dentro de `mobile/` (ícone, permissões, plugins).

## O que o app tem além do site

| Recurso | Onde está |
|---|---|
| Notificação push (mensagem, anúncio aprovado, busca salva…) | site: `apps/web/components/NativeAppBridge.tsx`; API: `apps/api/src/notifications/push.service.ts` |
| Câmera e galeria para as fotos do anúncio | permissões em `android/app/src/main/AndroidManifest.xml` e `ios/App/App/Info.plist` |
| Compartilhar anúncio pelo menu do celular | `apps/web/components/ShareListingButton.tsx` |
| Link do site abre no app | Android: intent-filter no manifest; iPhone: `ios/App/App/App.entitlements`; site: `/.well-known/*` (`apps/web/app/api/app-links`) |
| Tela "Sem conexão" | `www/sem-conexao.html` |
| Ícone e abertura | `assets/` → `npm run assets` |

Pagamento (Stripe) abre dentro do app; WhatsApp, Instagram e mapas abrem no
app certo do celular (`capacitor.config.ts`, `allowNavigation`).

## Rodar e gerar

```
cd mobile
npm ci
npx cap sync          # depois de mudar capacitor.config.ts, plugins ou www/
npm run assets        # depois de trocar as imagens em assets/
```

Os apps são gerados na nuvem pelo GitHub Actions:

- **App Android** (`.github/workflows/app-android.yml`): roda sozinho quando
  `mobile/` muda. Sempre sai um APK de teste (aba Actions → a execução →
  Artifacts). Com a chave de assinatura nos segredos, sai também o `.aab`
  para a Google Play.
- **App iPhone** (`.github/workflows/app-ios.yml`): só roda pelo botão "Run
  workflow" (Mac do GitHub gasta minutos 10x mais rápido). Sem as chaves da
  Apple, só confere se compila; com elas, envia para o TestFlight.

## Chaves e segredos

Nada disso vai no repositório. Segredos do GitHub em Settings → Secrets and
variables → Actions; variáveis do servidor no `.env` da VPS.

| Nome | Onde | O que é |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub | chave que assina o app Android (upload key da Google Play). Guarde uma cópia offline: sem ela não dá para atualizar o app. |
| `GOOGLE_SERVICES_JSON_BASE64` | GitHub | `google-services.json` do app Android no Firebase (push) |
| `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_BASE64` | GitHub | conta da Apple e chave da API do App Store Connect (papel App Manager) |
| `FCM_SERVICE_ACCOUNT` | .env da VPS | conta de serviço do Firebase (JSON em base64): a API manda push para Android |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` | .env da VPS | chave .p8 de push da Apple (em base64): a API manda push para iPhone |
| `ANDROID_CERT_SHA256` | .env da VPS | impressão digital SHA-256 da assinatura da Google Play (links abrindo no app) |
| `APPLE_TEAM_ID` | .env da VPS | Team ID da Apple (links abrindo no app) |

Identificador do app nas duas lojas: `br.com.novoseminovo.app`.
