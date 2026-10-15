// Wordmark da identidade visual original (ver PDF de marca e o vídeo da
// campanha de lançamento): três blocos coloridos — azul/laranja/verde —
// fechando com um traço grosso em forma de lua crescente (o "sorriso").
// "stacked" reproduz o lockup de 3 linhas do manual (usado no cabeçalho e em
// contextos quadrados como favicon/rodapé/telas de autenticação); "inline" é
// uma adaptação de uma linha só, pra espaços bem estreitos onde 3 linhas não
// cabem.
type LogoProps = {
  variant?: "inline" | "stacked";
  className?: string;
};

// O ")" do manual não é a letra de parêntese da fonte — é um traço grosso e
// arredondado (mesma espessura das letras), bem mais parecido com uma lua
// crescente do que com tipografia. Um caractere ")" girado via CSS nunca
// reproduz essa forma (fica fino e torto); por isso é um SVG próprio, com
// "currentColor" pra herdar a cor verde do texto ao lado.
function Smile() {
  return (
    <svg viewBox="0 0 22 32" className="ml-1 h-[1.05em] w-[0.75em]" fill="none" aria-hidden>
      <path d="M6 4 Q 18 16 6 28" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
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
