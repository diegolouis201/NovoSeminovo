// Batimento das rotinas automáticas da API (moderação, mapa, importação…).
// Cada rotina chama trackRoutine em volta de uma rodada; o OperationsModule
// liga o destino (tabela routine_heartbeats) quando a API sobe. Sem destino
// ligado (testes, rotina rodando antes do módulo), só executa.
type RoutineReport = { name: string; intervalMs: number; error?: string };
type Sink = (report: RoutineReport) => Promise<void>;
let sink: Sink | undefined;

export function setRoutineSink(next: Sink | undefined): void {
  sink = next;
}

export async function trackRoutine(name: string, intervalMs: number, run: () => Promise<unknown> | unknown): Promise<void> {
  let error: string | undefined;
  try {
    await run();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  await sink?.({ name, intervalMs, error }).catch(() => undefined);
}
