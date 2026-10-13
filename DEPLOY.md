# Publicando o NovoSeminovo

Opção escolhida: **um VPS só**, rodando tudo (site, API, banco) junto via Docker Compose, com HTTPS automático. O domínio continua registrado na UOL — só o DNS aponta pro IP desse servidor.

> **Importante:** os arquivos de Docker (`Dockerfile`, `docker-compose.yml`, `Caddyfile`) foram escritos com cuidado, seguindo os comandos de build que já foram testados à exaustão nesta sessão em dev — mas o build em container em si **ainda não foi testado**, porque este ambiente de desenvolvimento não tem Docker disponível. A primeira subida no servidor é o teste de verdade; se algum passo falhar, me mande o erro (`docker compose logs`) que eu ajusto.

## 1. Contratar o VPS

Especificação mínima: Ubuntu 22.04 (ou mais novo), **2 vCPU, 2GB RAM, 40GB SSD**. Com menos que isso, Postgres + API + site rodando juntos ficam apertados.

- **UOL Cloud Server**: já é a mesma conta/painel que você usa — veja os planos disponíveis no seu painel UOL.
- **DigitalOcean** ou **Hetzner**: alternativas populares, bem documentadas, se a UOL não tiver um plano que caiba no orçamento.

Ao criar, escolha **Ubuntu 22.04 LTS**, anote o **IP público** e garanta acesso **root via SSH** (a maioria dos provedores manda a senha/chave por e-mail ou deixa baixar uma chave `.pem`).

## 2. Apontar o domínio pro servidor

No painel de DNS do domínio na UOL, crie dois registros **A**, ambos apontando pro IP do VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (ou o domínio raiz) | IP do VPS |
| A | `api` | IP do VPS |

Propagação pode levar de alguns minutos a algumas horas. Dá pra seguir com os próximos passos enquanto isso propaga — só o certificado HTTPS (passo 5) depende do DNS já estar resolvendo.

## 3. Preparar o servidor

Conecte via SSH (`ssh root@IP_DO_SERVIDOR`) e instale o Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. Clonar o projeto e configurar

```bash
git clone https://github.com/diegolouis201/NovoSeminovo.git
cd NovoSeminovo
git checkout claude/vehicle-marketplace-platform-lmif9s   # ou a branch/main depois de mergeado

cp .env.docker.example .env
nano .env   # preencha DOMAIN e gere POSTGRES_PASSWORD / JWT_SECRET / AUTH_SECRET
```

Pra gerar cada segredo: `openssl rand -base64 33`.

## 5. Subir tudo

```bash
docker compose up --build -d
```

A primeira vez demora alguns minutos (building das duas imagens). Acompanhe com:

```bash
docker compose logs -f
```

O Caddy só emite o certificado HTTPS com sucesso se o DNS do passo 2 já estiver resolvendo pro IP do servidor — se der erro de certificado, confirme a propagação (`ping seudominio.com.br` deve devolver o IP do VPS) e rode `docker compose restart caddy`.

## 6. Primeira configuração do banco

Com os containers no ar:

```bash
docker compose exec api pnpm --filter @novoseminovo/db push
docker compose exec api pnpm --filter @novoseminovo/db seed   # opcional — cria as contas de teste do README (senha "senha1234")
```

## 7. Verificar

Acesse `https://seudominio.com.br` — deve carregar o site; `https://api.seudominio.com.br/listings` deve devolver uma lista (vazia ou com os anúncios do seed) em JSON.

## Manutenção

- **Atualizar depois de um novo commit**: `git pull && docker compose up --build -d`.
- **Ver logs de um serviço**: `docker compose logs -f api` (ou `web`, `postgres`, `caddy`).
- **Backup do banco**: `docker compose exec postgres pg_dump -U novoseminovo novoseminovo > backup.sql`.

## Stripe, Resend e S3 passam a funcionar de verdade aqui

As integrações de cobrança (Stripe), e-mail (Resend) e fotos em nuvem (S3/R2) já estão prontas no código, mas não puderam ser testadas no ambiente de desenvolvimento usado até aqui porque ele bloqueava a saída de rede pra essas APIs. Um VPS de verdade não tem esse bloqueio — basta preencher as variáveis correspondentes no `.env` (ver `.env.docker.example` e `apps/api/.env.example` pro que cada uma faz) e rodar `docker compose up -d` de novo.

---

## Alternativa: Vercel (site) + Render (API/banco)

Se preferir não administrar um servidor (sem SSH, sem Docker, sem renovar certificado), essa combinação é 100% gerenciada e tem plano grátis pra começar — fica como opção B caso o VPS não seja mais o caminho escolhido.

### 1. Banco de dados + API no Render

1. Crie uma conta em https://render.com (dá pra entrar com o GitHub).
2. **New → Blueprint**, conecte o repositório e aponte pro `render.yaml` da raiz — ele cria sozinho o serviço da API e o banco Postgres.
   - Se o Blueprint der erro, crie manualmente: **New → PostgreSQL** (plano Free) e **New → Web Service** com Build Command `corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @novoseminovo/api build`, Start Command `node apps/api/dist/main.js`, e as variáveis `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`.
3. No **Shell** do serviço, rode uma vez: `pnpm db:push` (e `pnpm db:seed`, opcional).

### 2. Site no Vercel

1. Conta em https://vercel.com, **Add New → Project**, importe o repositório.
2. **Root Directory**: `apps/web`.
3. Env vars: `NEXT_PUBLIC_API_URL` (URL da API no Render) e `AUTH_SECRET`.
4. Deploy, depois volte no Render e atualize `WEB_ORIGIN` pra URL que o Vercel deu.

### 3. Domínio

No DNS da UOL: domínio raiz segue as instruções que o Vercel mostra em **Settings → Domains**; `api.seudominio.com.br` vira um CNAME pro endereço que o Render mostra em **Custom Domains**.

### Cuidado: plano grátis do Render "dorme"

Sem uso por 15 minutos, o serviço da API hiberna — o primeiro acesso depois demora uns 10–30s. Como `apps/web/lib/api.ts` desiste de falar com a API em 1,5s e cai pros dados de exemplo, a pessoa pode ver conteúdo de demonstração por alguns segundos logo depois de um período parado. Resolve com um ping periódico (ex.: UptimeRobot a cada 10min) ou migrando pro plano pago do Render (a partir de uns US$7/mês).
