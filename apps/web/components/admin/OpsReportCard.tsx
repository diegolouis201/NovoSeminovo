import type { OpsReportBlock, OpsReportView } from "@novoseminovo/shared-types";

// Relatório dos agentes em formato de painel: frase principal, números em
// destaque e listas curtas. Relatório antigo (só texto) é quebrado em frases
// e listas para não virar um bloco embolado.

const BLOCK_STYLE: Record<OpsReportBlock["tipo"], { box: string; title: string; icon: string }> = {
  bom: { box: "border-brand-green/40 bg-brand-green/5", title: "text-brand-green", icon: "✓" },
  atencao: { box: "border-brand-orange/50 bg-brand-orange/5", title: "text-brand-orange", icon: "!" },
  acao: { box: "border-brand-blue/40 bg-brand-blue/5", title: "text-brand-blue", icon: "→" },
  info: { box: "border-border bg-surface-sober", title: "text-ink", icon: "•" },
};

const NUMBER_TONE: Record<string, string> = {
  bom: "text-brand-green",
  atencao: "text-brand-orange",
  neutro: "text-ink",
};

function Block({ bloco }: { bloco: OpsReportBlock }) {
  const style = BLOCK_STYLE[bloco.tipo];
  const List = bloco.tipo === "acao" ? "ol" : "ul";
  return (
    <section className={`rounded-brand border p-3 ${style.box}`}>
      <h4 className={`text-sm font-bold ${style.title}`}>
        <span aria-hidden="true">{style.icon} </span>
        {bloco.titulo}
      </h4>
      <List className={`mt-1.5 flex flex-col gap-1 pl-5 text-sm text-ink ${bloco.tipo === "acao" ? "list-decimal" : "list-disc"}`}>
        {bloco.itens.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </List>
    </section>
  );
}

// Texto antigo: parágrafos viram listas de frases; linhas "Título:" seguidas
// de "• item"/"1. item" viram blocos.
function legacyBlocks(body: string): { intro: string[]; blocos: OpsReportBlock[] } {
  const intro: string[] = [];
  const blocos: OpsReportBlock[] = [];
  for (const paragraph of body.split(/\n\s*\n/)) {
    const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const isList = lines.slice(1).length > 0 && lines.slice(1).every((l) => /^(•|-|\d+\.)\s/.test(l));
    const head = lines[0] ?? "";
    if (isList && head.endsWith(":")) {
      const titulo = head.slice(0, -1).slice(0, 60);
      const tipo: OpsReportBlock["tipo"] = /risco|alerta|aten/i.test(titulo) ? "atencao" : /prioridad|decidir|aç/i.test(titulo) ? "acao" : "info";
      blocos.push({ titulo, tipo, itens: lines.slice(1).map((l) => l.replace(/^(•|-|\d+\.)\s*/, "")) });
    } else {
      intro.push(...lines.join(" ").split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/));
    }
  }
  return { intro, blocos };
}

export function OpsReportCard({ title, report, accent, id }: { title: string; report: OpsReportView; accent: "blue" | "green"; id?: string }) {
  const border = accent === "blue" ? "border-brand-blue" : "border-brand-green";
  const label = accent === "blue" ? "text-brand-blue" : "text-brand-green";
  const when = new Date(report.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const layout = report.layout;
  const legacy = layout ? undefined : legacyBlocks(report.body);

  return (
    <article id={id} data-cy="ops-report" className={`scroll-mt-24 rounded-brand-lg border-2 ${border} bg-surface-raised p-4`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${label}`}>
        {title} · {when}
      </p>

      {layout ? (
        <>
          <p className="mt-2 font-display text-lg font-semibold leading-snug text-ink">{layout.manchete}</p>
          {layout.numeros.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {layout.numeros.map((numero, index) => (
                <div key={index} className="rounded-brand bg-surface-sober px-3 py-2">
                  <dt className="text-xs text-ink-muted">{numero.rotulo}</dt>
                  <dd className={`text-lg font-bold ${NUMBER_TONE[numero.tom ?? "neutro"]}`}>{numero.valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {layout.blocos.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {layout.blocos.map((bloco, index) => (
                <Block key={index} bloco={bloco} />
              ))}
            </div>
          )}
          {layout.detalhes && (
            <details className="mt-3 text-sm text-ink">
              <summary className="cursor-pointer font-semibold text-ink-muted">Ver detalhes</summary>
              <p className="mt-2 whitespace-pre-line">{layout.detalhes}</p>
            </details>
          )}
        </>
      ) : (
        <>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
            {legacy!.intro.map((sentence, index) => (
              <li key={index}>{sentence}</li>
            ))}
          </ul>
          {legacy!.blocos.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {legacy!.blocos.map((bloco, index) => (
                <Block key={index} bloco={bloco} />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}
