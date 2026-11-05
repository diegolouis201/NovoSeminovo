// Barra de meta: realizado (verde), linha do ritmo para hoje e a meta no fim.
export function BarraMeta({ realizado, ritmo, meta }: { realizado: number; ritmo: number; meta: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, meta > 0 ? (v / meta) * 100 : 0))}%`;
  return (
    <div className="relative mt-6 h-3 rounded-full bg-line" role="img" aria-label={`Realizado ${realizado} de ${meta}; ritmo para hoje ${ritmo}`}>
      <div className="h-3 rounded-full bg-green" style={{ width: pct(realizado) }} />
      <div className="absolute -top-2 h-7 border-l-2 border-dashed border-navy" style={{ left: pct(ritmo) }} />
    </div>
  );
}

export function BarraRegua({ progresso, situacao }: { progresso: number; situacao: string }) {
  const cor = situacao === "atrasado" ? "bg-danger" : situacao === "vencendo" ? "bg-orange" : "bg-green";
  return (
    <div className="h-2 w-full rounded-full bg-line">
      <div className={`h-2 rounded-full ${cor}`} style={{ width: `${Math.max(3, Math.min(100, progresso * 100))}%` }} />
    </div>
  );
}
