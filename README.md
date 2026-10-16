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

Pra publicar o site de verdade (fora do seu computador), ver [`DEPLOY.md`](./DEPLOY.md) — Vercel pro site, Render pra API + banco, domínio apontado de onde já estiver registrado.

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
- `/busca?assetType=vehicle|property` — resultados com filtros de preço, cidade e ano (veículo) ou quartos mínimos (imóvel), todos aplicados de verdade em `GET /listings` (sem JS: formulário `GET` que recarrega a página com os parâmetros na URL); "Salvar esta busca" (logado, com assetType definido) grava os filtros atuais
- `/anuncio/[id]`, `/anuncio/[id]/denunciar`, `/anuncio/[id]/avaliar`, `/anuncio/[id]/fotos` — detalhe do anúncio, com foto real (galeria com capa + miniaturas, upload/exclusão pelo dono em `/fotos`; sem foto ainda, cai no emoji placeholder por categoria), simulação de financiamento interativa (Tabela Price, entrada e parcelas ajustáveis via `POST /listings/:id/financing-simulations`), favoritar, "Conversar no chat", "Chamar no WhatsApp" (só aparece quando o dono cadastrou telefone), "Denunciar anúncio", "Avaliar anunciante" (só aparece pra quem já teve uma conversa sobre aquele anúncio — 1 a 5 estrelas + comentário opcional) e o bloco no tom "sóbrio"
- `/cadastro`, `/entrar` — criação de conta e login (Auth.js no site, senha validada por `POST /auth/*` na API); telefone é opcional no cadastro e alimenta o botão de WhatsApp acima
- `/anunciar` — publicar um anúncio de veículo ou imóvel (protegida); placa é opcional pra quem anuncia veículo e liga o anúncio ao Passaporte Digital do veículo (ver abaixo)
- `/veiculo/[id]` — Passaporte Digital do veículo: perfil persistente do carro (não do anúncio), com timeline de eventos (revisão, reparo, troca de dono, anúncios publicados). Público, pra servir como prova de confiança pra quem for comprar; "Adicionar evento" só aparece pro dono atual. Eventos de troca de dono e anúncio publicado são gerados só pelo backend — nunca pelo próprio usuário (ver `VehiclesService.resolveForListing`/`logListingPublished` em `apps/api/src/vehicles`)
- `/conta` — página protegida (redireciona para `/entrar` sem sessão)
- `/conta/favoritos` — anúncios salvos pela pessoa logada
- `/conta/buscas-salvas` — filtros de busca salvos, com link pra reaplicar, alternar o alerta e excluir; com o alerta ligado, anúncio novo que bate nos filtros vira notificação (e e-mail, se configurado) assim que é aprovado
- `/conta/anuncios` — "Meus anúncios", com pausar/reativar e marcar como vendido (estado terminal — depois de vendido não volta a ativo/pausado)
- `/conta/mensagens`, `/conta/mensagens/[id]` — conversas com compradores/vendedores; mensagem nova de quem está do outro lado aparece na hora, via WebSocket (`ConversationsGateway`), sem precisar recarregar a página
- `/conta/notificacoes` — anúncio aprovado/recusado, nova mensagem, loja verificada e nova avaliação viram notificação aqui, com o sininho no cabeçalho mostrando quantas estão sem ler (calculado no servidor a cada carregamento de página, sem polling nem WebSocket)
- `/parceiro` — painel da loja/imobiliária: onboarding se a pessoa ainda não tem uma, visão geral com estatísticas se já tem
- `/parceiro/anuncios`, `/parceiro/leads` — estoque do parceiro e funil de leads (Kanban: Novo → Negociando → Ganho/Perdido)
- `/parceiro/anuncios/importar` — upload de CSV pra criar vários anúncios de uma vez (modelo pra baixar na própria tela); cada linha passa pela mesma validação e pelo mesmo `pending_review` de um anúncio criado manualmente — uma linha com erro não derruba as outras, o resumo mostra o que entrou e o que falhou (com o motivo)
- `/parceiro/equipe` — convidar/remover gente da equipe (só o dono vê essa aba); convite é direto por e-mail de quem já tem conta — sem link de convite nem e-mail transacional
- `/parceiro/plano` — escolher, trocar ou cancelar o plano (só o dono vê essa aba); "contratar" é uma simulação sem gateway de pagamento nenhum (ver "Próximos passos"), mas o limite de anúncios do plano já vale de verdade: passar do limite em `/anunciar` ou na importação por CSV dá erro pedindo pra pausar/encerrar um anúncio ou trocar de plano
- `/lojas/[slug]` — vitrine pública da loja/imobiliária, com nota média e lista de avaliações, sem precisar estar logado
- `/admin` — moderação: fila de anúncios pendentes, de lojas/imobiliárias aguardando verificação, de denúncias abertas e histórico de moderação (últimas 50 aprovações/recusas, com link pro anúncio) (só para `role: admin`; qualquer outra conta vê "Acesso restrito")

Login devolve, além dos dados do usuário, um JWT (`POST /auth/login`) que o Auth.js guarda na sessão e reenvia como `Authorization: Bearer` nas chamadas autenticadas: favoritos (`GET /me/favorites`, `GET /me/favorites/ids`, `POST`/`DELETE /listings/:id/favorite`), anúncios próprios (`POST /listings`, `GET /listings/mine`, `PATCH /listings/:id/status`, `POST /listings/:id/photos` multipart até 8 arquivos de 5MB, `DELETE /listings/:id/photos/:photoId`), chat (`POST /listings/:id/conversations`, `GET /me/conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`, mais o WebSocket de `ConversationsGateway` — evento `join` com `{conversationId}` pra entrar na sala depois de confirmar que quem conectou participa dela, evento `message` com quem está do outro lado recebendo em tempo real), denúncia de anúncio (`POST /listings/:id/reports`, não deixa denunciar o próprio anúncio), avaliação de vendedor/loja (`POST /listings/:id/reviews`, só libera pra quem já tem uma conversa com aquele anúncio), notificações (`GET /me/notifications`, `GET /me/notifications/unread-count`, `PATCH /me/notifications/:id/read`, `PATCH /me/notifications/read-all`), buscas salvas (`GET /saved-searches/mine`, `POST /saved-searches`, `PATCH`/`DELETE /saved-searches/:id`), o painel do parceiro (`POST /partners`, `GET /partners/mine`, `GET /partners/mine/leads`, `PATCH /leads/:id/status`, `GET /partners/mine/members`, `POST /partners/mine/members`, `DELETE /partners/mine/members/:memberId`, `POST /partners/mine/subscription`, `DELETE /partners/mine/subscription` — todos esses só o dono chama, um agente recebe 404) e moderação (`GET /admin/listings/pending`, `PATCH /admin/listings/:id/moderate`, `GET /admin/partners/pending`, `PATCH /admin/partners/:id/verify`, `GET /admin/reports`, `PATCH /admin/reports/:id`, `GET /admin/moderation-log`, atrás de `JwtAuthGuard` + `AdminGuard`) — com checagem de dono/participante/role onde faz sentido. `GET /partners/:slug` (vitrine) e `GET /plans` (catálogo de planos) são as únicas rotas públicas dessas.

Quem tem uma loja/imobiliária cadastrada anuncia automaticamente em nome dela (`POST /listings` tagueia `partnerId`), e toda conversa (`source: "chat"`) ou clique em "Chamar no WhatsApp" (`source: "whatsapp"`, via `POST /listings/:id/whatsapp-clicks`) num anúncio de parceiro vira um lead no funil — sem exigir login, então `buyerName` aparece como "Contato anônimo" quando quem clicou não estava autenticado. Todo anúncio novo nasce `pending_review` e só aparece na busca depois que um admin aprova em `/admin` — é assim que o painel do parceiro e a moderação ganham dados reais em vez de ficarem vazios.

Seis eventos geram notificação pra quem precisa saber: anúncio aprovado ou recusado (pro dono), nova mensagem numa conversa (pra quem não enviou), loja/imobiliária verificada (pro dono), nova avaliação (pro dono do anúncio ou da loja) e anúncio novo que bate com uma busca salva com alerta ligado (pra quem salvou — `SavedSearchesService.notifyMatches`, chamado quando o admin aprova o anúncio, reaproveita a mesma regra de filtro da busca pública). O título/corpo de cada uma é montado no backend a partir do tipo + payload — o front só recebe texto pronto pra mostrar. Com `RESEND_API_KEY` configurada (ver `.env.example`), cada notificação também sai por e-mail; sem a chave, fica só dentro do site, como sempre foi.

Fotos (`POST /listings/:id/photos`) ficam atrás de uma pequena abstração (`apps/api/src/common/storage.ts`): sem nenhuma variável `S3_*` configurada, salva em disco local (`apps/api/uploads/`, servido como estático — funciona ponta a ponta, mas não sobrevive a um redeploy sem volume persistente); configurando `S3_BUCKET` + `S3_PUBLIC_URL_BASE` (e `S3_ENDPOINT`/`S3_REGION` pra R2 ou outro provedor compatível com S3 que não seja a AWS), passa a gravar lá — mesmo contrato dos dois lados (`Photo.url` como string), sem mudar quem chama `ListingsService.addPhotos`/`removePhoto`. Testado de ponta a ponta nos dois modos (local e contra um servidor HTTP que fala o protocolo do S3), não só que compila.

**Login de teste** (após `pnpm db:seed`, senha `senha1234` para todos):

| E-mail | Papel |
|---|---|
| `admin@novoseminovo.com.br` | Administrador — acessa `/admin` |
| `loja@novoseminovo.com.br` | Dona da "Imobiliária Savassi" (já verificada no seed) |
| `particular@novoseminovo.com.br` | Vendedor particular |
| `comprador@novoseminovo.com.br` | Comprador |

Se a API não estiver rodando (ex.: sem Postgres configurado), `apps/web/lib/api.ts` cai de volta para os dados de exemplo em `apps/web/lib/mock-data.ts` — mesmo formato dos dois lados, via `@novoseminovo/shared-types` — mas login/cadastro/favoritos/anúncios/chat/parceiro/moderação precisam da API no ar, já que dependem do banco.

## Próximos passos sugeridos

1. Cobrança de verdade: `/parceiro/plano` já deixa escolher, trocar e cancelar plano, e o limite de anúncios já é aplicado de verdade (ver `LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA`) — mas "contratar" não cobra nada de ninguém, é só uma simulação que ativa a assinatura na hora. A integração com Stripe (catálogo, checkout, webhook) já está escrita (`PaymentsModule`), mas ainda não foi exercitada de ponta a ponta nesta sessão: o ambiente de desenvolvimento usado bloqueava a saída de rede pra `api.stripe.com`.
2. `apps/mobile` (Expo/React Native) reaproveitando `@novoseminovo/shared-types` e os mesmos endpoints.
3. Regras automáticas de moderação (hoje é 100% manual) — a notificação ao dono quando o anúncio é aprovado/recusado já existe.
4. O WebSocket do chat (ver abaixo) autentica com o mesmo JWT de 30 dias usado em toda chamada HTTP, só que agora ele também chega ao navegador (vira prop de Client Component) — numa versão de produção de verdade isso devia virar um token de curta duração específico pra essa conexão.
5. Push de verdade (service worker + notificação do navegador) pras notificações — hoje o "além do site" é só o e-mail (ver abaixo).
