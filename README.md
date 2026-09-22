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
pnpm db:seed                                   # cria usuários de teste, senha "senha1234" para todos (ver abaixo)

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
- `/anuncio/[id]` — detalhe do anúncio, com simulação de financiamento interativa (Tabela Price, entrada e parcelas ajustáveis via `POST /listings/:id/financing-simulations`), favoritar, "Conversar no chat", "Chamar no WhatsApp" (só aparece quando o dono cadastrou telefone) e o bloco no tom "sóbrio"
- `/cadastro`, `/entrar` — criação de conta e login (Auth.js no site, senha validada por `POST /auth/*` na API); telefone é opcional no cadastro e alimenta o botão de WhatsApp acima
- `/anunciar` — publicar um anúncio de veículo ou imóvel (protegida)
- `/conta` — página protegida (redireciona para `/entrar` sem sessão)
- `/conta/favoritos` — anúncios salvos pela pessoa logada
- `/conta/anuncios` — "Meus anúncios", com pausar/reativar
- `/conta/mensagens`, `/conta/mensagens/[id]` — conversas com compradores/vendedores
- `/parceiro` — painel da loja/imobiliária: onboarding se a pessoa ainda não tem uma, visão geral com estatísticas se já tem
- `/parceiro/anuncios`, `/parceiro/leads` — estoque do parceiro e funil de leads (Kanban: Novo → Negociando → Ganho/Perdido)
- `/lojas/[slug]` — vitrine pública da loja/imobiliária, sem precisar estar logado
- `/admin` — moderação: fila de anúncios pendentes e de lojas/imobiliárias aguardando verificação (só para `role: admin`; qualquer outra conta vê "Acesso restrito")

Login devolve, além dos dados do usuário, um JWT (`POST /auth/login`) que o Auth.js guarda na sessão e reenvia como `Authorization: Bearer` nas chamadas autenticadas: favoritos (`GET /me/favorites`, `GET /me/favorites/ids`, `POST`/`DELETE /listings/:id/favorite`), anúncios próprios (`POST /listings`, `GET /listings/mine`, `PATCH /listings/:id/status`), chat (`POST /listings/:id/conversations`, `GET /me/conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`), o painel do parceiro (`POST /partners`, `GET /partners/mine`, `GET /partners/mine/leads`, `PATCH /leads/:id/status`) e moderação (`GET /admin/listings/pending`, `PATCH /admin/listings/:id/moderate`, `GET /admin/partners/pending`, `PATCH /admin/partners/:id/verify`, atrás de `JwtAuthGuard` + `AdminGuard`) — com checagem de dono/participante/role onde faz sentido. `GET /partners/:slug` (vitrine) é a única rota pública dessas.

Quem tem uma loja/imobiliária cadastrada anuncia automaticamente em nome dela (`POST /listings` tagueia `partnerId`), e toda conversa (`source: "chat"`) ou clique em "Chamar no WhatsApp" (`source: "whatsapp"`, via `POST /listings/:id/whatsapp-clicks`) num anúncio de parceiro vira um lead no funil — sem exigir login, então `buyerName` aparece como "Contato anônimo" quando quem clicou não estava autenticado. Todo anúncio novo nasce `pending_review` e só aparece na busca depois que um admin aprova em `/admin` — é assim que o painel do parceiro e a moderação ganham dados reais em vez de ficarem vazios.

**Login de teste** (após `pnpm db:seed`, senha `senha1234` para todos):

| E-mail | Papel |
|---|---|
| `admin@novoseminovo.com.br` | Administrador — acessa `/admin` |
| `loja@novoseminovo.com.br` | Dona da "Imobiliária Savassi" (já verificada no seed) |
| `particular@novoseminovo.com.br` | Vendedor particular |
| `comprador@novoseminovo.com.br` | Comprador |

Se a API não estiver rodando (ex.: sem Postgres configurado), `apps/web/lib/api.ts` cai de volta para os dados de exemplo em `apps/web/lib/mock-data.ts` — mesmo formato dos dois lados, via `@novoseminovo/shared-types` — mas login/cadastro/favoritos/anúncios/chat/parceiro/moderação precisam da API no ar, já que dependem do banco.

## Próximos passos sugeridos

1. Plano/assinatura de verdade: `Plan`/`Subscription` já estão no schema, mas `/parceiro` só lê (mostra "Nenhum plano ativo" se não houver); falta o fluxo de contratar um plano e cobrança.
2. Upload em lote de estoque (CSV) e convite de equipe (`PartnerMember` já modelado) para o painel do parceiro.
3. `apps/mobile` (Expo/React Native) reaproveitando `@novoseminovo/shared-types` e os mesmos endpoints.
4. Upload de fotos (S3/R2) — hoje um anúncio criado pelo formulário não tem foto real, só o placeholder por categoria.
5. Chat em tempo real (WebSocket/Socket.IO, ver Etapa 3) — hoje enviar mensagem só faz um `revalidatePath`, sem push ao destinatário.
6. Regras automáticas de moderação (hoje é 100% manual) e notificação ao dono quando o anúncio é aprovado/recusado.
