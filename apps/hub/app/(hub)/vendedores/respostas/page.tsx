import Link from "next/link";
import { redirect } from "next/navigation";
import { RespostaCartao } from "@/components/RespostaCartao";
import { Cabecalho, Vazio } from "@/components/ui";
import { me } from "@/lib/crm";
import { painelVendedores, respostasParaAprovar } from "@/lib/vendedores";

export const metadata = { title: "Respostas para aprovar" };

export default async function Respostas({ searchParams }: { searchParams: { vendedor?: string } }) {
  const acesso = await me();
  if (!acesso.permissions.includes("equipe")) redirect("/vendedores");
  const vendedor = /^[A-Za-z0-9_-]{1,40}$/.test(searchParams.vendedor ?? "") ? searchParams.vendedor : undefined;
  const [lista, p] = await Promise.all([respostasParaAprovar(vendedor), painelVendedores()]);
  const ativos = p.vendedores.filter((v) => v.ativo);
  return (
    <>
      <Cabecalho titulo="Respostas para aprovar" subtitulo="Nada sai sem você no modo supervisionado. Aprove com 1 clique, edite antes de enviar ou rejeite (o motivo ensina a assistente)." acao={<Link className="btn" href="/vendedores">Voltar aos vendedores</Link>} />
      {ativos.length > 1 ? (
        <nav aria-label="Filtrar por vendedor" className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link className={`pill ${!vendedor ? "bg-blue text-white" : "bg-line text-navy"}`} aria-current={!vendedor ? "page" : undefined} href="/vendedores/respostas">Todos</Link>
          {ativos.map((v) => (
            <Link key={v.id} className={`pill ${vendedor === v.id ? "bg-blue text-white" : "bg-line text-navy"}`} aria-current={vendedor === v.id ? "page" : undefined} href={`/vendedores/respostas?vendedor=${v.id}`}>{v.nome} ({v.numeros.aprovacoesPendentes})</Link>
          ))}
        </nav>
      ) : null}
      {lista.length ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {lista.map((r) => <RespostaCartao key={r.id} r={r} />)}
        </div>
      ) : (
        <div className="card"><Vazio titulo="Nenhuma resposta esperando você" texto="Quando uma empresa responder o e-mail, o rascunho da assistente aparece aqui." /></div>
      )}
    </>
  );
}
