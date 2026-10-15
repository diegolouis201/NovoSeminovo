// Wordmark da identidade visual original (ver PDF de marca e o vídeo da
// campanha de lançamento): "Novo" (azul) / "Sem" + "i" verde / "Nov" + "o"
// verde, fechando com um traço grosso em forma de lua crescente (o
// "sorriso") — a última letra de cada uma das duas linhas de baixo é verde,
// não laranja, e é exatamente a altura dessas duas linhas (não da palavra
// "Novo" de cima) que o sorriso acompanha. "stacked" reproduz o lockup de 3
// linhas do manual (cabeçalho, contextos quadrados como favicon/rodapé/telas
// de autenticação); "inline" é uma adaptação de uma linha só, pra espaços
// bem estreitos onde 3 linhas não cabem.
type LogoProps = {
  variant?: "inline" | "stacked";
  className?: string;
};

// O ")" do manual não é a letra de parêntese da fonte — é um traço grosso e
// arredondado (mesma espessura das letras), bem mais parecido com uma lua
// crescente do que com tipografia. Um caractere ")" girado via CSS nunca
// reproduz essa forma; por isso é um SVG próprio, com "currentColor" pra
// herdar a cor verde ao lado.
//
// "tall" acompanha "Sem[i]" + "Nov[o]" (as duas linhas de baixo, do topo do
// "i" ao fundo do "o") — não as 3 linhas inteiras, que inclui o "Novo" azul
// de cima. 1.64em ≈ 2 linhas em leading-[0.82].
function Smile({ tall = false }: { tall?: boolean }) {
  if (tall) {
    return (
      <svg viewBox="0 0 26 100" className="ml-1 h-[1.64em] w-[0.5em] self-end text-brand-green" fill="none" aria-hidden>
        <path d="M7 6 Q 22 50 7 94" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      </svg>
    );
  }

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
        <span className="inline-flex items-end">
          <span className="flex flex-col">
            <span>
              <span className="text-brand-orange">Sem</span>
              <span className="ml-[0.37em] text-brand-green">i</span>
            </span>
            <span>
              <span className="text-brand-orange">Nov</span>
              <span className="text-brand-green">o</span>
            </span>
          </span>
          <Smile tall />
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center font-display font-bold tracking-tight ${className ?? ""}`}>
      <span className="text-brand-blue">Novo</span>
      <span className="text-brand-orange">Sem</span>
      <span className="text-brand-green">i</span>
      <span className="flex items-center text-brand-orange">
        Nov<span className="text-brand-green">o</span>
        <Smile />
      </span>
    </span>
  );
}
