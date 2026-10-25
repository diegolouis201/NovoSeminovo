# Operação com agentes de IA

Diagnóstico e plano aprovados por Diego em 25/10/2026: https://claude.ai/artifact/NJzU3eEPt8kiqs4WWwnHu4

## Decisões aprovadas

- 5 agentes no primeiro núcleo: Diretor, Operações de anúncios, Comercial, Marketing e Risco. O Risco são regras fixas, sem IA.
- Tudo dentro da API atual (`apps/api/src/operations/`), usando o motor de agentes próprio (`agents/agent-engine.ts`). Sem Agent SDK, Redis ou Temporal.
- Teto diário de gasto com IA dos agentes: R$ 15 (`AGENT_DAILY_BUDGET_BRL`).
- Resumo diário do Diretor às 8h, por e-mail e no painel (Fase 2).
- Lista vermelha (só humano): pagamentos, reembolsos e cobranças; preço de plano; apagar dados; permissões; publicar código.

## Fase 1 (núcleo, no ar)

| Peça | Onde |
| --- | --- |
| Custo de cada chamada aos modelos Claude | `operations/ai-usage.ts` (`trackedAnthropic`, `aiContext`) → tabela `agent_runs` |
| Regras de cor e lista de ferramentas por agente | `operations/policy.ts` (`decide`, `AGENT_TOOL_ALLOWLIST`) |
| Ferramentas e aprovações (assinatura da ação exata) | `operations/tools.service.ts` → `agent_approvals` |
| Fila de tarefas (PostgreSQL, `FOR UPDATE SKIP LOCKED`) | `operations/task-queue.service.ts` → `agent_tasks`, `agent_task_events` |
| Worker (30 s), agendador, monitor de rotinas, metas | `operations/operations.service.ts` |
| Saúde das rotinas (moderação, mapa, importação, período grátis, fila) | `operations/routine-health.ts` → `routine_heartbeats` |
| Tela | `/admin/operacao` (web) e `GET/POST /admin/operations/*` (API) |
| Testes | `operations/operations.spec.ts`; rodar com `pnpm --filter @novoseminovo/api test` (com `DATABASE_URL` roda também os testes de banco) |

Cores:
- **Verde:** executa e registra.
- **Amarela:** grava um pedido em `agent_approvals` e para. Só executa depois do "Aprovar" no admin, e só se os parâmetros ainda baterem com a assinatura (`actionHash`).
- **Vermelha:** nunca executa por agente.

Rotina diária: `sistema:kpi` às 6h (BRT) grava `kpi_snapshots` (geral, carros, imóveis).

Variáveis (todas opcionais):
- `AGENT_DAILY_BUDGET_BRL` (padrão 15).
- `AI_USD_BRL`: cotação para converter o custo (padrão 5,5).
- `OPERATIONS_DISABLED=1`: desliga a fila e o monitor; o registro de custo continua.

## Como entra um agente (Fase 2 em diante)

1. Ferramentas novas em `OpsToolsService` com a cor certa; o nome vai na lista do agente em `AGENT_TOOL_ALLOWLIST`.
2. `operations.registerHandler("<agente>", { usesAi: true, run })`. O `run` chama o modelo pelo motor próprio e só age via `tools.request(agente, ferramenta, input, { taskId })`.
3. Texto de terceiros (anúncio, mensagem) entra no prompt via `untrusted()`.
4. Agendamento em `SCHEDULES` (ex.: Diretor às 8h).
5. Teste na `operations.spec.ts` cobrindo o que ele não pode fazer.
