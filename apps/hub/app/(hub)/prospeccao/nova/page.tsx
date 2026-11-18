import Link from "next/link";
import { SequenciaEditor } from "@/components/SequenciaEditor";
import { Cabecalho } from "@/components/ui";
import { me } from "@/lib/crm";

export const metadata = { title: "Nova sequência" };

export default async function NovaSequencia() {
  const acesso = await me();
  return (
    <>
      <Link href="/prospeccao" className="text-sm font-semibold text-muted hover:text-blue">← Sequências</Link>
      <div className="mt-3"><Cabecalho titulo="Nova sequência" subtitulo="Começa como rascunho: nada é enviado até o dono aprovar." /></div>
      {acesso.permissions.includes("equipe") ? <section className="card"><SequenciaEditor nome="" passos={[]} /></section> : <p className="card text-sm font-semibold text-danger">Só o dono cria sequências.</p>}
    </>
  );
}
