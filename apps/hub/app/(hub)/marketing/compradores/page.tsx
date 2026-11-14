import { redirect } from "next/navigation";
import { ACQUISITION_SOURCES, HUB_BUYER_LEAD_TYPES, type HubBuyerLeads } from "@novoseminovo/shared-types";
import { Cabecalho, Kpi, Secao, Vazio } from "@/components/ui";
import { HubApiError, hubFetch } from "@/lib/api";
import { me } from "@/lib/crm";
import { dataHora } from "@/lib/format";

export const metadata = { title: "Leads de compradores" };
const SITE = "https://novoseminovo.com.br";
const CAMPOS = ["de", "ate", "canal", "campanha", "tipo"] as const;

// Quem quer comprar e chegou pelo site: contato de anúncio, pedido de
// financiamento e inscrição de novidades, com a origem (canal, campanha,
// anúncio). Marketing vê números e origem; contato só para quem vê o CRM.
export default async function Compradores({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const access = await me();
  if (!access.permissions.includes("marketing") && !access.permissions.includes("crm.ver")) redirect("/");
  const qs = new URLSearchParams();
  for (const campo of CAMPOS) {
    const v = searchParams[campo]?.trim();
    if (v) qs.set(campo, v.slice(0, 100));
  }
  let r: HubBuyerLeads | null = null;
  let erro: string | null = null;
  try {
    r = await hubFetch<HubBuyerLeads>(`/hub/compradores${qs.toString() ? `?${qs.toString()}` : ""}`);
  } catch (e) {
    if (!(e instanceof HubApiError)) throw e;
    erro = e.message;
  }

  return (
    <>
      <Cabecalho
        titulo="Leads de compradores"
        subtitulo="Contatos de anúncio, pedidos de financiamento e inscrições de novidades que chegaram pelo site, com a campanha e o anúncio de origem."
      />
      <form className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <div>
          <label className="label" htmlFor="de">De</label>
          <input id="de" name="de" type="date" defaultValue={r?.de ?? searchParams.de} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ate">Até</label>
          <input id="ate" name="ate" type="date" defaultValue={r?.ate ?? searchParams.ate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="canal">Canal</label>
          <select id="canal" name="canal" defaultValue={searchParams.canal ?? ""} className="input">
            <option value="">Todos</option>
            {Object.entries(ACQUISITION_SOURCES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="campanha">Campanha</label>
          <input id="campanha" name="campanha" maxLength={100} defaultValue={searchParams.campanha ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={searchParams.tipo ?? ""} className="input">
            <option value="">Todos</option>
            {Object.entries(HUB_BUYER_LEAD_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button className="btn">Filtrar</button>
      </form>

      {erro ? <p className="mb-4 rounded-xl bg-orange/10 p-3 text-sm">{erro}</p> : null}
      {r ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi valor={r.totais.total} rotulo="Leads no período" />
            {Object.entries(HUB_BUYER_LEAD_TYPES).map(([k, v]) => (
              <Kpi key={k} valor={r!.totais.porTipo[k as keyof typeof HUB_BUYER_LEAD_TYPES]} rotulo={v} />
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Secao titulo="Por canal">
              {r.totais.porCanal.length ? (
                <ul className="space-y-1 text-sm">
                  {r.totais.porCanal.map((c) => (
                    <li key={c.canal} className="flex justify-between gap-2"><span>{c.rotulo}</span><b>{c.total}</b></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nenhum lead no período.</p>}
            </Secao>
            <Secao titulo="Por campanha">
              {r.totais.porCampanha.length ? (
                <ul className="space-y-1 text-sm">
                  {r.totais.porCampanha.map((c) => (
                    <li key={c.campanha} className="flex justify-between gap-2"><span>{c.campanha}</span><b>{c.total}</b></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nenhum lead com campanha (utm_campaign) no período.</p>}
            </Secao>
          </div>
          <Secao titulo="Leads" className="mt-6">
            {!r.contatosVisiveis ? <p className="mb-3 text-xs text-muted">Seu perfil vê origem e números; telefone e e-mail ficam com o Comercial.</p> : null}
            {r.itens.length ? (
              <div className="overflow-x-auto">
                <table className="tabela min-w-[860px]">
                  <thead><tr><th>Data</th><th>Tipo</th><th>Nome</th>{r.contatosVisiveis ? <th>Contato</th> : null}<th>Anúncio</th><th>Origem</th></tr></thead>
                  <tbody>
                    {r.itens.map((i) => (
                      <tr key={i.id}>
                        <td className="whitespace-nowrap text-xs">{dataHora(i.criadoEm)}</td>
                        <td className="text-xs">{HUB_BUYER_LEAD_TYPES[i.tipo]}</td>
                        <td>{i.nome ?? "—"}</td>
                        {r!.contatosVisiveis ? <td className="text-xs">{[i.telefone, i.email].filter(Boolean).join(" · ") || "—"}</td> : null}
                        <td className="text-xs">{i.anuncio ? <a className="link" href={`${SITE}/anuncio/${encodeURIComponent(i.anuncio.id)}`} target="_blank" rel="noopener noreferrer">{i.anuncio.titulo}</a> : "—"}</td>
                        <td className="text-xs">{[i.origem.canalRotulo ?? "Sem origem registrada", i.origem.campanha && `campanha ${i.origem.campanha}`, i.origem.anuncio && `anúncio ${i.origem.anuncio}`].filter(Boolean).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.totais.total > r.itens.length ? <p className="mt-2 text-xs text-muted">Mostrando os {r.itens.length} mais recentes de {r.totais.total}.</p> : null}
              </div>
            ) : (
              <Vazio titulo="Nenhum lead no período" texto="Mude as datas ou tire os filtros." />
            )}
          </Secao>
        </>
      ) : null}
    </>
  );
}
