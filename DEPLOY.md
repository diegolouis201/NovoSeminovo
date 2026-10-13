# Publicando o NovoSeminovo

Três peças, três lugares:

| Peça | Onde roda | Por quê |
|---|---|---|
| `apps/web` (Next.js) | Vercel | feito pra Next.js, deploy automático a cada push, plano grátis |
| `apps/api` (NestJS) + Postgres | Render | roda Node.js continuamente (coisa que hospedagem compartilhada/WordPress não faz) |
| Domínio (`seudominio.com.br`) | UOL (onde já está registrado) | só o DNS aponta pra fora — a UOL continua sendo a "dona" do domínio e pode seguir hospedando e-mail, se usar |

Nenhum arquivo do site fica na hospedagem UOL — ela só guarda o registro do domínio e aponta o DNS pra onde o site realmente roda.

## 1. Banco de dados + API no Render

1. Crie uma conta em https://render.com (dá pra entrar com o GitHub).
2. **New → Blueprint**, conecte o repositório `diegolouis201/NovoSeminovo` e aponte pro arquivo `render.yaml` que já está na raiz do projeto — ele cria sozinho o serviço da API e o banco Postgres.
   - Se o Blueprint der erro (o schema do Render muda de vez em quando), crie manualmente: **New → PostgreSQL** (plano Free) e depois **New → Web Service** apontando pro mesmo repositório, com:
     - **Build Command**: `corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @novoseminovo/api build`
     - **Start Command**: `node apps/api/dist/main.js`
     - **Environment**: `DATABASE_URL` (copie da tela do banco que você criou), `JWT_SECRET` (gere com `openssl rand -base64 33`), `WEB_ORIGIN` (por enquanto deixe um valor qualquer, você troca no passo 3).
3. Espere o primeiro deploy terminar. Anote a URL que o Render dá pra API (algo como `https://novoseminovo-api.onrender.com`).
4. Abra o **Shell** do serviço (aba "Shell" no painel do Render) e rode, uma vez só:
   ```bash
   pnpm db:push
   pnpm db:seed   # opcional — cria as contas de teste do README (senha "senha1234")
   ```

## 2. Site no Vercel

1. Crie uma conta em https://vercel.com (também dá pra entrar com o GitHub).
2. **Add New → Project**, importe o mesmo repositório.
3. Em **Root Directory**, selecione `apps/web` (o Vercel detecta o pnpm workspace sozinho e instala tudo a partir da raiz do monorepo).
4. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_API_URL` = a URL da API que você anotou no Render (ex.: `https://novoseminovo-api.onrender.com`)
   - `AUTH_SECRET` = gere com `npx auth secret` ou `openssl rand -base64 33`
5. Deploy. O Vercel te dá uma URL tipo `https://novoseminovo.vercel.app`.
6. Volte no Render e atualize a variável `WEB_ORIGIN` da API pra essa URL (ou pro domínio final, se já for configurar o passo 3 agora) — sem isso a API recusa as chamadas do site por causa do CORS.

## 3. Apontar o domínio da UOL

No painel de DNS do seu domínio na UOL:

1. **Domínio principal** (`seudominio.com.br`) → siga as instruções que o próprio Vercel mostra quando você adiciona o domínio em **Project → Settings → Domains** (ele informa o registro A ou CNAME exatos pra colar na UOL — os valores podem mudar, por isso é melhor seguir a tela do Vercel na hora em vez de um valor fixo aqui).
2. **Subdomínio da API** (ex.: `api.seudominio.com.br`) → crie um registro **CNAME** apontando pro endereço que o Render mostra em **Settings → Custom Domains** do serviço da API.
3. Depois de propagado (pode levar algumas horas), atualize:
   - No Vercel: adicione o domínio final em Settings → Domains.
   - No Render: `WEB_ORIGIN` da API para `https://seudominio.com.br`.
   - No Vercel: `NEXT_PUBLIC_API_URL` para `https://api.seudominio.com.br`.

## Cuidado: plano grátis do Render "dorme"

Sem uso por 15 minutos, o serviço da API no plano Free hiberna — o primeiro acesso depois disso demora uns 10–30 segundos pra responder. Isso é mais sério do que parece aqui: `apps/web/lib/api.ts` desiste de falar com a API depois de 1,5s e cai pros dados de exemplo (`mock-data.ts`) — então logo depois de um período parado, a pessoa pode ver conteúdo de demonstração em vez do conteúdo real por alguns segundos. Três jeitos de resolver, dos mais simples aos mais robustos:

1. Deixar como está pro início (MVP/teste) e avisar quem for testar.
2. Configurar um serviço gratuito de ping (ex.: UptimeRobot, a cada 10 minutos) batendo em `GET /listings` da API pra nunca deixar ela dormir.
3. Migrar o serviço da API no Render pro plano pago (a partir de uns US$7/mês) — não dorme nunca.

## Stripe e Resend passam a funcionar de verdade

As integrações de cobrança (Stripe) e e-mail (Resend) já estão prontas no código, mas não puderam ser testadas no ambiente de desenvolvimento usado até aqui porque ele bloqueava a saída de rede pra `api.stripe.com`/`api.resend.com`. Uma vez publicado no Render, esse bloqueio não existe mais — basta configurar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` nas variáveis de ambiente do serviço da API (ver `apps/api/.env.example` pro significado de cada uma) que elas passam a funcionar de verdade, sem precisar mudar nenhum código.
