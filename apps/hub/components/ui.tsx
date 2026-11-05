import Link from "next/link";

export function Kpi({ valor, rotulo, detalhe, tom = "navy", href }: { valor: React.ReactNode; rotulo: string; detalhe?: React.ReactNode; tom?: "navy" | "orange" | "green" | "danger"; href?: string }) {
  const cor = { navy: "text-navy", orange: "text-orange", green: "text-green", danger: "text-danger" }[tom];
  const body = (
    <>
      <p className={`font-display text-3xl font-semibold ${cor}`}>{valor}</p>
      <p className="mt-1 text-sm text-muted">{rotulo}</p>
      {detalhe ? <p className="mt-1 text-xs text-muted">{detalhe}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-blue">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

export function Secao({ titulo, acao, children, className = "" }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="py-8 text-center">
      <p className="font-semibold text-navy">{titulo}</p>
      {texto ? <p className="mt-1 text-sm text-muted">{texto}</p> : null}
    </div>
  );
}

const NIVEL = { urgente: "bg-orange/15 text-danger", oportunidade: "bg-green/15 text-green", acompanhar: "bg-blue/10 text-blue" } as const;
export function Nivel({ nivel }: { nivel: string }) {
  const label = { urgente: "Urgente", oportunidade: "Oportunidade", acompanhar: "Acompanhar" }[nivel] ?? nivel;
  return <span className={`pill ${NIVEL[nivel as keyof typeof NIVEL] ?? "bg-line text-muted"}`}>{label}</span>;
}

export function Etapa({ nome }: { nome?: string }) {
  return nome ? <span className="pill whitespace-nowrap bg-blue/10 text-blue">{nome}</span> : null;
}

export function Cabecalho({ titulo, subtitulo, acao }: { titulo: string; subtitulo?: string; acao?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{titulo}</h1>
        {subtitulo ? <p className="mt-1 text-sm text-muted">{subtitulo}</p> : null}
      </div>
      {acao}
    </div>
  );
}
