# Handoff — NovoSeminovo

Documento de continuidade pra uma sessão nova do Claude Code (ex.: trocando de conta) pegar o projeto exatamente de onde parou. Leia isto primeiro; o [`README.md`](./README.md) tem o mapa de telas/rotas detalhado (um pouco desatualizado nas seções mais novas — este arquivo cobre o que ele ainda não documenta) e o [`DEPLOY.md`](./DEPLOY.md) tem o passo a passo de infraestrutura (alguns comandos ali estão desatualizados — a versão corrigida está na seção "Deploy" abaixo).

## O projeto

Marketplace de veículos e imóveis (`novoseminovo.com.br`), operado por Diego como correspondente bancário (corban) — o site também é o canal de geração de leads de financiamento do negócio dele. Non-técnico: Diego não lê código, então toda entrega precisa ser testada de ponta a ponta antes de reportar como pronta, e as instruções de deploy pro VPS dele precisam ser comandos prontos pra colar, não "configure X".

## Onde as coisas vivem

- **Código**: `github.com/diegolouis201/NovoSeminovo`, branch de trabalho `claude/vehicle-marketplace-platform-lmif9s` (ainda não mergeada em `main`/`master` até onde este handoff sabe — confirme com `git log` de ambas antes de assumir).
- **Produção**: um VPS único (Docker Compose: `postgres`, `api`, `web`, `caddy` como proxy HTTPS) — Diego opera via SSH/terminal, colando os comandos que a sessão do Claude dá.
- **Monorepo**: pnpm workspaces + turbo.
  ```
  apps/web/              Next.js 14 (App Router) — site
  apps/api/              NestJS — toda a lógica de servidor
  packages/db/            Prisma schema (PostgreSQL)
  packages/shared-types/  Contratos Zod compartilhados web ↔ api
  ```

## Funcionalidades construídas (além do que o README já documenta)

O README cobre bem o marketplace básico (anúncios, busca, chat, favoritos, Passaporte Digital do veículo, parceiros/moderação). O que foi adicionado depois e ainda não está lá:

1. **Perfil completo + verificação de e-mail** (`/conta/perfil`) — CPF (validado com dígito verificador, `isValidCpf` em shared-types), gênero, nascimento, endereço com autopreenchimento por CEP (ViaCEP, chamado direto do navegador). `apps/api/src/profile/`.

2. **Programa de recompensa por financiamento** (gamificação) — Diego ganha 1% de comissão como corban quando um comprador financia através dele; repassa uma fatia disso pra quem publicou o anúncio: 20% fixo pra pessoa física, 20%→30% progressivo (Bronze/Prata/Ouro, por volume financiado acumulado) pra corretor/imobiliária/lojista. Pagamento é manual (Pix), só rastreado no sistema.
   - `apps/api/src/rebates/` — registrar negócio fechado, marcar como pago, consultar/editar níveis.
   - Páginas: `/admin/recompensas` (registrar negócios, gerenciar níveis — escolhe o anúncio numa lista de vendidos, não digita ID), `/conta/recompensas` ("Meus ganhos"), `/recompensas` (apresentação pública do programa, segmentada PF/PJ × veículo/imóvel).
   - Schema: `FinancingDeal`, `PartnerRebateTier`, enum `FinancingDealStatus`.

3. **Vitrine com destaques por IA** — `/lojas/[slug]` mostra uma seção "Destaques" com 1-3 anúncios escolhidos pela IA (`AiService.curateStorefrontHighlights`) com uma frase explicando a escolha. **Nunca lança erro** mesmo sem `ANTHROPIC_API_KEY` ou se a IA falhar — cai pros 3 primeiros anúncios com uma legenda genérica, porque a vitrine pública não pode quebrar.

4. **Logo da loja/imobiliária** — upload em `/parceiro`, mostrado no painel e na vitrine pública. `Partner.logoUrl`, mesma abstração `PhotoStorage` das fotos de anúncio.

5. **Geração de imagens pro Instagram** — a partir das fotos já cadastradas no anúncio, gera 3 formatos prontos pra baixar e postar: feed (1080×1080), story (1080×1920), carrossel (uma imagem por foto) — preço, título, specs e localização compostos sobre a foto via `sharp` + overlay SVG.
   - `apps/api/src/listings/social-assets.service.ts`, endpoints `GET /listings/:id/social/{feed,story,carousel/:index}` (exigem dono, nunca cache em disco — geradas na hora).
   - Frontend: seção "Compartilhar no Instagram" em `/anuncio/[id]/fotos`. Como os endpoints exigem `Authorization: Bearer`, que um `<img>`/`<a download>` de navegador não manda, `apps/web/app/api/social/*` faz proxy autenticado usando a sessão do NextAuth (`apps/web/lib/social-proxy.ts`).
   - **Dockerfile do `api` instala `fontconfig` + `fonts-dejavu-core`** — sem isso a imagem `node:20-slim` não tem fonte nenhuma e o texto do overlay sai em branco, sem erro avisando.

6. **CRM de estoque e vendas** pro painel do parceiro — fecha o pedido original do Diego de "plataforma onde o lojista/corretor/imobiliária faz tudo sem sair dela":
   - `Listing.soldAt`/`soldPrice` (preenchidos só na transição pra `status: "sold"`, que já era terminal antes disso — `soldPrice` aceita um valor diferente do anunciado, com default pro preço anunciado se não informado).
   - `/parceiro/anuncios` ("Estoque") — busca por título, filtro por status, "Marcar como vendido" com valor de venda opcional.
   - `/parceiro/vendas` (nova aba) — histórico de vendas com total de vendas, faturamento e ticket médio.
   - `/parceiro` ("Visão geral") — redesenhada em 3 painéis estilo CRM (CRM/leads, Estoque, Vendas), cada um com número principal + detalhamento + atalho, inspirado numa referência visual (Cockpit) que o Diego mostrou, mas com o estilo visual próprio do NovoSeminovo.
   - `PartnerStats` ganhou `soldTotal`, `soldThisMonth`, `revenueThisMonthLabel`, `conversionRatePercent` (leads ganhos ÷ total, `undefined` sem lead nenhum), `averageTicketLabel`.
   - `SaleSummary` carrega `soldPriceValue` (número cru) ao lado do `soldPriceLabel` (texto em R$) — lição aprendida de uma refatoração anterior (`RebateTierSchema`): nunca só o texto formatado, sempre o valor numérico também, pra quem for somar/calcular em cima não precisar reparsear string.

7. **Agentes de IA** (pedido do Diego: 4 agentes — comprador, parceiro, admin, desenvolvimento — atendendo no site, no painel e no WhatsApp Business **31 99695-9679**). Construído em etapas:
   - **Motor compartilhado** (`apps/api/src/agents/agent-engine.ts`): laço de tool use (até 6 rodadas, última forçada em texto com `tool_choice: none`), histórico guardado em `AgentConversation.messages` (JSON no formato da API da Anthropic), corte de histórico que nunca começa num `tool_result` órfão. Cada agente é só `{ system, tools }` montado por contexto (`AgentsService.buildAgent`).
   - **Agente Comprador — PRONTO** (`buyer-agent.ts`): ferramentas `buscar_anuncios`, `ver_anuncio`, `simular_financiamento` (Price + `DEFAULT_RATE`, valida faixa de parcelas), `registrar_interesse_financiamento` (cria `FinancingLead`, deduplica por conversa+telefone, notifica todos os admins com `financing_lead_created`). Cards de anúncio na resposta só pra ids que uma ferramenta realmente devolveu **e** que o texto linkou.
   - Site: botão flutuante "Assistente" (`components/AgentChatWidget.tsx`, montado no `layout.tsx`, escondido em `/parceiro`, `/admin`, `/entrar`, `/cadastro`; só aparece com `ANTHROPIC_API_KEY`). Conversa lembrada via `localStorage`; conversa iniciada anônima passa a ser do usuário que logar e continuar.
   - Admin: `/admin/financiamentos` — interessados captados pelo agente, botão "Chamar no WhatsApp" e andamento (novo/em contato/fechado/perdido).
   - Custo/abuso: 20 msgs/10 min por usuário ou IP (o site repassa o IP do visitante em `x-client-ip`), teto diário global `AGENT_DAILY_MESSAGE_LIMIT` (padrão 3000), 60 mensagens por conversa, 1500 caracteres por mensagem.
   - **Agente de desenvolvimento — PRONTO**: `.claude/agents/novoseminovo-dev.md` (convenções + fluxo de teste deste projeto).
   - **Próximas etapas (ainda não feitas)**: Agente do Parceiro (painel `/parceiro`: estoque, leads, vendas, gerar anúncio/posts), Agente Admin (`/admin`: resumo de leads/financiamentos/moderação), canal WhatsApp (WhatsApp Cloud API da Meta — webhook entra em `AgentsService.respond` com `channel: "whatsapp"` e `externalId` = telefone; depende do Diego criar app na Meta e passar Phone Number ID + token permanente).

## Convenções estabelecidas (seguir nas próximas mudanças)

- **Testar de ponta a ponta antes de reportar como pronto**: subir Postgres local + API + site, logar com um usuário do seed, exercitar o fluxo de verdade via curl ou pela própria página renderizada (não só `tsc --noEmit`). Local costuma já ter Postgres instalado (`service postgresql start`; usuário/banco `novoseminovo`/`novoseminovo`, ver `apps/api/.env`).
- **Integração externa opcional nunca quebra a feature**: `isEnabled()` checando a env var (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `S3_BUCKET`) com fallback gracioso.
- Uso do Claude via `AiService` (`apps/api/src/listings/ai.service.ts`): `tool_choice: {type: "auto"}` (nunca forçado, isso dá 400 no Opus 5.5); `claude-sonnet-5-5` pra texto, `claude-opus-5-5` pra visão; todo método que faz a IA escolher entre candidatos dados filtra o resultado contra um `Set` dos IDs válidos — nunca confia que o modelo não inventou um ID.
- **Checagem de dono**: `recurso.ownerUserId !== requesterUserId` → `ForbiddenException`, repetido em cada service (não há helper central — replicar o padrão já usado em `removePhoto`/`classifyPhotos`/`SocialAssetsService` ao criar um endpoint novo mutável por dono).
- **`PhotoStorage`** (`apps/api/src/common/storage.ts`) é a abstração pra qualquer upload de imagem (fotos de anúncio, logo de parceiro) — disco local por padrão, S3/R2 se as env vars `S3_*` estiverem configuradas.
- Sempre: editar schema → `pnpm db:generate` → `pnpm db:push --accept-data-loss` local pra testar → build de `shared-types` (`pnpm --filter @novoseminovo/shared-types build`) sempre que um tipo mudar lá, porque API/web consomem o `dist/` compilado, não o `.ts` direto.
- Commits em português, explicando o "porquê" (não o "o quê" — isso o diff já mostra), terminando com as linhas de atribuição que a sessão do Claude usa.
- Nunca commitar sem rodar `pnpm exec tsc --noEmit` nos dois apps (`apps/api` e `apps/web`) primeiro.

## Deploy — comandos corrigidos

`DEPLOY.md` tem o passo a passo de primeira instalação (ainda válido). Pra atualizar uma instalação já no ar, o fluxo real que funciona (testado várias vezes nesta sessão) é:

```bash
cd ~/NovoSeminovo
git pull origin claude/vehicle-marketplace-platform-lmif9s
docker compose build
docker compose up -d
```

**Só quando o schema do banco mudou** (ver o changelog de cada entrega — nem todo commit muda schema), rodar depois:

```bash
docker compose exec -w /app api pnpm --filter @novoseminovo/db exec prisma db push --accept-data-loss
```

(`DEPLOY.md` diz `docker compose exec api pnpm --filter @novoseminovo/db push`, que **não funciona** — faltam `-w /app` (working directory errado pra achar o schema) e trocar `push` por `exec prisma db push --accept-data-loss` (o script `push` do pacote `db` é interativo/não é isso). Se aparecer um prompt do corepack perguntando `Do you want to continue? [Y/n]`, responder `y`.)

## Login de teste local (após `pnpm db:seed`, senha `senha1234` pra todos)

| E-mail | Papel |
|---|---|
| `admin@novoseminovo.com.br` | Administrador — `/admin` |
| `loja@novoseminovo.com.br` | Dona da "Imobiliária Savassi" (verificada) |
| `particular@novoseminovo.com.br` | Vendedor particular |
| `comprador@novoseminovo.com.br` | Comprador |

**Produção** tem contas reais do Diego — a conta demo `senha1234` citada acima é só do seed local/dev.

## Pendências e dívidas conhecidas (não esquecer)

- **Senha do admin de demonstração (`senha1234`) foi exposta várias vezes nesta conversa.** Insegura pra produção se a conta de admin real usar essa mesma senha — nunca confirmado se foi trocada. Perguntar ao Diego.
- **Integração Credihome (financiamento real via API do Loft)**: bloqueada — sem acesso à documentação/credenciais no ambiente usado até agora. Diego compartilhou um PDF sobre o parceiro; revisitar quando ele tiver as credenciais.
- **Verificação por WhatsApp/SMS**: bloqueada até o Diego configurar uma conta Twilio ou Zenvia.
- **Rotação da chave da Anthropic API**: recomendado, nunca feito.
- **Webhook secret do Stripe**: não configurado em produção — a integração de cobrança real (`PaymentsModule`) está escrita mas nunca testada de ponta a ponta contra `api.stripe.com` de verdade (ambientes de dev usados bloqueavam a saída de rede pra isso; um VPS de verdade não bloqueia, ver `DEPLOY.md`).
- **CRM — próximo passo natural, não pedido ainda**: vincular "lead ganho" (kanban) a "marcar anúncio como vendido" automaticamente, hoje são duas ações manuais separadas.
- **Agentes de IA**: Parceiro, Admin e WhatsApp pendentes (ver item 7 acima).
- Todos os 4 itens da visão original do Diego pro painel do parceiro ("logo → landing page com IA → posts pro Instagram → CRM de estoque e vendas") estão **completos e no ar** — não há item em progresso no momento em que este handoff foi escrito.
