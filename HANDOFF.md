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
   - Admin: `/admin/financiamentos` — **quadro Kanban** (pedido do Diego) com abas imobiliário/veicular (`?tipo=`), etapas do funil do corban em `FinancingLeadStatus` (new → contacted → documents → credit_analysis → approved → property_appraisal [só imóvel] → contract → converted [= Concluído; nome mantido do modelo antigo pra não perder dados] / lost), arrastar e soltar + seletor no card (celular), valor negociado, banco, % de comissão (padrão 1%) e comissão calculada na API (sem valor negociado, estima por bem − entrada, marcada "≈"); totais de comissão prevista/realizada e conversão no topo; dias na etapa (`statusChangedAt`, vermelho a partir de 3).
   - **Repasse e fechamento mensal**: cada card mostra o repasse ao anunciante (`RebatesService.previewRebate` — mesma regra de `registerDeal`: 20% PF, nível Bronze/Prata/Ouro pra loja/corretor) e o líquido do Diego. **Mover pra Concluído registra o `FinancingDeal` automaticamente** (`FinancingLead.financingDealId`; exige valor negociado; sem anúncio não há repasse nem negócio). Sair de Concluído ou mudar valor/comissão/banco antes do pagamento apaga e recria o negócio; depois de pago (em `/admin/recompensas`) só anotação muda. Fechamento: `GET /admin/financing-report?month=AAAA-MM` (mês no horário de Brasília) + rota do site `/api/admin/relatorio-comissoes?mes=&tipo=parceiros|detalhado` que gera CSV pro Excel BR (`;`, vírgula decimal, BOM), com CPF/CNPJ do recebedor como chave Pix.
   - Custo/abuso: 20 msgs/10 min por usuário ou IP (o site repassa o IP do visitante em `x-client-ip`), teto diário global `AGENT_DAILY_MESSAGE_LIMIT` (padrão 3000), 60 mensagens por conversa, 1500 caracteres por mensagem.
   - **Agente do Parceiro — PRONTO** (`partner-agent.ts`): só logado e com loja (dono ou membro, rechecado a cada mensagem; 401 anônimo, 403 sem loja). Ferramentas: `resumo_do_painel`, `listar_estoque` (dias no ar, visualizações, leads, favoritos, fotos), `ver_anuncio` (lê direto do banco pra não inflar visualização), `analisar_preco` (FIPE + mediana via `ListingsService.suggestPrice`), `listar_leads`, `atualizar_lead`, `mudar_status_anuncio` (pausar/reativar/vendido com valor), `listar_vendas`. Ações que mudam dados exigem `confirmado: true` — sem isso a ferramenta devolve erro pedindo confirmação. Estoque = anúncios do próprio usuário (mesmo recorte de `/parceiro/anuncios`); leads/vendas = loja inteira. Não edita preço/descrição/fotos (não existe endpoint de edição) — entrega o texto pronto e aponta `/anuncio/ID/fotos` pras imagens do Instagram.
   - **Agente Admin — PRONTO** (`admin-agent.ts`): papel `admin` e usuário ativo conferidos no banco a cada mensagem (não no JWT). Ferramentas: `resumo_geral` (período em dias), `listar_pendencias` (anúncios/lojas/denúncias), `ver_anuncio` (qualquer status, sem contar visualização), `moderar_anuncio` (recusar exige motivo, vai pro anunciante), `verificar_loja`, `listar_interessados_financiamento`, `atualizar_interessado_financiamento`, `recompensas_a_pagar` (só leitura — pagar continua em `/admin/recompensas`), `ranking_parceiros`. Ações com `confirmado: true`, mesmo mecanismo do parceiro; reaproveita `AdminService`/`RebatesService` (agora exportados), então notificações e log de moderação saem iguais aos da tela.
   - O widget escolhe o agente: `/parceiro/*` → "Assistente da loja" (só logado); admin logado → "Assistente do admin" em todo o resto do site (pedido do Diego); demais → comprador; `key` diferente recria o chat ao trocar de área.
   - **Agente de desenvolvimento — PRONTO**: `.claude/agents/novoseminovo-dev.md` (convenções + fluxo de teste deste projeto).
   - **Canal WhatsApp — CÓDIGO PRONTO, aguardando credenciais da Meta**: `whatsapp.service.ts` + `whatsapp.controller.ts` (`GET/POST /webhooks/whatsapp`). Verificação do webhook por `WHATSAPP_VERIFY_TOKEN`, assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` sobre o corpo cru, responde 200 na hora e processa em fila por telefone (ordem garantida), ignora reenvio do mesmo id, marca como lida, divide resposta > 3800 caracteres, não-texto recebe aviso, conversa longa demais recomeça sozinha. Conversa = `AgentConversation` buyer/whatsapp com `externalId` = telefone; o prompt recebe o telefone pra registrar lead sem pedir de novo. Graph API versão `WHATSAPP_GRAPH_VERSION` (padrão v23.0).
   - (histórico) Etapa original do WhatsApp: (WhatsApp Cloud API da Meta — webhook entra em `AgentsService.respond` com `channel: "whatsapp"` e `externalId` = telefone; depende do Diego criar app na Meta e passar Phone Number ID + token permanente).

8. **Integração com CRMs** — **escondida do menu a pedido do Diego** (`HIDDEN_TABS` em `PartnerNav.tsx`; página e API funcionam pelo link direto `/parceiro/integracoes`, docs `/integracoes/api` com noindex; agente do parceiro não menciona). Pra lançar: tirar de `HIDDEN_TABS`, o `robots` da docs e devolver a linha no prompt do `partner-agent.ts`. (pedido do Diego: lojista/corretor não cadastra anúncio à mão — importa e sincroniza do CRM que já usa). `apps/api/src/integrations/`, painel `/parceiro/integracoes` (só o dono), documentação pública pra integrador em `/integracoes/api`. Três caminhos:
   - **Feed** (`IntegrationFeed`): o parceiro cola o link que o CRM gera. Formatos: `vrsync` (XML padrão ZAP/VivaReal — praticamente todo CRM imobiliário exporta; parser em `feed-parsers.ts`, tolerante: título/descrição/endereço faltando são completados, preço "1.234,56" ou "1234.56", IPTU anual → mensal) `meta_vehicles` (catálogo de veículos padrão Facebook/Meta — XML `<listings><listing>` ou CSV/TSV, nomes de campo do Google Vehicle Ads também aceitos; `vehicle-catalog-parser.ts`: câmbio/combustível inferidos do título só com sinal explícito tipo "Aut.", nunca chutados; `sale_price` menor vence; `availability: sold` fica de fora; estado por extenso vira UF; sem cidade no feed usa a última cidade onde a loja anunciou) e `novoseminovo_json` (`{ listings: [...] }`, mesmos campos da API). Sincroniza sozinho a cada `INTEGRATION_SYNC_INTERVAL_MINUTES` (padrão 60, timer interno de 5 min na própria API) e no botão "Sincronizar agora" (cooldown 2 min; roda em segundo plano, painel mostra "Sincronizando…").
   - **API push** (`/integrations/v1/*`, chave `nsk_...` criada no painel, só o hash fica no banco, mostrada uma vez): `PUT listings/:externalId`, `POST listings/batch` (100), `POST listings/:externalId/sold`, `DELETE listings/:externalId` (pausa), `GET listings`, `GET me`. 300 req/min por chave; corpo JSON até 5 MB (`main.ts`).
   - **CSV** (já existia).
   - Regras da sincronização (`IntegrationsService.applyItems`): chave é `Listing.externalId` (único por parceiro); `externalHash` pula o que não mudou; feed é estoque completo — o que sumiu é pausado com `syncPaused=true` e reativado sozinho se voltar (pausado à mão pelo dono não é reativado); vendido/recusado nunca são tocados; feed vazio ou 100% inválido aborta sem mexer em nada; limite do plano vale; loja **verificada** entra no ar direto, não verificada vai pra moderação. Fotos ficam com o link do CRM (não baixamos) — `readPhotoBytes` (common/storage.ts) busca o link externo quando precisa dos bytes (post do Instagram, IA).
   - **Segurança**: todo download de URL de terceiro passa por `common/safe-fetch.ts` (bloqueia IP privado/loopback/metadados checando no momento da conexão, revalida redirecionamentos, limite de tamanho/tempo); XML com `<!ENTITY` é recusado.
   - Veículos: pesquisa mostrou que OLX Autos não usa feed (só API via integrador homologado, ex. Autos 360/Altimus), então o formato de link mais difundido nos sistemas de loja é o catálogo Meta/Facebook — foi o escolhido. Se aparecer um sistema com formato próprio (ex. XML do Webmotors/iCarros), adicionar um parser novo do mesmo jeito.

9. **Empresas e documentos legais**: o NovoSeminovo é operado pela **DLRLVM SOLUCOES LTDA, CNPJ 60.327.011/0001-02** (razão social vai mudar). O correspondente bancário é **outra empresa**: **Ibs Capital — IBS CAPITAL CORRETORA DE SEGUROS LTDA, CNPJ 61.452.517/0001-06**, que atende os leads de financiamento e recebe a comissão. Dados centralizados em `apps/web/lib/company.ts` (`COMPANY`, `CORBAN`) e duplicados em `CORBAN` de `apps/api/src/agents/buyer-agent.ts`. Rodapé mostra os dois; `/privacidade` (LGPD; âncora `#exclusao-de-dados` pra Meta) e `/termos` existem; Google Analytics 4 `G-S75ZFMVLXE` (`components/Analytics.tsx`, `NEXT_PUBLIC_GA_ID` sobrescreve) só carrega depois do "Aceitar" no aviso de cookies — **pedir revisão de advogado**. Ao mudar dados coletados ou parceiros que recebem dados, atualizar a política e `LEGAL_UPDATED_AT`. Pendente: definir qual CNPJ paga o repasse aos parceiros e o contrato de geração de leads entre as duas empresas.

10. **Estrutura pré-divulgação (Entrega A)**: prévia de compartilhamento por anúncio (`generateMetadata` em `app/anuncio/[id]/page.tsx`: título com preço, descrição, foto de capa; sem foto → `app/opengraph-image.tsx`; não-ativo → noindex) e por loja (`app/lojas/[slug]`); as duas páginas usam `cache()` pra não buscar duas vezes (anúncio contaria 2 visualizações; vitrine chamaria a IA 2 vezes). `metadataBase`/template de título no `layout.tsx` (`SITE_URL` em `lib/company.ts`, `NEXT_PUBLIC_SITE_URL`). `app/sitemap.ts` (dinâmico, lê `GET /listings/sitemap`) e `app/robots.ts` (bloqueia admin/parceiro/conta/api). 404 em português (`app/not-found.tsx`, `app/anuncio/[id]/not-found.tsx`) e `app/error.tsx`. **Dados de exemplo (`mock-data.ts`) só fora de produção** (`mockOr` em `lib/api.ts`): em produção, API fora → erro "instabilidade", nunca anúncio falso.

11. **Páginas institucionais (Entrega B)**: `/como-funciona`, `/para-lojas` (lê planos e níveis de recompensa da API — fonte única de preço; só lista recursos já liberados, a integração com CRM entra quando sair do esconderijo), `/quem-somos`, `/perguntas-frequentes` (JSON-LD `FAQPage`) e `/contato`; blocos em `components/marketing/PageHero.tsx`. Rodapé em colunas. Home mostra até 8 destaques (4 no celular) + "Ver todos". Textos sem números, depoimentos ou horários inventados — conferir com o Diego antes de acrescentar qualquer promessa.

12. **Identidade (definida pelo Diego)**: marca oficial **NovoSeminovo** (junto). Missão: "Tornar a compra, a venda e o financiamento de veículos e imóveis mais transparentes, seguros e conscientes, oferecendo informação de qualidade para que cada pessoa faça a escolha certa para a sua vida." Visão: "Ser referência no Brasil em transparência na compra e venda de veículos e imóveis, tornando o histórico de cada bem tão importante quanto o seu preço." Valores: Transparência, Informação gera confiança, Escolha consciente, Segurança, Simplicidade, Proximidade. Em `/quem-somos` (com a história escrita por ele) e no prompt dos agentes comprador e parceiro.

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
- **Agentes de IA**: só o canal WhatsApp pendente (ver item 7 acima).
- Todos os 4 itens da visão original do Diego pro painel do parceiro ("logo → landing page com IA → posts pro Instagram → CRM de estoque e vendas") estão **completos e no ar** — não há item em progresso no momento em que este handoff foi escrito.
