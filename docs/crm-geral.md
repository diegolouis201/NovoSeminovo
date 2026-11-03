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

Não sai no feed: CPF, senha, cartão, dados de compradores.
