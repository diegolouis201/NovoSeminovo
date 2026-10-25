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

## Fases 2 a 4 (no ar)

O Diego pediu para rodar todas as fases de uma vez, porque o site ainda está em beta.

| Agente | Quando | Ferramentas |
| --- | --- | --- |
| Diretor | 8h todo dia | ler_painel, ler_metas, ler_trafego_site, ler_instagram, criar_tarefa, registrar_resumo_diario (vai por e-mail e para o topo de /admin/operacao) |
| Operações | 9h todo dia | listar_anuncios_com_problema, avisar_dono_anuncio (1 por anúncio a cada 7 dias), suspender_anuncio [amarela] |
| Comercial | 10h todo dia | listar_leads_parados, listar_lojas_em_teste_sem_anuncio, lembrar_parceiro (1 por loja e assunto a cada 7 dias) |
| Marketing | segunda 11h | ler_painel, ler_trafego_site, ler_instagram, registrar_sugestao_marketing (link sempre do site e com utm) |

- **Onde estão:** prompts em `operations/agents.service.ts`; ferramentas em `operations/tools.service.ts`; agenda em `SCHEDULES` (`operations.service.ts`).
- **Rodar na hora:** botão "Rodar agora" na tela.
- **Teto de avisos:** `OPS_MAX_MESSAGES_PER_DAY` (padrão 30 por dia, somando os avisos a donos de anúncio e os lembretes a parceiros).
- **Ação amarela pendente no fim da rodada:** a tarefa fica "Esperando aprovação". Depois da decisão ela é concluída; não roda de novo.
- **Integração (Fase 4):** Windsor.ai, só leitura (`operations/windsor.ts`, `WINDSOR_API_KEY`).
  - Já ligados na conta: GA4 (Novoseminovo) e Instagram (@novoseminovooficial).
  - Meta Ads e Google Ads entram quando forem conectados no Windsor.
  - WhatsApp aguarda a verificação da Meta; a Credihome aguarda as credenciais.
- **Testes:** 20, incluindo um agente completo contra um modelo falso que tenta usar uma ferramenta proibida.

## Agente Financeiro (Fase 4, 25/10/2026)

- Roda às segundas, às 7h. Também pode ser disparado pelo botão "Rodar agora" em `/admin/operacao`.
- Ferramentas (`operations/policy.ts`): `ler_painel`, `ler_metas`, `ler_financeiro`, `criar_tarefa` e `registrar_relatorio_financeiro`. Todas são verdes.
- Não paga, não estorna e não muda preço; essas ações são vermelhas e nenhum agente tem a ferramenta.
- `ler_financeiro` (`OpsToolsService.financeSnapshot`) traz números calculados pelo sistema:
  - receita por linha, comparando os últimos 30 dias com os 30 anteriores;
  - receita recorrente (MRR);
  - assinaturas em atraso e canceladas;
  - períodos grátis que vencem em 7 dias;
  - comissões de afiliados disponíveis e em carência;
  - negócios de financiamento registrados e não pagos;
  - gasto com IA por uso (só as chamadas ao Claude).
  - Também traz alertas prontos: queda de 30% ou mais na receita, atrasos, valores a pagar e gasto com IA acima de metade da receita.
- O relatório vai para `ops_reports` (kind `relatorio_financeiro`). Ele aparece em verde em `/admin/operacao#financeiro` e é enviado por e-mail (notificação `ops_finance_report`).
- O Diretor também pode chamar `ler_financeiro`.

