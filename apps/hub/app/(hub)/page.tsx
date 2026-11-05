import Link from "next/link";
import { Cabecalho, Kpi, Nivel, Secao, Vazio } from "@/components/ui";
import { ListaTarefas } from "@/components/Tarefas";
import { calc, feed, hoje, marcacoes, me, meta, tarefas } from "@/lib/crm";
import { brlCurto, data, mesAtual } from "@/lib/format";

export const metadata = { title: "Início" };

export default async function Inicio() {
  const [access, f, m, abertas] = await Promise.all([me(), feed(), marcacoes(), tarefas()]);
  const h = hoje();
  const metaMes = await meta(mesAtual(h));
  const vg = calc.visaoGeral(f, h);
  const n = vg.numeros;
  const alertas = calc.buildAlerts(f, m, [], h);
  const urgentes = alertas.filter((a: { nivel: string }) => a.nivel === "urgente");
  const semPasso = calc.semProximoPasso(f, abertas, h, m);
  const regua = calc.regua(f, h, m);
  const fimHoje = `${h.toISOString().slice(0, 10)}T23:59:59-03:00`;
  const deHoje = abertas.filter((t) => t.dueAt <= new Date(fimHoje).toISOString());
  const ritmo = calc.ritmoMeta(metaMes, { assinaturas: n.novasAssinaturasMes, faturamento: 0 }, h);
  const pode = access.permissions.includes("crm.editar");
  const saudacao = (() => {
    const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  })();
  const diaHoje = h.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <>
      <Cabecalho
        titulo={`${saudacao}, ${access.name.split(" ")[0]}`}
        subtitulo={diaHoje}
        acao={
          pode ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/tarefas#nova" className="btn">+ Tarefa</Link>
              <Link href="/empresas" className="btn-primary">Registrar atividade</Link>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi valor={n.assinantes} rotulo="Assinantes" detalhe={`MRR ${brlCurto(n.mrr)}`} tom="green" href="/empresas?filtro=assinantes" />
        <Kpi valor={n.empresas} rotulo="Empresas cadastradas" href="/empresas" />
        <Kpi valor={n.prospeccao} rotulo="Em prospecção" href="/funil" />
        <Kpi valor={n.novasAssinaturasMes} rotulo="Novas assinaturas no mês" detalhe={ritmo ? `meta ${ritmo.assinaturas.meta} · ritmo ${ritmo.assinaturas.ritmoHoje.toLocaleString("pt-BR")}` : "sem meta"} tom={ritmo && ritmo.assinaturas.situacao === "abaixo" ? "orange" : "navy"} href="/vendas" />
        <Kpi valor={urgentes.length} rotulo="Avisos urgentes" tom={urgentes.length ? "danger" : "navy"} href="/avisos" />
        <Kpi valor={n.nps.score ?? "—"} rotulo="NPS (90 dias)" detalhe={`${n.nps.respostas} respostas`} href="/nps" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Minhas tarefas de hoje" acao={<Link className="link text-sm" href="/tarefas">Ver agenda</Link>}>
          <ListaTarefas itens={deHoje} podeEditar={pode} vazio="Nada pendente para hoje. Tarefas vencidas e de hoje aparecem aqui." />
        </Secao>

        <Secao titulo="Avisos urgentes" acao={<Link className="link text-sm" href="/avisos">Todos os avisos</Link>}>
          {urgentes.length ? (
            <ul className="space-y-3">
              {urgentes.slice(0, 6).map((a: { texto: string; nivel: string; cardId?: string; empresaId?: string }, i: number) => (
                <li key={i} className="flex gap-2 text-sm">
                  <Nivel nivel={a.nivel} />
                  <Link className="hover:text-blue" href={`/empresas/${a.cardId ?? a.empresaId}`}>{a.texto}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhum aviso urgente" />
          )}
        </Secao>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Sem próximo passo" acao={<span className="text-sm text-muted">{semPasso.length} em negociação</span>}>
          <p className="-mt-2 mb-3 text-sm text-muted">Empresas em negociação sem contato marcado e sem tarefa. Agende o próximo passo para não perder o momento.</p>
          {semPasso.length ? (
            <ul className="divide-y divide-line">
              {semPasso.slice(0, 8).map((s: { cardId: string; nome: string; etapa?: { nome?: string }; diasSemContato?: number; vendedor?: string }) => (
                <li key={s.cardId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link className="link" href={`/empresas/${s.cardId}`}>{s.nome}</Link>
                    <p className="text-xs text-muted">
                      {s.etapa?.nome} · {s.diasSemContato === undefined ? "sem contato registrado" : `último contato há ${s.diasSemContato} dias`}
                      {s.vendedor ? ` · ${s.vendedor}` : ""}
                    </p>
                  </div>
                  {pode ? <Link className="btn shrink-0" href={`/empresas/${s.cardId}#agendar`}>Agendar</Link> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Tudo com próximo passo" />
          )}
        </Secao>

        <Secao titulo="Régua de relacionamento" acao={<Link className="link text-sm" href="/regua">Abrir régua</Link>}>
          {regua.filter((r: { situacao: string }) => r.situacao !== "em_dia").length ? (
            <ul className="divide-y divide-line">
              {regua
                .filter((r: { situacao: string }) => r.situacao !== "em_dia")
                .slice(0, 8)
                .map((r: { empresaId: string; cardId?: string; nome: string; dias: number; vence: string; situacao: string }) => (
                  <li key={r.empresaId} className="flex items-center justify-between gap-3 py-3">
                    <Link className="link" href={`/empresas/${r.cardId ?? r.empresaId}`}>{r.nome}</Link>
                    <span className={`text-sm font-semibold ${r.situacao === "atrasado" ? "text-danger" : "text-orange"}`}>
                      {r.dias < 0 ? `${-r.dias} ${r.dias === -1 ? "dia" : "dias"} de atraso` : r.dias === 0 ? "vence hoje" : `vence ${data(r.vence)}`}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <Vazio titulo="Todos os contatos em dia" />
          )}
        </Secao>
      </div>
    </>
  );
}
