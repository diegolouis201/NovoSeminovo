import type { VendedorPainel } from "@novoseminovo/shared-types";

// Barras horizontais de uma série só (quantidade por categoria), no mesmo
// estilo do funil do Dashboard de vendas. O título da seção dá nome à série;
// o número fica escrito ao lado (texto, nunca só a cor) e cada barra tem
// dica ao passar o mouse.
export function Barras({ itens, rotulo, vazio }: { itens: { nome: string; valor: number }[]; rotulo: string; vazio: string }) {
  if (!itens.length) return <p className="py-4 text-sm text-muted">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.nome} className="grid grid-cols-[minmax(8rem,12rem)_1fr_2.5rem] items-center gap-3 text-sm" title={`${i.nome}: ${i.valor}`}>
          <span className="truncate">{i.nome}</span>
          <div className="h-3 rounded-full bg-line" aria-hidden="true">
            <div className="h-3 rounded-full bg-blue" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
          <span className="text-right font-semibold">{i.valor}</span>
        </li>
      ))}
    </ul>
  );
}

export function Situacao({ v }: { v: VendedorPainel }) {
  const [txt, cor] = !v.ativo ? ["Inativo", "bg-line text-muted"] : !v.caixa ? ["Sem caixa de e-mail", "bg-line text-muted"] : v.pausado ? ["Pausado", "bg-orange/15 text-danger"] : ["Ativo", "bg-green/15 text-green"];
  return <span className={`pill ${cor}`}>{txt}</span>;
}

