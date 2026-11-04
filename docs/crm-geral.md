# CRM geral (repositório "CRM NovoSeminovo" no Claude)

Gestão de toda a empresa: jornada de cada empresa cliente, sócios e datas
comemorativas, avisos inteligentes e ordens para todas as áreas. O CRM roda
numa sessão do Claude no computador do Diego (pacote `pacote-crm.zip`) e fala
com o site por chave secreta (`secrets/crm_feed_key`, criada por
`sh scripts/criar-segredos.sh`).

## Rotas (chave no cabeçalho `Authorization: Bearer <chave>`)

| Rota | Chave | Para que |
|---|---|---|
| `GET /crm/clientes` | crm_feed_key | Jornada de todas as empresas e cards de prospecção (`apps/api/src/crm/crm.service.ts`) |
| `GET /crm/ordens?status=` | crm_feed_key | Ordens e o que cada área fez |
| `POST /crm/ordens` | crm_feed_key | Nova ordem: `{area, titulo, detalhes?, prioridade?, prazo?, empresaId?, cardId?}` |
| `GET /marketing/ordens`, `POST /marketing/ordens/:id/concluir` | marketing_feed_key | Sessão de Marketing pega e conclui as ordens dela |
| `GET /financeiro/ordens`, `POST /financeiro/ordens/:id/concluir` | finance_feed_key | Sessão Financeiro idem |
| `GET /sales/orders`, `POST /sales/orders/:id/done` | login (sales/admin) | Equipe comercial em /comercial |

Ordem de comercial, atendimento, financeiro ou operações também vira tarefa
do agente de IA da área (`AgentTask`, `createdBy: "crm"`); quando o agente
conclui, a ordem fica "feita" com o resumo. Texto da ordem vai como dado
(`input`), o objetivo do agente é só o título.

## Dados novos

- `Partner.foundedAt` e `PartnerSocio` (sócios): Receita via BrasilAPI/CNPJ.ws
  (`fillCompanyFacts`, ao subir a API e a cada 6 h, 20 empresas por vez).
- Aniversário do sócio (DD/MM) e sócios extras: ficha da empresa em /comercial.
- Perfil (Receita): `Partner.mainActivity` (setor/CNAE), `companySize` (porte),
  `shareCapital`. Perfil manual no card: `contactRole` (cargo),
  `employeesRange`, `revenueRange` (faixas em shared-types).
- Interações por tipo (`SalesNote.kind`: ligação, WhatsApp, e-mail, reunião,
  dor, objeção, preferência), próximo contato com tipo (`nextContactKind`),
  etapa `proposta`, motivo de perda/cancelamento por categoria
  (`lostCategory`, `LOSS_CATEGORIES`).
- Comportamento: `User.lastActiveAt` (gravado pelo `JwtAuthGuard` no máximo
  1x/hora), visualizações dos anúncios, ticket médio dos pagamentos, origem de
  marketing do dono (`acqSource/acqMedium/acqCampaign`).
- Pós-venda: `CrmTicket` (chamados por card, abrir/resolver em /comercial,
  tempo médio de resolução no feed) e `NpsResponse` (pesquisa 0–10 no painel
  do parceiro: empresa com 30+ dias, uma vez a cada 90 dias;
  `GET/POST /partners/mine/nps`).

No pacote do CRM: avisos `nps_detrator`, `nps_promotor`, `chamado_parado`,
`risco_cancelamento`; `scripts/higiene.mjs` (duplicados, dados faltando,
cards esquecidos) e filtros novos em `campanha.mjs` (porte, NPS, origem,
funcionários).

Não sai no feed: CPF, senha, cartão, dados de compradores.

## Telas do CRM: no computador, não no site

Decisão do Diego (03/11/2026): as telas do CRM (visão geral, receitas,
empresas com a ficha completa, prospecção, avisos, ordens e agenda) ficam no
repositório do CRM no computador, em `relatorios/painel.html`, gerado por
`scripts/painel.mjs` a cada `sincronizar.mjs`. O site só entrega os dados
(`/crm/clientes`, `/crm/receitas`, `/crm/ordens`) com a chave. As páginas
`/admin/crm` e `/admin/crm/receitas` foram removidas (teste no Cypress garante
404). A área Comercial (/comercial) da equipe continua no site.

## Receitas por categoria (`GET /crm/receitas`)

`buildCrmRevenue` (`apps/api/src/crm/crm-revenue.ts`), para o repositório do
CRM (chave `crm_feed_key`):

- **Faturamento** = só planos (SubscriptionPayment sem estornos +
  ListingBoostPurchase pagos).
- **Lojas parceiras** (StoreEarning, links de afiliado de Amazon/Mercado
  Livre, lançado à mão em /admin/painel): só visualização.
- **Financiamentos**: só visualização, fora do faturamento. Comissão
  (FinancingDeal.commissionAmount) menos cashback (rebateAmount), comissão a
  receber (sem commissionReceivedAt), cashback a pagar (status ≠ paid) e
  pedidos em andamento (FinancingLead fora de converted/lost).
- **Programa de afiliados**: só visualização (é custo). Indicados, cliques, o que os indicados
  pagaram (baseAmount das comissões não canceladas) e comissões por situação.

No pacote do CRM: `scripts/receitas.mjs` (relatório em
`relatorios/receitas-AAAA-MM.md`), `sincronizar.mjs` também baixa
`dados/receitas.json`; regras no CLAUDE.md do pacote.

## Post de boas-vindas nas redes (04/11/2026)

No painel do parceiro (/parceiro), o dono informa Instagram/Facebook da
empresa e marca a autorização de divulgação ("Redes sociais da empresa",
`POST /partners/mine/social`, `PartnerSocialInputSchema` guarda só o nome do
perfil; `Partner.instagram/facebook/socialConsentAt`). O feed `/crm/clientes`
traz `logo`, `redesSociais` e `autorizaDivulgacaoEm`. No CRM, a regra
`boas_vindas_redes` (plano ativo + logo + autorização + rede) gera ordem para o
Marketing com a legenda sugerida; `boas_vindas_pendente` pede ao Comercial o
que falta. O Marketing mostra a prévia ao Diego e só publica depois do OK.

## Atualização automática do CRM (04/11/2026)

O código do repositório do CRM fica em `crm-pacote/` neste projeto (sem
`.env` e sem dados). `GET /crm/pacote` (chave `crm_feed_key`,
`apps/api/src/crm/crm-package.ts`) entrega só programas (`scripts/*.mjs`) e
instruções (CLAUDE.md, README, PRIMEIRA-TAREFA, `docs/*.md|csv`, `.gitignore`,
`.env.exemplo`) com sha256. No computador, `scripts/atualizar.mjs` roda no
começo de cada `sincronizar.mjs` e só escreve caminhos permitidos com resumo
conferido (`atualizar-regras.mjs`); nunca `.env`, `dados/`, `relatorios/`,
`campanhas/` ou `.cmd`. Mudou o CRM = editar `crm-pacote/` e publicar o site;
no dia seguinte o CRM do Diego está atualizado. Testes do CRM rodam no CI.
