import Link from "next/link";
import type { HubSeo, SeoVariacao } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { SeoTabela, type SeoColuna } from "@/components/SeoTabela";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { atualizarSeo } from "@/lib/actions";
import { hubFetch } from "@/lib/api";
import { exigirMarketing } from "@/lib/mkt";
import { data, dataHora } from "@/lib/format";

export const metadata = { title: "SEO" };

const PERIODOS = [7, 28, 90] as const;
const int = (n: number) => n.toLocaleString("pt-BR");
const dec = (n: number, casas = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (n: number) => `${dec(n * 100, 2)}%`;
const sinal = (n: number, texto: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${texto}`;

// Variação contra o período anterior. Posição: número menor é melhor.
function Variacao({ v, tipo }: { v: SeoVariacao; tipo: "int" | "pct" | "pos" }) {
  if (v.anterior === 0 && v.atual === 0) return <span>sem dados no período anterior</span>;
  const melhor = tipo === "pos" ? v.variacao < 0 : v.variacao > 0;
  const cor = v.variacao === 0 ? "text-muted" : melhor ? "text-green" : "text-danger";
  const abs = Math.abs(v.variacao);
  const texto =
    tipo === "int"
      ? sinal(v.variacao, int(abs)) + (v.variacaoPct === null ? "" : ` (${sinal(v.variacaoPct, `${dec(Math.abs(v.variacaoPct))}%`)})`)
      : tipo === "pct"
        ? sinal(v.variacao, `${dec(abs * 100, 2)} p.p.`)
        : sinal(v.variacao, dec(abs));
  return (
    <span>
      <b className={cor}>{texto}</b> vs. período anterior{tipo === "pos" && v.variacao !== 0 ? (melhor ? " (subiu)" : " (caiu)") : ""}
    </span>
  );
}

// Barras por dia (mesmo estilo dos gráficos do financeiro).
function Barras({ serie, campo, cor, rotulo }: { serie: HubSeo["serie"]; campo: "cliques" | "impressoes"; cor: string; rotulo: string }) {
  const max = Math.max(1, ...serie.map((d) => d[campo]));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-navy">{rotulo}</p>
      <div className="flex h-36 items-end gap-px" role="img" aria-label={`${rotulo}: ${serie.map((d) => `${data(d.dia)} ${d[campo]}`).join(", ")}`}>
        {serie.map((d) => (
          <div key={d.dia} className="flex h-full min-w-0 flex-1 items-end" title={`${data(d.dia)}: ${int(d[campo])}`}>
            <div className={`w-full rounded-t ${cor}`} style={{ height: `${Math.max(d[campo] > 0 ? 2 : 0, (d[campo] / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{data(serie[0]?.dia)}</span>
        <span>máx. {int(max)}</span>
        <span>{data(serie.at(-1)?.dia)}</span>
      </div>
    </div>
  );
}

const METRICAS: SeoColuna[] = [
  { id: "cliques", rotulo: "Cliques", tipo: "int" },
  { id: "impressoes", rotulo: "Impressões", tipo: "int" },
  { id: "ctr", rotulo: "CTR", tipo: "pct" },
  { id: "posicao", rotulo: "Posição", tipo: "pos" },
];

function NaoConfigurado({ falta }: { falta?: string }) {
  return (
    <Secao titulo="Search Console ainda não está ligado">
      {falta ? <p className="mb-3 rounded-xl bg-orange/10 p-3 text-sm">{falta}</p> : null}
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>No Google Cloud, ative a <b>Google Search Console API</b> no projeto e crie uma <b>conta de serviço</b>; baixe a chave em JSON.</li>
        <li>No Search Console, em Configurações → Usuários e permissões, adicione o e-mail da conta de serviço como usuário <b>Restrito</b> da propriedade novoseminovo.com.br.</li>
        <li>Envie o arquivo JSON para o servidor em <code>~/NovoSeminovo/secrets/gsc_service_account</code> e coloque <code>GSC_SITE=sc-domain:novoseminovo.com.br</code> no <code>.env</code>.</li>
        <li>Publique de novo a API. O passo a passo com os comandos está no DEPLOY.md, seção “Search Console no Hub”.</li>
      </ol>
    </Secao>
  );
}

export default async function Seo({ searchParams }: { searchParams: { dias?: string } }) {
  const access = await exigirMarketing();
  const dias = PERIODOS.find((p) => String(p) === searchParams.dias) ?? 28;
  const s = await hubFetch<HubSeo>(`/hub/seo?dias=${dias}`);
  const dono = access.permissions.includes("equipe");
  const r = s.regraOportunidade;

  return (
    <>
      <Cabecalho
        titulo="SEO"
        subtitulo={
          s.configurado && s.periodo
            ? `Buscas do Google (Search Console) de ${data(s.periodo.inicio)} a ${data(s.periodo.fim)}, comparadas com ${data(s.anterior?.inicio)} a ${data(s.anterior?.fim)}. O Google leva 2 a 3 dias para fechar os números, por isso o período termina 3 dias atrás.`
            : "Buscas do Google (Search Console): cliques, impressões, CTR e posição média."
        }
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex gap-2" aria-label="Período">
              {PERIODOS.map((p) => (
                <Link key={p} href={`/marketing/seo?dias=${p}`} aria-current={p === dias ? "page" : undefined} className={p === dias ? "btn-primary" : "btn"}>
                  {p} dias
                </Link>
              ))}
            </nav>
            {dono && s.configurado ? (
              <Form action={atualizarSeo} botao="Atualizar" manter className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="dias" value={dias} />
              </Form>
            ) : null}
          </div>
        }
      />

      {!s.configurado ? (
        <NaoConfigurado falta={s.falta} />
      ) : (
        <>
          {s.erro ? <p role="alert" className="mb-4 rounded-xl bg-orange/10 p-3 text-sm">Não foi possível ler o Search Console agora: {s.erro}.{s.atualizadoEm ? " Mostrando a última leitura." : ""}</p> : null}
          {s.totais ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi valor={int(s.totais.cliques.atual)} rotulo="Cliques" detalhe={<Variacao v={s.totais.cliques} tipo="int" />} />
              <Kpi valor={int(s.totais.impressoes.atual)} rotulo="Impressões" detalhe={<Variacao v={s.totais.impressoes} tipo="int" />} />
              <Kpi valor={pct(s.totais.ctr.atual)} rotulo="CTR (cliques ÷ impressões)" detalhe={<Variacao v={s.totais.ctr} tipo="pct" />} />
              <Kpi valor={dec(s.totais.posicao.atual)} rotulo="Posição média" detalhe={<Variacao v={s.totais.posicao} tipo="pos" />} tom="orange" />
            </div>
          ) : null}
          {s.atualizadoEm ? <p className="mt-2 text-xs text-muted">Lido do Google em {dataHora(s.atualizadoEm)} · propriedade {s.site} · os números ficam guardados por 6 horas.</p> : null}

          <Secao titulo="Por dia" className="mt-6">
            {s.serie.length ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <Barras serie={s.serie} campo="cliques" cor="bg-blue" rotulo="Cliques" />
                <Barras serie={s.serie} campo="impressoes" cor="bg-blue/40" rotulo="Impressões" />
              </div>
            ) : (
              <p className="text-sm text-muted">Sem dados no período.</p>
            )}
          </Secao>

          <Secao titulo="Oportunidades: quase na página 1" className="mt-6">
            <p className="mb-3 text-sm text-muted">
              Buscas em que o site aparece na posição média de {r.posicaoMin} a {r.posicaoMax} (fim da 1ª página ou 2ª página) com pelo menos {r.impressoesMin} impressões no período, da mais vista para a menos vista. Melhorar a página indicada (título, texto, links internos) pode trazê-la para o topo.
            </p>
            <SeoTabela
              testid="seo-oportunidades"
              colunas={[{ id: "consulta", rotulo: "Busca", tipo: "texto" }, { id: "pagina", rotulo: "Página", tipo: "pagina" }, ...METRICAS]}
              linhas={s.oportunidades}
              ordem="impressoes"
              vazio="Nenhuma busca nessa faixa no período."
            />
          </Secao>

          <div className="mt-6 grid gap-6 2xl:grid-cols-2">
            <Secao titulo="Principais buscas">
              <SeoTabela testid="seo-consultas" colunas={[{ id: "chave", rotulo: "Busca", tipo: "texto" }, ...METRICAS]} linhas={s.consultas} ordem="cliques" />
            </Secao>
            <Secao titulo="Principais páginas">
              <SeoTabela testid="seo-paginas" colunas={[{ id: "chave", rotulo: "Página", tipo: "pagina" }, ...METRICAS]} linhas={s.paginas} ordem="cliques" />
            </Secao>
          </div>

          <Secao titulo="Guias" className="mt-6">
            <p className="mb-3 text-sm text-muted">Páginas da seção de guias (endereços com /guia/).</p>
            <SeoTabela testid="seo-guias" colunas={[{ id: "chave", rotulo: "Guia", tipo: "pagina" }, ...METRICAS]} linhas={s.guias} ordem="cliques" vazio="Nenhum guia apareceu nas buscas no período." />
          </Secao>
        </>
      )}
    </>
  );
}
