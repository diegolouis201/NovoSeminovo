# NovoSeminovo

Monorepo do marketplace de veículos e imóveis NovoSeminovo (site + base para o app mobile), estruturado nas 4 etapas de planejamento: mapa de funcionalidades, arquitetura de dados, stack tecnológica e design system.

## Estrutura

```
apps/
  web/              Next.js 14 (App Router, TypeScript, Tailwind) — site
  api/              NestJS — GET /listings, GET /listings/:id, POST /listings/:id/financing-simulations
packages/
  db/               Prisma schema (PostgreSQL) — modelo da Etapa 2
  shared-types/     Contratos (Zod) compartilhados entre web, mobile e api
```

O design system com os tokens de marca (cores, tipografia, espaçamento, componentes) vive à parte, publicado em: https://claude.ai/artifact/CSeA1cBYwztNm288vfMK28 — `apps/web/tailwind.config.ts` e `apps/web/app/globals.css` replicam os mesmos tokens; mude lá primeiro e replique aqui.

## Como rodar

Pré-requisitos: Node 20+, pnpm 9+, um PostgreSQL local (ou remoto) para `packages/db`.

```bash
pnpm install

# banco de dados
cp packages/db/.env.example packages/db/.env   # defina DATABASE_URL
pnpm db:generate
pnpm db:push
pnpm db:seed

# api
cp apps/api/.env.example apps/api/.env         # mesma DATABASE_URL do passo acima
pnpm --filter @novoseminovo/api dev            # sobe em http://localhost:4000

# site (em outro terminal)
cp apps/web/.env.example apps/web/.env.local
# gere um AUTH_SECRET de verdade e cole em apps/web/.env.local:
npx auth secret --raw   # ou: openssl rand -base64 33
pnpm --filter @novoseminovo/web dev            # sobe em http://localhost:3000
```

O site tem seis telas (Etapa 1 → Etapa 4 aplicadas), todas servidas pela API quando ela está no ar:

- `/` — home com busca e destaques
- `/busca?assetType=vehicle|property` — resultados com filtros
- `/anuncio/[id]` — detalhe do anúncio, com simulação de financiamento (Tabela Price) e o bloco no tom "sóbrio"
- `/cadastro`, `/entrar` — criação de conta e login (Auth.js no site, senha validada por `POST /auth/*` na API)
- `/conta` — página protegida (redireciona para `/entrar` sem sessão)

Se a API não estiver rodando (ex.: sem Postgres configurado), `apps/web/lib/api.ts` cai de volta para os dados de exemplo em `apps/web/lib/mock-data.ts` — mesmo formato dos dois lados, via `@novoseminovo/shared-types` — mas login/cadastro precisam da API no ar, já que a senha é sempre validada lá.

## Próximos passos sugeridos

1. Módulos adicionais da API (Etapa 1): chat, favoritos, painel do parceiro, moderação, assinaturas.
2. `apps/mobile` (Expo/React Native) reaproveitando `@novoseminovo/shared-types` e os mesmos endpoints (incluindo `/auth/login`).
3. Upload de fotos (S3/R2) e fluxo de criação de anúncio (hoje só a leitura está implementada).
