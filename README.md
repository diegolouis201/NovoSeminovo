# NovoSeminovo

Monorepo do marketplace de veículos e imóveis NovoSeminovo (site + base para o app mobile), estruturado nas 4 etapas de planejamento: mapa de funcionalidades, arquitetura de dados, stack tecnológica e design system.

## Estrutura

```
apps/
  web/              Next.js 14 (App Router, TypeScript, Tailwind) — site
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

# site
pnpm --filter @novoseminovo/web dev
```

O site sobe em `http://localhost:3000` com três telas iniciais (Etapa 1 → Etapa 4 aplicadas):

- `/` — home com busca e destaques
- `/busca?assetType=vehicle|property` — resultados com filtros
- `/anuncio/[id]` — detalhe do anúncio, com o bloco de financiamento no tom "sóbrio"

As páginas hoje consomem `apps/web/lib/mock-data.ts` (mesmo formato que a futura API vai devolver, via `@novoseminovo/shared-types`). Trocar por dados reais é só apontar essas funções para `fetch`/`apps/api` quando o backend (Etapa 3 — NestJS) existir.

## Próximos passos sugeridos

1. `apps/api` (NestJS) implementando os módulos descritos na Etapa 1/3 sobre o schema de `packages/db`.
2. `apps/mobile` (Expo/React Native) reaproveitando `@novoseminovo/shared-types`.
3. Autenticação (Auth.js) e upload de fotos (S3/R2) nas telas de anúncio.
