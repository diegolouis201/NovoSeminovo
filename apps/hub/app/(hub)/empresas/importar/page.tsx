import Link from "next/link";
import { ImportarEmpresas } from "@/components/ImportarEmpresas";
import { Cabecalho } from "@/components/ui";
import { me } from "@/lib/crm";

export const metadata = { title: "Importar empresas" };

// Empresas do Mailerfind (busca do Google Maps) entram no CRM como "A abordar".
// Dono e Comercial (crm.editar): os mesmos que cadastram empresas no funil.
export default async function ImportarEmpresasPagina() {
  const acesso = await me();
  const pode = acesso.permissions.includes("crm.editar");
  return (
    <>
      <Link href="/empresas" className="text-sm font-semibold text-muted hover:text-blue">← Empresas</Link>
      <div className="mt-3">
        <Cabecalho titulo="Importar empresas" subtitulo="Lista do Mailerfind (Google Maps) → cards “A abordar” no CRM. A mesma empresa nunca entra duas vezes." />
      </div>
      {pode ? <ImportarEmpresas /> : <p className="card text-sm font-semibold text-danger">Seu perfil não tem permissão para importar empresas. Peça ao dono do Hub.</p>}
    </>
  );
}
