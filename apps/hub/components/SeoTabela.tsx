"use client";

import { useMemo, useState } from "react";

// Tabela do SEO com ordenação no navegador (clique no título da coluna).
// Textos vêm do Google (consultas e endereços): o React escapa tudo; link só
// com http(s):// e abrindo em outra aba com rel="noopener noreferrer".
export type SeoColuna = { id: string; rotulo: string; tipo: "texto" | "pagina" | "int" | "pct" | "pos" };
type Linha = Record<string, string | number>;

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const pos = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function caminho(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

function Celula({ coluna, valor }: { coluna: SeoColuna; valor: string | number | undefined }) {
  if (valor === undefined) return <>—</>;
  if (coluna.tipo === "int") return <>{int(Number(valor))}</>;
  if (coluna.tipo === "pct") return <>{pct(Number(valor))}</>;
  if (coluna.tipo === "pos") return <>{pos(Number(valor))}</>;
  const texto = String(valor);
  if (coluna.tipo === "pagina" && /^https?:\/\//i.test(texto)) {
    return (
      <a className="link break-all" href={texto} target="_blank" rel="noopener noreferrer" title={texto}>
        {caminho(texto)}
      </a>
    );
  }
  return <span className="break-words">{texto}</span>;
}

export function SeoTabela({ colunas, linhas, ordem, vazio = "Sem dados no período.", testid }: { colunas: SeoColuna[]; linhas: Linha[]; ordem: string; vazio?: string; testid?: string }) {
  const [por, setPor] = useState(ordem);
  const [desc, setDesc] = useState(true);
  const ordenadas = useMemo(() => {
    const col = colunas.find((c) => c.id === por);
    const texto = col?.tipo === "texto" || col?.tipo === "pagina";
    return [...linhas].sort((a, b) => {
      const x = a[por];
      const y = b[por];
      const r = texto ? String(x ?? "").localeCompare(String(y ?? ""), "pt-BR") : Number(x ?? 0) - Number(y ?? 0);
      return desc ? -r : r;
    });
  }, [linhas, colunas, por, desc]);
  if (!linhas.length) return <p className="text-sm text-muted">{vazio}</p>;
  const clicar = (id: string) => {
    if (id === por) setDesc(!desc);
    else {
      setPor(id);
      // Posição: menor é melhor, então começa do menor; números, do maior.
      const c = colunas.find((x) => x.id === id);
      setDesc(!(c?.tipo === "pos" || c?.tipo === "texto" || c?.tipo === "pagina"));
    }
  };
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="tabela min-w-[560px]">
        <thead>
          <tr>
            {colunas.map((c) => {
              const num = c.tipo !== "texto" && c.tipo !== "pagina";
              const ativa = c.id === por;
              return (
                <th key={c.id} className={num ? "text-right" : ""} aria-sort={ativa ? (desc ? "descending" : "ascending") : "none"}>
                  <button type="button" onClick={() => clicar(c.id)} className={`whitespace-nowrap font-semibold ${ativa ? "text-navy" : ""}`}>
                    {c.rotulo}
                    {ativa ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l, i) => (
            <tr key={`${String(l[colunas[0]!.id])}-${i}`}>
              {colunas.map((c) => (
                <td key={c.id} className={c.tipo === "texto" || c.tipo === "pagina" ? "text-sm" : "whitespace-nowrap text-right"}>
                  <Celula coluna={c} valor={l[c.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
