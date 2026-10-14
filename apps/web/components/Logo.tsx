// Wordmark da identidade visual original (ver PDF de marca, Etapa de
// branding): três blocos coloridos — azul/laranja/verde — fechando com um
// ")" que funciona como sorriso. "stacked" reproduz o lockup de 3 linhas do
// manual (favicon, rodapé, telas de autenticação); "inline" é a adaptação
// pra caber numa barra de topo de altura normal (cabeçalho do site).
type LogoProps = {
  variant?: "inline" | "stacked";
  className?: string;
};

export function Logo({ variant = "inline", className }: LogoProps) {
  const smile = (
    <span aria-hidden className="inline-block -rotate-6">
      )
    </span>
  );

  if (variant === "stacked") {
    return (
      <span className={`flex flex-col font-display text-2xl font-bold leading-[0.85] ${className ?? ""}`}>
        <span className="text-brand-blue">NOVO</span>
        <span className="text-brand-orange">SEMI</span>
        <span className="text-brand-green">
          NOVO
          {smile}
        </span>
      </span>
    );
  }

  return (
    <span className={`font-display font-bold tracking-tight ${className ?? ""}`}>
      <span className="text-brand-blue">Novo</span>
      <span className="text-brand-orange">Semi</span>
      <span className="text-brand-green">
        Novo
        {smile}
      </span>
    </span>
  );
}
