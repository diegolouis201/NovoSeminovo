# NovoSeminovo

Monorepo do marketplace de veículos e imóveis NovoSeminovo (site + base para o app mobile), estruturado nas 4 etapas de planejamento: mapa de funcionalidades, arquitetura de dados, stack tecnológica e design system.

## Estrutura

```
apps/
  web/              Next.js 14 (App Router, TypeScript, Tailwind) — site
  api/              NestJS — listings, auth (JWT) e favoritos, ver rotas abaixo
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
cp apps/api/.env.example apps/api/.env         # mesma DATABASE_URL do passo acima; gere um JWT_SECRET (openssl rand -base64 33)
pnpm --filter @novoseminovo/api dev            # sobe em http://localhost:4000

# site (em outro terminal)
cp apps/web/.env.example apps/web/.env.local
# gere um AUTH_SECRET de verdade e cole em apps/web/.env.local:
npx auth secret --raw   # ou: openssl rand -base64 33
pnpm --filter @novoseminovo/web dev            # sobe em http://localhost:3000
```

O site tem onze telas (Etapa 1 → Etapa 4 aplicadas), todas servidas pela API quando ela está no ar:

- `/` — home com busca e destaques
- `/busca?assetType=vehicle|property` — resultados com filtros
- `/anuncio/[id]` — detalhe do anúncio, com simulação de financiamento (Tabela Price), favoritar, "Conversar no chat" e o bloco no tom "sóbrio"
- `/cadastro`, `/entrar` — criação de conta e login (Auth.js no site, senha validada por `POST /auth/*` na API)
- `/anunciar` — publicar um anúncio de veículo ou imóvel (protegida)
- `/conta` — página protegida (redireciona para `/entrar` sem sessão)
- `/conta/favoritos` — anúncios salvos pela pessoa logada
- `/conta/anuncios` — "Meus anúncios", com pausar/reativar
- `/conta/mensagens`, `/conta/mensagens/[id]` — conversas com compradores/vendedores

Login devolve, além dos dados do usuário, um JWT (`POST /auth/login`) que o Auth.js guarda na sessão e reenvia como `Authorization: Bearer` nas chamadas autenticadas: favoritos (`GET /me/favorites`, `GET /me/favorites/ids`, `POST`/`DELETE /listings/:id/favorite`), anúncios próprios (`POST /listings`, `GET /listings/mine`, `PATCH /listings/:id/status`) e chat (`POST /listings/:id/conversations`, `GET /me/conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`) — todas atrás de `JwtAuthGuard`, com checagem de dono/participante onde faz sentido.

Se a API não estiver rodando (ex.: sem Postgres configurado), `apps/web/lib/api.ts` cai de volta para os dados de exemplo em `apps/web/lib/mock-data.ts` — mesmo formato dos dois lados, via `@novoseminovo/shared-types` — mas login/cadastro/favoritos/anúncios/chat precisam da API no ar, já que dependem do banco.

## Próximos passos sugeridos

1. Painel do parceiro (lojista/imobiliária): estoque em lote, CRM de leads, planos/assinatura — modelado no schema (`Partner`, `Lead`, `Plan`, `Subscription`), sem API/UI ainda.
2. Moderação: anúncios criados hoje nascem `active` direto (sem `pending_review`), já que não existe painel de admin para aprová-los ainda.
3. `apps/mobile` (Expo/React Native) reaproveitando `@novoseminovo/shared-types` e os mesmos endpoints.
4. Upload de fotos (S3/R2) — hoje um anúncio criado pelo formulário não tem foto real, só o placeholder por categoria.
5. Chat em tempo real (WebSocket/Socket.IO, ver Etapa 3) — hoje enviar mensagem só faz um `revalidatePath`, sem push ao destinatário.
