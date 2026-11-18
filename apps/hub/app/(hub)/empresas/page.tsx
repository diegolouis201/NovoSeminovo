import Link from "next/link";
import { SALES_SOURCE_LABELS, segmentoLabel } from "@novoseminovo/shared-types";
import { Cabecalho, Etapa } from "@/components/ui";
import { ETAPAS, feed, hoje, marcacoes, me } from "@/lib/crm";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Empresas" };

type Linha = { chave: string; nome: string; segmento?: string; cidade?: string; uf?: string; contato?: string; telefone?: string; email?: string; etapaId?: string; etapa?: string; vendedor?: string; plano?: string; valor?: number; status?: string; cadastro?: string; naoContatar?: boolean; importante?: boolean; tags: string[]; origem: string; etiqueta?: string };

export default async function Empresas({ searchParams }: { searchParams: { q?: string; etapa?: string; segmento?: string; filtro?: string; vendedor?: string; origem?: string; etiqueta?: string } }) {
  const [f, m, acesso] = await Promise.all([feed(), marcacoes(), me()]);
  void hoje;
  const mk = (k?: string, k2?: string) => (k && m[k]) || (k2 && m[k2]) || undefined;
  const linhas: Linha[] = [
    ...f.empresas.map((e) => {
      const mm = mk(e.id, e.cardId);
      return { chave: e.cardId ?? e.id, nome: e.nome, segmento: e.segmento, cidade: e.cidade, uf: e.uf, contato: e.responsavel.nome, telefone: e.responsavel.telefone, email: e.responsavel.email, etapaId: e.etapa.id, etapa: e.etapa.nome, vendedor: e.vendedor, plano: e.plano?.nome, valor: e.plano?.valorMensal, status: e.plano?.status, cadastro: e.cadastroNoSiteEm, naoContatar: mm?.naoContatar, importante: mm?.importante, tags: mm?.tags ?? [], origem: "site" };
    }),
    ...f.prospeccao.map((p) => {
      const mm = mk(p.cardId);
      return { chave: p.cardId, nome: p.nome, segmento: p.segmento, cidade: p.cidade, uf: p.uf, contato: p.contato, telefone: p.telefone, email: p.email, etapaId: p.etapa.id, etapa: p.etapa.nome, vendedor: p.vendedor, cadastro: undefined, naoContatar: mm?.naoContatar, importante: mm?.importante, tags: mm?.tags ?? [], origem: p.origem, etiqueta: p.etiqueta };
    }),
  ];
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const vendedores = [...new Set(linhas.map((l) => l.vendedor).filter(Boolean))].sort() as string[];
  const etiquetas = [...new Set(linhas.map((l) => l.etiqueta).filter(Boolean))].sort() as string[];
  const origens = [...new Set(linhas.map((l) => l.origem))].sort();
  const filtradas = linhas
    .filter((l) => !q || [l.nome, l.cidade, l.contato, l.email, l.telefone, l.etiqueta, ...l.tags].some((v) => v?.toLowerCase().includes(q)))
    .filter((l) => !searchParams.etapa || l.etapaId === searchParams.etapa)
    .filter((l) => !searchParams.segmento || l.segmento === searchParams.segmento)
    .filter((l) => !searchParams.vendedor || l.vendedor === searchParams.vendedor)
    .filter((l) => !searchParams.origem || l.origem === searchParams.origem)
    .filter((l) => !searchParams.etiqueta || l.etiqueta === searchParams.etiqueta)
    .filter((l) => searchParams.filtro !== "assinantes" || l.status === "ativa" || l.status === "em_atraso")
    .filter((l) => searchParams.filtro !== "importantes" || l.importante)
    .sort((a, b) => Number(Boolean(b.importante)) - Number(Boolean(a.importante)) || a.nome.localeCompare(b.nome));

  return (
    <>
      <Cabecalho
        titulo="Empresas"
        subtitulo={`${filtradas.length} de ${linhas.length} · lojas, imobiliárias, corretores e construtoras de todo o Brasil`}
        acao={acesso.permissions.includes("crm.editar") ? <Link className="btn" href="/empresas/importar">Importar empresas (Mailerfind)</Link> : undefined}
      />
      <search>
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
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
          <option value="property">Imobiliárias</option>
          <option value="broker">Corretores de imóveis</option>
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
        <select name="origem" defaultValue={searchParams.origem ?? ""} className="input" aria-label="Origem">
          <option value="">Todas as origens</option>
          {origens.map((o) => (
            <option key={o} value={o}>{SALES_SOURCE_LABELS[o as keyof typeof SALES_SOURCE_LABELS] ?? (o === "site" ? "Cadastro no site" : o)}</option>
          ))}
        </select>
        <select name="etiqueta" defaultValue={searchParams.etiqueta ?? ""} className="input" aria-label="Etiqueta da campanha">
          <option value="">Todas as etiquetas</option>
          {etiquetas.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <button className="btn-primary">Filtrar</button>
      </form>
      </search>
      {searchParams.etiqueta && acesso.permissions.includes("equipe") ? (
        <p className="mb-4 text-sm">
          <Link className="link" href={`/prospeccao?etiqueta=${encodeURIComponent(searchParams.etiqueta)}`}>Inscrever as empresas desta etiqueta numa sequência de e-mails</Link>
        </p>
      ) : null}
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
                    {[l.cidade, l.uf].filter(Boolean).join("/") || "—"} · {segmentoLabel(l.segmento)}
                  </p>
                  {l.etiqueta ? <span className="pill mt-1 bg-blue/10 text-blue">{l.etiqueta}</span> : null}
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
