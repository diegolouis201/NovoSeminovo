import Link from "next/link";
import { notFound } from "next/navigation";
import { CAIXAS_EMAIL, VENDEDOR_SEGMENTOS } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { Cabecalho, Secao } from "@/components/ui";
import { aplicarArrumacao } from "@/lib/actions";
import { me } from "@/lib/crm";
import { previaArrumacao } from "@/lib/vendedores";

export const metadata = { title: "Arrumar sequências" };

const caixa = (c?: string) => (c ? (CAIXAS_EMAIL[c as keyof typeof CAIXAS_EMAIL]?.endereco ?? c) : "nenhuma");
const segs = (l: string[]) => (l.length ? l.map((x) => VENDEDOR_SEGMENTOS[x as keyof typeof VENDEDOR_SEGMENTOS] ?? x).join(", ") : "todos os tipos");

// Arrumação das sequências do marketing (só o dono): prévia com os números
// de antes e depois; aplicar não envia nada e pode ser repetido.
export default async function Arrumacao() {
  const acesso = await me();
  if (!acesso.permissions.includes("equipe")) notFound();
  const p = await previaArrumacao();
  const nomes = Object.keys(p.inscritasAntes);
  return (
    <>
      <Link href="/vendedores" className="text-sm font-semibold text-muted hover:text-blue">← Vendedores IA</Link>
      <div className="mt-3">
        <Cabecalho titulo="Arrumar sequências" subtitulo="Caio fica com as lojas de veículos (atendimento@); Nina com as imobiliárias e os corretores (contato@). Esta página só mostra a prévia: nada muda até você aplicar, e nenhum e-mail é enviado." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Empresas inscritas (ativas)">
          <div tabIndex={0} role="region" aria-labelledby="inscritas-legenda" className="overflow-x-auto">
            <table className="tabela min-w-[480px]">
              <caption id="inscritas-legenda" className="sr-only">Empresas inscritas por sequência, antes e depois</caption>
              <thead><tr><th scope="col">Sequência</th><th scope="col">Antes</th><th scope="col">Depois</th><th scope="col">Remetente</th></tr></thead>
              <tbody>
                {nomes.map((n) => {
                  const r = p.remetentes.find((x) => x.sequencia === n);
                  return (
                    <tr key={n}>
                      <th scope="row" className="font-semibold text-navy">{n}{r && !r.existe ? " (não existe)" : ""}</th>
                      <td>{p.inscritasAntes[n]}</td>
                      <td>{p.inscritasDepois[n]}</td>
                      <td>{r ? `${r.vendedorAntes ?? "sem vendedor"} → ${r.vendedorDepois}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            <li><strong>{p.movidasParaNina}</strong> imobiliária(s)/corretor(es) saem de “Caio: lojas de veículos” e vão para “Nina: imobiliárias e corretores”.</li>
            <li><strong>{p.tiradasPorLojasBh}</strong> empresa(s) saem de “Caio: lojas de veículos” porque já estão em “Lojas BH” (ficam só lá).</li>
            <li><strong>{p.cardsTrocados}</strong> empresa(s) trocam de vendedor no CRM.</li>
          </ul>
        </Secao>
        <Secao titulo="Vendedores">
          <ul className="space-y-2 text-sm">
            {p.vendedores.map((v) => (
              <li key={v.nome}>
                <strong>{v.nome}</strong>: atende {segs(v.segmentosAntes)} → <strong>{segs(v.segmentosDepois)}</strong>; caixa {caixa(v.caixaAntes)} → <strong>{caixa(v.caixaDepois)}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Nenhuma sequência é aprovada nem ativada aqui, e nenhum texto muda. O Caio continua inativo até você ativar na página dele.</p>
        </Secao>
      </div>

      <Secao titulo={`Conflitos para você decidir (${p.conflitos.length})`} className="mt-6">
        {p.conflitos.length ? (
          <ul className="divide-y divide-line text-sm">
            {p.conflitos.slice(0, 200).map((c, i) => (
              <li key={i} className="py-2"><strong>{c.empresa}</strong>: {c.motivo}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum conflito.</p>
        )}
      </Secao>

      <Secao titulo="Aplicar" className="mt-6">
        <Form action={aplicarArrumacao} botao="Aplicar a arrumação" manter>
          <span className="flex items-start gap-2 text-sm">
            <input id="confirmo" name="confirmo" type="checkbox" value="1" required className="mt-1 accent-blue" />
            <label htmlFor="confirmo">Conferi a prévia. Aplicar não envia e-mail; rodar de novo não muda mais nada.</label>
          </span>
        </Form>
      </Secao>
    </>
  );
}
