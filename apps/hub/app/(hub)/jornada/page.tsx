import Link from "next/link";
import {
  Buildings,
  ChartLineUp,
  Compass,
  Crown,
  Diamond,
  Fire,
  Flag,
  Infinity as InfinityIcon,
  Lightning,
  Lock,
  MapTrifold,
  Medal,
  Mountains,
  Planet,
  Plant,
  RocketLaunch,
  ShieldStar,
  Star,
  TrendUp,
  Trophy,
} from "@phosphor-icons/react/dist/ssr";
import { JORNADA_REDES, JORNADA_REDES_LISTA, type HubJornada, type JornadaMarco, type JornadaRedeAtual } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { hubFetch } from "@/lib/api";
import { salvarJornada, salvarSeguidoresJornada } from "@/lib/actions";
import { me } from "@/lib/crm";
import { brl, brlCurto } from "@/lib/format";

export const metadata = { title: "Jornada" };

// Um ícone por nível (mesma ordem de JORNADA_MARCOS).
const ICONES = [Flag, Plant, TrendUp, RocketLaunch, Lightning, ChartLineUp, Compass, Buildings, Medal, MapTrifold, Fire, ShieldStar, Mountains, Star, Diamond, Crown, Planet, Trophy, InfinityIcon];

const int = (n: number) => n.toLocaleString("pt-BR");
const dec = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const campo = (n: number) => String(n).replace(".", ",");
const diaMes = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

// Crescimento contra 30 dias atrás (só com histórico guardado).
function Crescimento({ rede }: { rede: JornadaRedeAtual }) {
  if (rede.variacao30d === null) return <span className="text-muted">—</span>;
  const v = rede.variacao30d;
  const cor = v > 0 ? "text-green" : v < 0 ? "text-danger" : "text-muted";
  const pct = rede.variacao30dPct === null ? "" : ` (${v > 0 ? "+" : ""}${dec(rede.variacao30dPct)}%)`;
  return <span className={`font-semibold ${cor}`}>{`${v > 0 ? "+" : ""}${int(v)}${pct}`}</span>;
}

// De onde veio o número de hoje: leitura automática ou digitado pelo dono.
function Origem({ rede }: { rede: JornadaRedeAtual }) {
  if (rede.valor === null || !rede.atualizadoEm) return null;
  const texto = rede.origem === "manual" ? `digitado em ${diaMes(rede.atualizadoEm)}` : rede.aoVivo ? "automático" : `automático · atualizado em ${diaMes(rede.atualizadoEm)}`;
  return <span className="block whitespace-nowrap text-[11px] text-muted">{texto}</span>;
}

export default async function Jornada({ searchParams }: { searchParams: { aba?: string } }) {
  const [access, j] = await Promise.all([me(), hubFetch<HubJornada>("/hub/jornada")]);
  const aba: "receita" | "clientes" = searchParams.aba === "clientes" ? "clientes" : "receita";
  const marcos = aba === "receita" ? j.receita : j.clientes;
  const proximo = marcos.find((m) => m.status === "proximo");
  const conquistados = marcos.filter((m) => m.status === "conquistado");
  const podeEditar = access.permissions.includes("equipe");
  const p = j.premissas;
  const alvoTexto = (m: JornadaMarco) => (aba === "receita" ? `${brl(m.alvo)}/mês` : `${int(m.alvo)} ${m.alvo === 1 ? "cliente" : "clientes"}`);
  const faltaTexto = (m: JornadaMarco) => (aba === "receita" ? `faltam ${brl(m.falta)} por mês` : `faltam ${int(m.falta ?? 0)} ${m.falta === 1 ? "cliente" : "clientes"}`);

  return (
    <>
      <Cabecalho titulo="Jornada" subtitulo="Marcos de crescimento: quanto falta para o próximo nível e quanto a empresa vale em cada um." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi valor={brl(j.atual.receitaMensal)} rotulo="Receita mensal atual" detalhe={`${brl(j.atual.assinaturas)} assinaturas + ${brl(j.atual.planosAnuncio30d)} planos (30 dias)`} />
        <Kpi valor={int(j.atual.clientes)} rotulo="Clientes pagantes" detalhe={`${int(j.atual.empresas)} ${j.atual.empresas === 1 ? "empresa" : "empresas"} + ${int(j.atual.particulares)} ${j.atual.particulares === 1 ? "particular" : "particulares"}`} />
        <Kpi valor={j.atual.ticketMedio === null ? "—" : brl(j.atual.ticketMedio)} rotulo="Ticket médio real" detalhe="receita ÷ clientes pagantes" />
        <Kpi valor={brlCurto(j.atual.valuation)} rotulo="Valuation atual" detalhe={`estimativa: receita × 12 × ${dec(p.multiploValuation)}`} tom="green" />
        <Kpi valor={proximo ? proximo.nome : "Tudo conquistado"} rotulo="Próximo marco" detalhe={proximo ? `${alvoTexto(proximo)} · ${faltaTexto(proximo)}` : undefined} tom="orange" />
      </div>
      <p className="mt-3 text-xs text-muted">
        Clientes pagantes = empresas com assinatura paga ativa + particulares que pagaram plano de anúncio nos últimos 30 dias. Receita = mensalidades dessas assinaturas + planos de anúncio pagos nos últimos 30 dias.
      </p>

      <nav className="mt-6 flex gap-2" aria-label="Leitura dos marcos">
        {(
          [
            ["receita", "Receita mensal"],
            ["clientes", "Clientes"],
          ] as const
        ).map(([id, rotulo]) => (
          <Link key={id} href={id === "receita" ? "/jornada" : "/jornada?aba=clientes"} aria-current={aba === id ? "page" : undefined} className={aba === id ? "btn-primary" : "btn"}>
            {rotulo}
          </Link>
        ))}
      </nav>
      <p className="mt-2 text-sm text-muted">
        {aba === "receita"
          ? `Cada marco é uma receita por mês. Clientes = receita ÷ ticket médio de ${brl(p.ticketMedio)} (arredondado para cima). Ex.: ${brl(10_000)} ÷ ${brl(p.ticketMedio)} = ${int(j.receita.find((m) => m.alvo === 10_000)?.clientes ?? 0)} clientes.`
          : `Cada marco é um número de clientes pagantes. Receita mensal = clientes × ticket médio de ${brl(p.ticketMedio)}.`}{" "}
        Valuation = receita mensal × 12 × {dec(p.multiploValuation)} (estimativa).
      </p>

      {proximo ? (
        <Secao titulo={`Próximo marco: ${proximo.nome}`} className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <b className="text-navy">{alvoTexto(proximo)}</b>
            <span className="text-muted">{faltaTexto(proximo)}</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={proximo.progressoPct ?? 0} aria-label={`Progresso até ${proximo.nome}`}>
            <div className="h-3 rounded-full bg-orange" style={{ width: `${proximo.progressoPct ?? 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{proximo.progressoPct ?? 0}% do caminho</p>
        </Secao>
      ) : null}

      <Secao titulo={`Conquistas (${conquistados.length} de ${marcos.length})`} className="mt-6">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
          {marcos.map((m) => {
            const Icone = ICONES[m.nivel - 1] ?? Trophy;
            const ganho = m.status === "conquistado";
            return (
              <li key={m.alvo} className={`flex flex-col items-center rounded-xl border p-3 text-center ${ganho ? "border-green/40 bg-green/10" : m.status === "proximo" ? "border-orange/50 bg-orange/10" : "border-line opacity-60"}`}>
                {ganho || m.status === "proximo" ? <Icone size={28} weight={ganho ? "fill" : "regular"} className={ganho ? "text-green" : "text-orange"} aria-hidden /> : <Lock size={28} className="text-muted" aria-hidden />}
                <span className="mt-1 text-xs font-semibold text-navy">{m.nome}</span>
                <span className="text-xs text-muted">{aba === "receita" ? brlCurto(m.alvo) : int(m.alvo)}</span>
                <span className="sr-only">{ganho ? "conquistado" : m.status === "proximo" ? "próximo" : "futuro"}</span>
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao titulo={aba === "receita" ? "Marcos de receita mensal" : "Marcos de clientes"} className="mt-6">
        {/* Tabela larga rola dentro do próprio quadro (com teclado também), nunca a página. */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={aba === "receita" ? "Marcos de receita mensal" : "Marcos de clientes"}>
          <table className="tabela min-w-[960px]">
            <thead>
              <tr>
                <th>Nível</th>
                <th className="text-right">{aba === "receita" ? "Receita mensal" : "Clientes"}</th>
                <th className="text-right">{aba === "receita" ? "Clientes necessários" : "Receita mensal"}</th>
                <th className="text-right">Receita anual</th>
                <th className="text-right">Valuation (estimativa)</th>
                <th>Seguidores (meta)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {marcos.map((m) => (
                <tr key={m.alvo} className={m.status === "proximo" ? "bg-orange/5" : undefined}>
                  <td className="font-semibold text-navy">
                    {m.nivel}. {m.nome}
                  </td>
                  <td className="text-right font-semibold">{aba === "receita" ? brl(m.alvo) : int(m.alvo)}</td>
                  <td className="text-right">{aba === "receita" ? int(m.clientes) : brl(m.receitaMensal)}</td>
                  <td className="text-right">{brl(m.receitaAnual)}</td>
                  <td className="text-right">{brlCurto(m.valuation)}</td>
                  <td className="text-xs text-muted">{JORNADA_REDES_LISTA.map((r) => `${JORNADA_REDES[r]} ${int(m.seguidores[r])}`).join(" · ")}</td>
                  <td>
                    {m.status === "conquistado" ? (
                      <span className="pill whitespace-nowrap bg-green/15 text-green">Conquistado ✓</span>
                    ) : m.status === "proximo" ? (
                      <span className="pill whitespace-nowrap bg-orange/15 text-danger">Próximo · {m.progressoPct}%</span>
                    ) : (
                      <span className="pill bg-line text-muted">Futuro</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Redes sociais" className={podeEditar ? "xl:col-span-2" : undefined}>
          <p className="mb-3 text-xs text-muted">Meta de seguidores = clientes do marco × seguidores por cliente (estimativa).</p>
          {/* relative: o rótulo escondido (sr-only, absolute) dos campos fica preso
              ao quadro que rola; sem isso ele escapa e a página rola de lado no celular. */}
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Seguidores por rede">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Rede</th>
                  <th className="text-right">Por cliente</th>
                  <th className="text-right">Meta no próximo marco</th>
                  <th className="text-right">Hoje</th>
                  <th className="text-right">% da meta</th>
                  <th className="text-right">30 dias</th>
                  {podeEditar ? <th className="text-right">Digitar número</th> : null}
                </tr>
              </thead>
              <tbody>
                {JORNADA_REDES_LISTA.map((r) => (
                  <tr key={r}>
                    <td className="font-semibold">{JORNADA_REDES[r]}</td>
                    <td className="text-right">{dec(p.seguidoresPorCliente[r])}</td>
                    <td className="text-right">{proximo ? int(proximo.seguidores[r]) : "—"}</td>
                    <td className="text-right">
                      {j.atual.redes[r].valor === null ? "—" : int(j.atual.redes[r].valor!)}
                      <Origem rede={j.atual.redes[r]} />
                    </td>
                    <td className="text-right">{proximo?.progressoSeguidores?.[r] == null ? "—" : `${proximo.progressoSeguidores[r]}%`}</td>
                    <td className="text-right">
                      <Crescimento rede={j.atual.redes[r]} />
                    </td>
                    {podeEditar ? (
                      <td className="text-right">
                        <Form action={salvarSeguidoresJornada} botao="Salvar" className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <input type="hidden" name="rede" value={r} />
                          <label className="sr-only" htmlFor={`seg-${r}`}>Seguidores no {JORNADA_REDES[r]} hoje</label>
                          <input id={`seg-${r}`} name="valor" inputMode="numeric" pattern="[0-9.]*" maxLength={13} required placeholder="nº hoje" className="input w-28" />
                        </Form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {JORNADA_REDES_LISTA.filter((r) => j.atual.redes[r].aviso).map((r) => (
            <p key={r} role="alert" className="mt-2 rounded-lg border border-orange/50 bg-orange/10 p-2 text-xs text-danger">
              {JORNADA_REDES[r]}: {j.atual.redes[r].aviso}
            </p>
          ))}
          {JORNADA_REDES_LISTA.some((r) => !j.atual.redes[r].fonteAutomatica) ? (
            <p className="mt-2 text-xs text-muted">
              {JORNADA_REDES_LISTA.filter((r) => !j.atual.redes[r].fonteAutomatica).map((r) => JORNADA_REDES[r]).join(", ")}: sem leitura automática.{" "}
              {podeEditar ? "Digite o número aqui (atualize toda semana)." : "O dono digita o número aqui (toda semana)."}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Leitura automática a cada 6 horas (Facebook e Instagram pela Meta, YouTube pelo Google). Quando ela funciona, passa por cima do número digitado. &quot;30 dias&quot; compara com o número guardado há 30 dias (aparece quando houver esse histórico).
          </p>
        </Secao>

        <Secao titulo="Premissas">
          <p className="mb-3 text-xs text-muted">{j.premissasPadrao ? "Valores padrão (estimativas). " : ""}São estimativas: mude quando tiver números melhores.</p>
          {podeEditar ? (
            <>
              <Form action={salvarJornada} botao="Salvar premissas" manter>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="ticketMedio">Ticket médio (R$, estimativa)</label>
                    <input id="ticketMedio" name="ticketMedio" inputMode="decimal" required defaultValue={campo(p.ticketMedio)} className="input" />
                    <p className="mt-1 text-xs text-muted">Real hoje: {j.atual.ticketMedio === null ? "— (sem clientes)" : brl(j.atual.ticketMedio)}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="multiploValuation">Múltiplo do valuation (estimativa)</label>
                    <input id="multiploValuation" name="multiploValuation" inputMode="decimal" required defaultValue={campo(p.multiploValuation)} className="input" />
                    <p className="mt-1 text-xs text-muted">Vezes a receita anual.</p>
                  </div>
                </div>
                <p className="label mt-2">Seguidores por cliente (estimativa)</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {JORNADA_REDES_LISTA.map((r) => (
                    <div key={r}>
                      <label className="text-xs font-semibold text-navy" htmlFor={r}>{JORNADA_REDES[r]}</label>
                      <input id={r} name={r} inputMode="decimal" required defaultValue={campo(p.seguidoresPorCliente[r])} className="input" />
                    </div>
                  ))}
                </div>
              </Form>
              {j.atual.ticketMedio !== null && j.atual.ticketMedio >= 1 && j.atual.ticketMedio !== p.ticketMedio ? (
                <div className="mt-4 border-t border-line pt-4">
                  <Form action={salvarJornada} botao={`Usar o ticket real (${brl(j.atual.ticketMedio)})`} manter>
                    <input type="hidden" name="ticketMedio" value={campo(j.atual.ticketMedio)} />
                    <input type="hidden" name="multiploValuation" value={campo(p.multiploValuation)} />
                    {JORNADA_REDES_LISTA.map((r) => (
                      <input key={r} type="hidden" name={r} value={campo(p.seguidoresPorCliente[r])} />
                    ))}
                  </Form>
                </div>
              ) : null}
            </>
          ) : (
            <ul className="space-y-1 text-sm">
              <li>Ticket médio: <b>{brl(p.ticketMedio)}</b> (real hoje: {j.atual.ticketMedio === null ? "—" : brl(j.atual.ticketMedio)})</li>
              <li>Múltiplo do valuation: <b>{dec(p.multiploValuation)}×</b></li>
              <li>Seguidores por cliente: {JORNADA_REDES_LISTA.map((r) => `${JORNADA_REDES[r]} ${dec(p.seguidoresPorCliente[r])}`).join(" · ")}</li>
              <li className="text-xs text-muted">Só o dono muda as premissas.</li>
            </ul>
          )}
        </Secao>
      </div>
    </>
  );
}
