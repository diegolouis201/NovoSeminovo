import Link from "next/link";
import { Cabecalho, Etapa } from "@/components/ui";
import { ETAPAS, feed, hoje, marcacoes } from "@/lib/crm";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Empresas" };

type Linha = { chave: string; nome: string; segmento?: string; cidade?: string; uf?: string; contato?: string; telefone?: string; email?: string; etapaId?: string; etapa?: string; vendedor?: string; plano?: string; valor?: number; status?: string; cadastro?: string; naoContatar?: boolean; importante?: boolean; tags: string[] };

export default async function Empresas({ searchParams }: { searchParams: { q?: string; etapa?: string; segmento?: string; filtro?: string; vendedor?: string } }) {
  const [f, m] = await Promise.all([feed(), marcacoes()]);
  void hoje;
  const mk = (k?: string, k2?: string) => (k && m[k]) || (k2 && m[k2]) || undefined;
  const linhas: Linha[] = [
    ...f.empresas.map((e) => {
      const mm = mk(e.id, e.cardId);
      return { chave: e.cardId ?? e.id, nome: e.nome, segmento: e.segmento, cidade: e.cidade, uf: e.uf, contato: e.responsavel.nome, telefone: e.responsavel.telefone, email: e.responsavel.email, etapaId: e.etapa.id, etapa: e.etapa.nome, vendedor: e.vendedor, plano: e.plano?.nome, valor: e.plano?.valorMensal, status: e.plano?.status, cadastro: e.cadastroNoSiteEm, naoContatar: mm?.naoContatar, importante: mm?.importante, tags: mm?.tags ?? [] };
    }),
    ...f.prospeccao.map((p) => {
      const mm = mk(p.cardId);
      return { chave: p.cardId, nome: p.nome, segmento: p.segmento, cidade: p.cidade, uf: p.uf, contato: p.contato, telefone: p.telefone, email: p.email, etapaId: p.etapa.id, etapa: p.etapa.nome, vendedor: p.vendedor, cadastro: undefined, naoContatar: mm?.naoContatar, importante: mm?.importante, tags: mm?.tags ?? [] };
    }),
  ];
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const vendedores = [...new Set(linhas.map((l) => l.vendedor).filter(Boolean))].sort() as string[];
  const filtradas = linhas
    .filter((l) => !q || [l.nome, l.cidade, l.contato, l.email, l.telefone, ...l.tags].some((v) => v?.toLowerCase().includes(q)))
    .filter((l) => !searchParams.etapa || l.etapaId === searchParams.etapa)
    .filter((l) => !searchParams.segmento || l.segmento === searchParams.segmento)
    .filter((l) => !searchParams.vendedor || l.vendedor === searchParams.vendedor)
    .filter((l) => searchParams.filtro !== "assinantes" || l.status === "ativa" || l.status === "em_atraso")
    .filter((l) => searchParams.filtro !== "importantes" || l.importante)
    .sort((a, b) => Number(Boolean(b.importante)) - Number(Boolean(a.importante)) || a.nome.localeCompare(b.nome));

  return (
    <>
      <Cabecalho titulo="Empresas" subtitulo={`${filtradas.length} de ${linhas.length} · lojas, imobiliárias, corretores e construtoras de todo o Brasil`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input name="q" defaultValue={searchParams.q} placeholder="Buscar nome, cidade, contato, e-mail, tag..." className="input" maxLength={100} />
        <select name="etapa" defaultValue={searchParams.etapa ?? ""} className="input">
          <option value="">Todas as etapas</option>
          {ETAPAS.map((e: { id: string; nome: string }) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <select name="segmento" defaultValue={searchParams.segmento ?? ""} className="input">
          <option value="">Carros e imóveis</option>
          <option value="vehicle">Veículos</option>
          <option value="property">Imóveis</option>
        </select>
        <select name="vendedor" defaultValue={searchParams.vendedor ?? ""} className="input">
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select name="filtro" defaultValue={searchParams.filtro ?? ""} className="input">
          <option value="">Todas</option>
          <option value="assinantes">Só assinantes</option>
          <option value="importantes">Só importantes</option>
        </select>
        <button className="btn-primary">Filtrar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="tabela min-w-[900px]">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Contato</th>
              <th>Etapa</th>
              <th>Vendedor</th>
              <th>Plano</th>
              <th>Cadastro no site</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={l.chave} className="hover:bg-cream">
                <td>
                  <Link className="link" href={`/empresas/${l.chave}`}>
                    {l.importante ? "⭐ " : ""}
                    {l.nome}
                  </Link>
                  <p className="text-xs text-muted">
                    {[l.cidade, l.uf].filter(Boolean).join("/") || "—"} · {l.segmento === "property" ? "Imóveis" : "Veículos"}
                  </p>
                  {l.naoContatar ? <span className="pill mt-1 bg-orange/15 text-danger">Não contatar</span> : null}
                </td>
                <td>
                  <p>{l.contato ?? "—"}</p>
                  <p className="text-xs text-muted">{l.telefone ?? l.email ?? ""}</p>
                </td>
                <td><Etapa nome={l.etapa} /></td>
                <td>{l.vendedor ?? <span className="text-muted">Sem dono</span>}</td>
                <td>
                  {l.plano ? (
                    <>
                      <p>{l.plano}</p>
                      <p className={`text-xs ${l.status === "em_atraso" ? "font-semibold text-danger" : "text-muted"}`}>{brl(l.valor)}/mês{l.status === "em_atraso" ? " · atrasado" : l.status === "cancelada" ? " · cancelado" : ""}</p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{data(l.cadastro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtradas.length ? <p className="p-6 text-center text-sm text-muted">Nenhuma empresa com esses filtros.</p> : null}
      </div>
    </>
  );
}
