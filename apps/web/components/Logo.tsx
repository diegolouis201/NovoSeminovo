// Wordmark da identidade visual original (ver PDF de marca, Etapa de
// branding): três blocos coloridos — azul/laranja/verde — fechando com um
// ")" grande e inclinado que funciona como sorriso. "stacked" reproduz o
// lockup de 3 linhas do manual (usado no cabeçalho e em contextos quadrados
// como favicon/rodapé/telas de autenticação); "inline" é uma adaptação de
// uma linha só, pra espaços bem estreitos onde 3 linhas não cabem.
type LogoProps = {
  variant?: "inline" | "stacked";
  className?: string;
};

function Smile() {
  return (
    <span aria-hidden className="ml-1 inline-block -translate-y-[0.08em] -rotate-12 text-[1.75em] leading-none">
      )
    </span>
  );
}

export function Logo({ variant = "inline", className }: LogoProps) {
  if (variant === "stacked") {
    return (
      <span className={`flex flex-col font-display font-bold uppercase leading-[0.82] tracking-tight ${className ?? ""}`}>
        <span className="text-brand-blue">Novo</span>
        <span className="text-brand-orange">Semi</span>
        <span className="flex items-center text-brand-green">
          Novo
          <Smile />
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center font-display font-bold tracking-tight ${className ?? ""}`}>
      <span className="text-brand-blue">Novo</span>
      <span className="text-brand-orange">Semi</span>
      <span className="flex items-center text-brand-green">
        Novo
        <Smile />
      </span>
    </span>
  );
}
