import Link from "next/link";
import { redirect } from "next/navigation";
import {
  OPS_AGENT_LABELS,
  OPS_FEATURE_LABELS,
  OPS_GOAL_METRICS,
  OPS_ROUTINE_LABELS,
  OPS_RUNNABLE_AGENTS,
  OPS_TASK_STATUS_LABELS,
  formatBRL,
  type OpsApprovalView,
  type OpsSummary,
} from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { opsDecisionAction, opsDeleteGoalAction, opsRunAgentAction, opsSaveGoalAction, opsTaskActionForm } from "@/lib/actions/operations";
import { fetchOpsSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

const SEGMENT_LABELS: Record<string, string> = { all: "Geral", vehicle: "Carros", property: "Imóveis" };
const APPROVAL_STATUS_LABELS: Record<string, string> = {
  executed: "Aprovado e executado",
  failed: "Aprovado, execução falhou",
  rejected: "Recusado",
  expired: "Venceu sem decisão",
  approved: "Aprovado",
};

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function brl(value: number): string {
  return value < 1 && value > 0 ? `R$ ${value.toFixed(4).replace(".", ",")}` : formatBRL(value);
}

function interval(ms: number): string {
  if (ms < 60000) return `a cada ${Math.round(ms / 1000)} s`;
  const minutes = Math.round(ms / 60000);
  return minutes >= 60 ? `a cada ${Math.round(minutes / 60)} h` : `a cada ${minutes} min`;
}

export default async function OperationsPage({ searchParams }: { searchParams: { sucesso?: string; erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");
  const data = await fetchOpsSummary(session.accessToken);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Operação com IA</h1>
        <p className="max-w-3xl text-sm text-ink-muted">
          Aprovações pedidas pelos agentes, tarefas na fila, saúde das rotinas automáticas, gasto com IA e metas. Nenhum agente executa ação amarela
          sem a sua aprovação; ações vermelhas (dinheiro, preços, permissões, apagar dados) nenhum agente consegue fazer.
        </p>
      </header>

      {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}
      {!data ? (
        <p className="text-sm text-status-danger">Não foi possível carregar a operação agora. Tente de novo em instantes.</p>
      ) : (
        <Operations data={data} />
      )}
    </main>
  );
}

function Operations({ data }: { data: OpsSummary }) {
  const unhealthy = data.routines.filter((routine) => !routine.healthy);
  const budgetShare = data.budget.dailyBrl > 0 ? Math.min(1, data.budget.spentTodayBrl / data.budget.dailyBrl) : 0;
  const cards = [
    { label: "Aprovações esperando você", value: String(data.approvals.length), alert: data.approvals.length > 0 },
    { label: "Rotinas com problema", value: String(unhealthy.length), alert: unhealthy.length > 0 },
    { label: "Gasto dos agentes hoje", value: `${brl(data.budget.spentTodayBrl)} de ${formatBRL(data.budget.dailyBrl)}`, alert: budgetShare >= 0.8 },
    { label: "Gasto com IA do site (30 dias)", value: brl(data.cost.last30dBrl), alert: false },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo">
        {cards.map((card) => (
          <div key={card.label} className={`flex flex-col gap-1 rounded-brand-lg border-2 p-4 ${card.alert ? "border-brand-orange bg-surface-raised" : "border-border bg-surface-raised"}`}>
            <p className="text-xs text-ink-muted">{card.label}</p>
            <p className="font-display text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">{card.value}</p>
          </div>
        ))}
      </section>

      <AgentsPanel data={data} />

      <section id="aprovacoes" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">
          Aprovações <span className="text-base font-normal text-ink-muted">({data.approvals.length})</span>
        </h2>
        {data.approvals.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma ação esperando sua decisão.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.approvals.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </ul>
        )}
        {data.recentApprovals.length > 0 && (
          <details className="rounded-brand-lg border border-border bg-surface-raised px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Decididas recentemente ({data.recentApprovals.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {data.recentApprovals.map((approval) => (
                <li key={approval.id} className="py-2">
                  <span className="font-semibold text-ink">{APPROVAL_STATUS_LABELS[approval.status] ?? approval.status}</span> · {approval.summary}
                  <span className="block text-xs text-ink-muted">
                    {OPS_AGENT_LABELS[approval.agent] ?? approval.agent} · pedido em {dateTime(approval.createdAt)}
                    {approval.decidedAt ? ` · decidido em ${dateTime(approval.decidedAt)}` : ""}
                    {approval.decisionNote ? ` · “${approval.decisionNote}”` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section id="rotinas" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Saúde das rotinas automáticas</h2>
          <p className="text-xs text-ink-muted">
            Você recebe notificação e e-mail quando uma rotina fica 3 intervalos sem rodar ou falha 3 vezes seguidas. Rotinas aparecem aqui depois da primeira rodada.
          </p>
        </div>
        <div className="overflow-x-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Rotina</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Última rodada</th>
                <th className="px-3 py-2">Último erro</th>
              </tr>
            </thead>
            <tbody>
              {data.routines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-ink-muted">
                    Nenhuma rotina registrou rodada ainda.
                  </td>
                </tr>
              )}
              {data.routines.map((routine) => (
                <tr key={routine.name} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-ink">{OPS_ROUTINE_LABELS[routine.name] ?? routine.name}</span>
                    <span className="block text-xs text-ink-muted">{interval(routine.intervalMs)}</span>
                  </td>
                  <td className={`px-3 py-2 font-semibold ${routine.healthy ? "text-brand-green" : "text-status-danger"}`}>
                    {routine.healthy ? "● Funcionando" : routine.failures > 0 ? `● Falhando (${routine.failures}×)` : "● Parada"}
                  </td>
                  <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{dateTime(routine.lastRunAt)}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">{routine.lastError ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="custo" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Gasto com IA</h2>
          <p className="text-xs text-ink-muted">
            Cada chamada aos modelos Claude é registrada com tokens e custo. Teto diário dos agentes: {formatBRL(data.budget.dailyBrl)} (os usos que já existiam têm
            limites próprios). Hoje, no site todo: {brl(data.cost.todayBrl)}. Cotação usada: US$ 1 = R$ {data.budget.usdToBrl.toFixed(2).replace(".", ",")}.
          </p>
        </div>
        <div className="h-2 rounded-full bg-surface-sober" role="img" aria-label={`Gasto dos agentes hoje: ${Math.round(budgetShare * 100)}% do teto`}>
          <div className={`h-2 rounded-full ${budgetShare >= 0.8 ? "bg-brand-orange" : "bg-brand-green"}`} style={{ width: `${Math.max(1, budgetShare * 100)}%` }} />
        </div>
        <div className="overflow-x-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="bg-surface-sober px-3 py-2 text-left text-sm font-semibold text-ink">Últimos 30 dias, por uso</caption>
            <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Uso</th>
                <th className="px-3 py-2 text-right">Chamadas</th>
                <th className="px-3 py-2 text-right">Custo</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {data.cost.byFeature.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-ink-muted">
                    Nenhuma chamada registrada ainda (o registro começou nesta versão).
                  </td>
                </tr>
              )}
              {data.cost.byFeature.map((row) => (
                <tr key={row.feature} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold text-ink">
                    {OPS_FEATURE_LABELS[row.feature] ?? (row.feature.startsWith("agente:") ? `Agente: ${OPS_AGENT_LABELS[row.feature.slice(7)] ?? row.feature.slice(7)}` : row.feature)}
                  </td>
                  <td className="px-3 py-2 text-right">{row.calls.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">{brl(row.brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="tarefas" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Tarefas</h2>
          <p className="text-xs text-ink-muted">As 50 mais recentes, com o último registro de cada uma.</p>
        </div>
        {/* Rolagem própria (cerca de 6 tarefas visíveis) com cabeçalho fixo. */}
        <div className="max-h-[560px] overflow-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Tarefa</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Criada</th>
                <th className="px-3 py-2">Último registro</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-ink-muted">
                    Nenhuma tarefa ainda.
                  </td>
                </tr>
              )}
              {data.tasks.map((task) => (
                <tr key={task.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <span className="line-clamp-3 font-semibold text-ink" title={task.objective}>
                      {task.objective}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {OPS_AGENT_LABELS[task.agent] ?? task.agent} · {SEGMENT_LABELS[task.segment] ?? task.segment} · por {task.createdBy}
                    </span>
                  </td>
                  <td className={`px-3 py-2 font-semibold ${task.status === "failed" || task.status === "blocked" ? "text-status-danger" : task.status === "completed" ? "text-brand-green" : "text-ink"}`}>
                    {OPS_TASK_STATUS_LABELS[task.status] ?? task.status}
                    {task.attempts > 1 && <span className="block text-xs font-normal text-ink-muted">{task.attempts} tentativas</span>}
                  </td>
                  <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{dateTime(task.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">{task.error ?? task.lastEvent ?? "—"}</td>
                  <td className="px-3 py-2">
                    <form action={opsTaskActionForm.bind(null, task.id)} className="flex flex-col gap-1">
                      {(task.status === "failed" || task.status === "blocked") && (
                        <button type="submit" name="action" value="retry" className="text-left text-xs font-semibold text-brand-blue hover:underline">
                          Tentar de novo
                        </button>
                      )}
                      {["pending", "blocked", "awaiting_approval", "failed"].includes(task.status) && (
                        <button type="submit" name="action" value="cancel" className="text-left text-xs font-semibold text-status-danger hover:underline">
                          Cancelar
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <Goals data={data} />
    </>
  );
}

function ApprovalCard({ approval }: { approval: OpsApprovalView }) {
  return (
    <li className="flex flex-col gap-3 rounded-brand-lg border-2 border-brand-orange bg-surface-raised p-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{OPS_AGENT_LABELS[approval.agent] ?? approval.agent} pede</p>
        <p className="mt-1 font-semibold text-ink">{approval.summary}</p>
        {approval.impact && <p className="mt-1 text-ink">Impacto: {approval.impact}</p>}
        <p className="mt-1 text-xs text-ink-muted">
          Pedido em {dateTime(approval.createdAt)} · vale até {dateTime(approval.expiresAt)} · ferramenta {approval.tool}
        </p>
      </div>
      <form action={opsDecisionAction.bind(null, approval.id)} className="flex shrink-0 flex-col gap-2 md:w-72">
        <input name="note" placeholder="Observação (opcional)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-xs text-ink placeholder:text-ink-muted" />
        <div className="flex gap-2">
          <Button type="submit" name="decision" value="approve" variant="primary" className="flex-1 justify-center">
            Aprovar
          </Button>
          <Button type="submit" name="decision" value="reject" variant="ghost" className="flex-1 justify-center">
            Recusar
          </Button>
        </div>
      </form>
    </li>
  );
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function Goals({ data }: { data: OpsSummary }) {
  return (
    <section id="metas" className="flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Metas</h2>
        <p className="text-xs text-ink-muted">
          O valor atual é calculado pelo sistema a partir dos dados do site — nenhum agente informa o próprio resultado. O Diretor usa estas metas no resumo diário.
        </p>
      </div>
      {data.goals.length > 0 && (
        <div className="overflow-x-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Indicador</th>
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2 text-right">Meta</th>
                <th className="px-3 py-2 text-right">Atual</th>
                <th className="w-1/5 px-3 py-2">Progresso</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {data.goals.map((goal) => {
                const money = goal.metric === "receita_total";
                const format = (value: number) => (money ? formatBRL(value) : value.toLocaleString("pt-BR"));
                const share = goal.current !== undefined && goal.target > 0 ? Math.min(1, goal.current / goal.target) : 0;
                return (
                  <tr key={goal.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-ink">{OPS_GOAL_METRICS[goal.metric] ?? goal.metric}</span>
                      <span className="block text-xs text-ink-muted">
                        {SEGMENT_LABELS[goal.segment]} · {OPS_AGENT_LABELS[goal.agent] ?? goal.agent}
                        {goal.note ? ` · ${goal.note}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">{goal.period}</td>
                    <td className="px-3 py-2 text-right">{format(goal.target)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ink">{goal.current === undefined ? "—" : format(goal.current)}</td>
                    <td className="px-3 py-2">
                      <div className="h-2 rounded-full bg-surface-sober" title={`${Math.round(share * 100)}%`}>
                        <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                      <span className="text-xs text-ink-muted">{Math.round(share * 100)}%</span>
                    </td>
                    <td className="px-3 py-2">
                      <form action={opsDeleteGoalAction.bind(null, goal.id)}>
                        <button type="submit" className="text-xs font-semibold text-status-danger hover:underline">
                          Apagar
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form action={opsSaveGoalAction} className="grid grid-cols-2 items-end gap-3 rounded-brand-lg border border-border bg-surface-raised p-4 md:grid-cols-6">
        <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-ink">
          Indicador
          <select name="metric" required className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal">
            {Object.entries(OPS_GOAL_METRICS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Recorte
          <select name="segment" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal">
            {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Mês
          <input type="month" name="period" required defaultValue={currentMonth()} className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Meta
          <input name="target" required inputMode="decimal" placeholder="0" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Responsável
          <select name="agent" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal">
            {["diretor", "operacoes", "comercial", "financeiro", "atendimento"].map((value) => (
              <option key={value} value={value}>
                {OPS_AGENT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-ink md:col-span-5">
          Observação
          <input name="note" placeholder="opcional" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <Button type="submit" variant="primary" className="col-span-2 justify-center md:col-span-1">
          Salvar meta
        </Button>
      </form>
    </section>
  );
}

const AGENT_SCHEDULE: Record<string, string> = {
  diretor: "todo dia às 8h",
  operacoes: "todo dia às 9h",
  comercial: "todo dia às 10h",
  financeiro: "segundas às 7h",
  atendimento: "todo dia às 14h",
};

const AGENT_JOB: Record<string, string> = {
  diretor: "Lê metas e números, aponta o que está em risco, distribui tarefas e manda o resumo do dia por e-mail.",
  operacoes: "Acha anúncios com problema e manda dicas aos donos; pede sua aprovação para suspender casos suspeitos.",
  comercial: "Lembra lojas com clientes esperando resposta e lojas no período grátis que ainda não anunciaram.",
  atendimento: "Lembra vendedores (PF e lojas) de responder compradores que esperam há mais de 24h e avisa você sobre financiamentos sem contato e denúncias abertas.",
  financeiro: "Relatório semanal: receita por linha, assinaturas em atraso, comissões e cashback a pagar e gasto com IA. Só lê; não paga nada.",
};

function AgentsPanel({ data }: { data: OpsSummary }) {
  return (
    <section id="agentes" className="flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Agentes</h2>
        {!data.agentsEnabled && (
          <p className="mt-1 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">A IA dos agentes está desligada no servidor (sem chave da Anthropic ou OPS_AGENTS_DISABLED=1).</p>
        )}
        {!data.windsorEnabled && (
          <p className="mt-1 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">
            Google Analytics e Instagram ainda não estão ligados (falta a chave do Windsor.ai no servidor). O Diretor trabalha só com os dados do site até lá.
          </p>
        )}
      </div>
      {data.latestSummary && (
        <article className="rounded-brand-lg border-2 border-brand-blue bg-surface-raised p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Resumo do Diretor · {dateTime(data.latestSummary.createdAt)}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{data.latestSummary.body}</p>
        </article>
      )}
      {data.latestFinanceReport && (
        <article id="financeiro" className="scroll-mt-24 rounded-brand-lg border-2 border-brand-green bg-surface-raised p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Relatório Financeiro · {dateTime(data.latestFinanceReport.createdAt)}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{data.latestFinanceReport.body}</p>
        </article>
      )}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {OPS_RUNNABLE_AGENTS.map((agent) => (
          <li key={agent} className="flex flex-col gap-2 rounded-brand-lg border border-border bg-surface-raised p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">{OPS_AGENT_LABELS[agent]}</p>
              <p className="text-xs text-ink-muted">{AGENT_SCHEDULE[agent]}</p>
            </div>
            <p className="text-sm text-ink-muted">{AGENT_JOB[agent]}</p>
            <form action={opsRunAgentAction.bind(null, agent)}>
              <button type="submit" disabled={!data.agentsEnabled} className="text-sm font-semibold text-brand-blue hover:underline disabled:text-ink-muted disabled:no-underline">
                Rodar agora →
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

