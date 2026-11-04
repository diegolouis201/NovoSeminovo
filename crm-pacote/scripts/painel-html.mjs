// Monta relatorios/painel.html: todas as telas do CRM numa página só, que
// abre no navegador do computador sem internet. Todo texto que vem do site
// passa por esc(); o único script da página é o das abas e dos filtros.
import { agenda, esc, visaoGeral } from "./painel-dados.mjs";
import { brl } from "./receitas-relatorio.mjs";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const int = (n) => Number(n ?? 0).toLocaleString("pt-BR");
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);
const dataBr = (text) => (text ? `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}` : "—");
const CANAIS = { google_ads: "Google Ads", meta_ads: "Meta Ads", facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp", email: "E-mail", indicacao: "Indicação" };
const canal = (c) => CANAIS[c] ?? String(c).replace(/_/g, " ");
const SEGMENTO = { vehicle: "Veículos", property: "Imóveis" };
const TIPO_INTERACAO = { note: "Anotação", stage: "Etapa", ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail", reuniao: "Reunião", dor: "Dor", objecao: "Objeção", preferencia: "Preferência" };

const tile = (label, value, hint) => `<div class="tile"><p class="muted small">${esc(label)}</p><p class="big">${esc(value)}</p>${hint ? `<p class="muted small">${esc(hint)}</p>` : ""}</div>`;
const card = (title, note, body, extra = "") => `<section class="card ${extra}"><h2>${esc(title)}</h2>${note ? `<p class="muted small">${esc(note)}</p>` : ""}${body}</section>`;

function hbars(rows, vazio = "Ainda sem dados.") {
  if (!rows.length) return `<p class="muted">${esc(vazio)}</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<ul class="hbars">${rows
    .map(
      (r) =>
        `<li title="${esc(`${r.name}: ${r.display ?? int(r.value)}`)}"><span class="${r.dim ? "muted" : ""}">${esc(r.name)}</span><span class="track"><span class="fill ${r.dim ? "dim" : "c1"}" style="width:${r.value ? Math.max(2, (r.value / max) * 100) : 0}%"></span></span><strong>${esc(r.display ?? int(r.value))}</strong></li>`,
    )
    .join("")}</ul>`;
}

// Colunas por mês (até 2 séries empilhadas), com a tabela logo abaixo.
function colunas(meses, series, fmt, cor) {
  const totais = meses.map((m) => m.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totais);
  const legenda = series.length > 1 ? `<ul class="legend">${series.map((s, i) => `<li><span class="sw c${i + 1}"></span>${esc(s)}</li>`).join("")}</ul>` : "";
  const cols = meses
    .map((m, i) => {
      const tip = `${mesCurto(m.mes)}: ${series.length > 1 ? series.map((s, j) => `${s} ${fmt(m.values[j])}`).join(" · ") + " · total " : ""}${fmt(totais[i])}`;
      const segs = totais[i]
        ? m.values
            .map((v, j) => (v > 0 ? `<span class="seg ${cor ?? `c${series.length > 1 ? j + 1 : 1}`}" style="height:${Math.max(2, (v / max) * 100)}%"></span>` : ""))
            .reverse()
            .join("")
        : `<span class="zero"></span>`;
      return `<div class="col" title="${esc(tip)}">${segs}</div>`;
    })
    .join("");
  const eixo = meses.map((m) => `<span>${esc(mesCurto(m.mes).slice(0, 3))}</span>`).join("");
  const tabela = `<details class="small"><summary>Ver tabela</summary><table><thead><tr><th>Mês</th>${series.length > 1 ? series.map((s) => `<th class="num">${esc(s)}</th>`).join("") : ""}<th class="num">Total</th></tr></thead><tbody>${meses
    .map((m, i) => `<tr><td>${esc(mesCurto(m.mes))}</td>${series.length > 1 ? m.values.map((v) => `<td class="num">${esc(fmt(v))}</td>`).join("") : ""}<td class="num"><strong>${esc(fmt(totais[i]))}</strong></td></tr>`)
    .join("")}</tbody></table></details>`;
  return `${legenda}<div class="cols" role="img">${cols}</div><div class="axis">${eixo}</div>${tabela}`;
}

function telaVisaoGeral(feed, receitas, hoje) {
  const recortes = [
    ["all", "Geral"],
    ["vehicle", "Veículos"],
    ["property", "Imóveis"],
  ];
  return recortes
    .map(([recorte, nome], idx) => {
      const v = visaoGeral(feed, hoje, recorte);
      const n = v.numeros;
      const pipeline = v.funil.filter((f) => !["perdida", "cancelou"].includes(f.etapa));
      const total = pipeline.reduce((s, f) => s + f.quantidade, 0);
      const npsBody = n.nps.respostas
        ? `<p class="hero">${esc(n.nps.score)}<span class="muted small"> de −100 a 100 · ${int(n.nps.respostas)} resposta(s)</span></p><div class="stack">${[
            ["bad", n.nps.detratores],
            ["mid", n.nps.neutros],
            ["good", n.nps.promotores],
          ]
            .filter(([, q]) => q)
            .map(([c, q]) => `<span class="${c}" style="width:${pct(q, n.nps.respostas)}%"></span>`)
            .join("")}</div><ul class="legend"><li><span class="sw bad"></span>Detratores (0–6): ${int(n.nps.detratores)}</li><li><span class="sw mid"></span>Neutros (7–8): ${int(n.nps.neutros)}</li><li><span class="sw good"></span>Promotores (9–10): ${int(n.nps.promotores)}</li></ul>`
        : `<p class="muted">Nenhuma resposta nos últimos 90 dias.</p>`;
      const receita =
        recorte === "all" && receitas
          ? card("Faturamento por mês (planos)", "Mensalidades + planos de anúncio, sem estornos.", colunas(receitas.planos.porMes.map((m) => ({ mes: m.mes, values: [m.total] })), ["Planos"], brl))
          : "";
      return `<div class="recorte" data-recorte="${recorte}" ${idx ? "hidden" : ""}>
        <div class="tiles">${tile("Mensalidades (MRR)", brl(n.mrr), n.ticketMedio !== undefined ? `ticket médio ${brl(n.ticketMedio)}` : "")}${tile("Assinantes", int(n.assinantes), `de ${int(n.empresas)} empresas cadastradas`)}${tile("Novas assinaturas no mês", int(n.novasAssinaturasMes))}${tile("Cancelamentos no mês", int(n.cancelamentosMes))}${tile("NPS (90 dias)", n.nps.score ?? "—", `${int(n.nps.respostas)} resposta(s)`)}${tile("Chamados abertos", int(n.chamadosAbertos), n.tempoMedioResolucaoHoras !== undefined ? `resolução média ${n.tempoMedioResolucaoHoras} h` : "")}${tile("Assinantes em risco", int(n.emRisco), "sem entrar no painel há 30+ dias")}${tile("Em prospecção", int(n.prospeccao), `recorte: ${nome}`)}</div>
        <div class="grid2">
          ${card("Funil de empresas", `${int(total)} empresa(s) no funil.`, hbars([...pipeline.map((f) => ({ name: f.nome, value: f.quantidade, display: `${int(f.quantidade)} · ${pct(f.quantidade, total)}%` })), ...v.funil.filter((f) => ["perdida", "cancelou"].includes(f.etapa)).map((f) => ({ name: f.nome, value: f.quantidade, dim: true }))]))}
          ${receita || card("Satisfação (NPS)", "% de promotores menos % de detratores, 90 dias.", npsBody)}
          ${receita ? card("Satisfação (NPS)", "% de promotores menos % de detratores, 90 dias.", npsBody) : ""}
          ${card("Motivos de perda e cancelamento", "Por categoria.", hbars(v.motivos.map((m) => ({ name: m.categoria, value: m.quantidade })), "Nenhuma perda com motivo registrado."))}
          ${card("Origem dos cadastros", "Campanha ou link de onde a empresa veio.", hbars(v.origem.map((o) => ({ name: canal(o.canal), value: o.quantidade }))))}
          ${card("Desempenho por vendedor", "Carteira atual.", `<table><thead><tr><th>Vendedor</th><th class="num">Cards</th><th class="num">Cadastradas</th><th class="num">Assinantes</th><th class="num">MRR</th></tr></thead><tbody>${v.vendedores.map((s) => `<tr><td>${esc(s.nome)}</td><td class="num">${int(s.cards)}</td><td class="num">${int(s.cadastradas)}</td><td class="num">${int(s.assinantes)}</td><td class="num"><strong>${esc(brl(s.mrr))}</strong></td></tr>`).join("")}</tbody></table>`)}
        </div>
        ${card("Precisa de atenção", "Clique no nome para abrir a ficha.", v.atencao.length ? `<ul class="list">${v.atencao.map((a) => `<li><span class="badge ${a.nivel === "urgente" ? "bad-soft" : ""}">${a.nivel === "urgente" ? "Urgente" : "Acompanhar"}</span> <a href="#empresa-${esc(a.empresaId)}" data-open="${esc(a.empresaId)}">${esc(a.empresa)}</a> <span class="muted">${esc(a.motivo)}</span></li>`).join("")}</ul>` : `<p class="muted">Nada pendente agora.</p>`)}
      </div>`;
    })
    .join("");
}

function telaReceitas(r) {
  if (!r) return `<p class="muted">Ainda sem receitas baixadas. Rode <code>node scripts/sincronizar.mjs</code>.</p>`;
  const { consolidado: c, planos: p, financiamentos: f, afiliados: a } = r;
  const pr = a.programa;
  const so = `<p class="pill">Só visualização · não entra no faturamento</p>`;
  return `<div class="tiles">${tile("Faturamento do mês", brl(c.esteMes), "mês em andamento (só planos)")}${tile("Mês passado", brl(c.mesPassado))}${tile("Faturamento 12 meses", brl(c.total12m))}${tile("Mensalidades (MRR)", brl(p.mrr), `${int(p.assinantes)} assinante(s)`)}</div>
  ${card("Faturamento: receita de planos", "Mensalidades de lojas e imobiliárias + planos de anúncio de pessoa física, sem estornos.", `<p class="small">Estornos em 12 meses: <strong>${esc(brl(p.estornos12m))}</strong></p>${colunas(p.porMes.map((m) => ({ mes: m.mes, values: [m.assinaturas, m.anuncios] })), ["Assinaturas", "Planos de anúncio"], brl)}`)}
  <div class="grid2">
    ${card("Financiamentos", "Comissão do banco menos o cashback de quem contratou.", `${so}<dl class="dl"><div><dt>Negócios (12 meses)</dt><dd>${int(f.negocios12m)}</dd></div><div><dt>Valor financiado</dt><dd>${esc(brl(f.valorFinanciado12m))}</dd></div><div><dt>Líquido (12 meses)</dt><dd>${esc(brl(f.liquido12m))}</dd></div><div><dt>Comissão a receber</dt><dd>${esc(brl(f.comissaoAReceber))}</dd></div><div><dt>Cashback a pagar</dt><dd>${esc(brl(f.cashbackAPagar))}</dd></div><div><dt>Pedidos em andamento</dt><dd>${int(f.leadsAbertos)}</dd></div></dl>${colunas(f.porMes.map((m) => ({ mes: m.mes, values: [Math.max(0, m.liquido)] })), ["Líquido"], brl, "dim")}`)}
    ${card("Lojas parceiras (links de afiliado)", "Comissão de Amazon, Mercado Livre e outras lojas (lançada por mês no admin).", `${so}<p class="small">12 meses: <strong>${esc(brl(a.lojas.total12m))}</strong> · cliques (30 dias): <strong>${int(a.lojas.cliques30d)}</strong></p>${hbars(a.lojas.porLoja.map((l) => ({ name: l.loja, value: l.valor12m, display: brl(l.valor12m) })), "Nenhuma comissão de loja lançada.")}`)}
    ${card("Programa de afiliados", "Quem indica o NovoSeminovo: o que os indicados pagaram e as comissões (custo).", `${so}<dl class="dl"><div><dt>Afiliados ativos</dt><dd>${int(pr.ativos)}${pr.pendentes ? ` <span class="muted small">· ${int(pr.pendentes)} aguardando</span>` : ""}</dd></div><div><dt>Indicados</dt><dd>${int(pr.indicados)}</dd></div><div><dt>Cliques (30 dias)</dt><dd>${int(pr.cliques30d)}</dd></div><div><dt>Receita gerada (12 meses)</dt><dd>${esc(brl(pr.receitaGerada12m))}</dd></div></dl>${hbars([
      { name: "A confirmar (garantia)", value: pr.comissoes.aConfirmar, display: brl(pr.comissoes.aConfirmar) },
      { name: "Liberada para pagar", value: pr.comissoes.disponivel, display: brl(pr.comissoes.disponivel) },
      { name: "Paga", value: pr.comissoes.paga, display: brl(pr.comissoes.paga) },
      { name: "Cancelada (estorno)", value: pr.comissoes.cancelada, display: brl(pr.comissoes.cancelada), dim: true },
    ])}${pr.ranking.length ? `<table><thead><tr><th>Afiliado</th><th class="num">Indicados</th><th class="num">Receita gerada</th><th class="num">Comissão</th></tr></thead><tbody>${pr.ranking.map((x) => `<tr><td>${esc(x.nome)} <span class="muted small">(${esc(x.codigo)})</span></td><td class="num">${int(x.indicados)}</td><td class="num">${esc(brl(x.receitaGerada))}</td><td class="num"><strong>${esc(brl(x.comissao))}</strong></td></tr>`).join("")}</tbody></table>` : ""}`)}
    ${card("Para o Diego decidir", "Envolve dinheiro: nada aqui vira ordem automática.", `<ul class="list"><li>Comissões de afiliados liberadas para pagar: <strong>${esc(brl(pr.comissoes.disponivel))}</strong></li><li>Cashback de financiamento a pagar: <strong>${esc(brl(f.cashbackAPagar))}</strong></li><li>Comissão de financiamento a receber do banco: <strong>${esc(brl(f.comissaoAReceber))}</strong></li></ul>`)}
  </div>`;
}

function ficha(e, marcacao, eventos) {
  const linha = (rotulo, valor) => (valor === undefined || valor === null || valor === "" ? "" : `<div><dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd></div>`);
  const tags = [marcacao?.importante ? "⭐ importante" : "", marcacao?.naoContatar ? "não contatar" : "", ...(marcacao?.tags ?? [])].filter(Boolean);
  return `<div class="ficha">
    <div class="grid3">
      <div><h3>Cadastro</h3><dl class="dl1">${linha("Razão social", e.nome)}${linha("CNPJ", e.cnpj)}${linha("Tipo", e.tipo)}${linha("Setor", e.setor)}${linha("Porte", e.porte)}${linha("Capital social", e.capitalSocial !== undefined ? brl(e.capitalSocial) : undefined)}${linha("Aberta em", e.abertaEm ? dataBr(e.abertaEm) : undefined)}${linha("Cidade", [e.cidade, e.uf].filter(Boolean).join(" - "))}${linha("Funcionários", e.perfil?.funcionarios)}${linha("Faturamento", e.perfil?.faturamento)}${linha("Origem", e.origemMarketing ? [canal(e.origemMarketing.canal), e.origemMarketing.campanha].filter(Boolean).join(" · ") : e.origem)}</dl></div>
      <div><h3>Contato e sócios</h3><dl class="dl1">${linha("Responsável", [e.responsavel?.nome, e.responsavel?.cargo].filter(Boolean).join(" · "))}${linha("E-mail", e.responsavel?.email)}${linha("Telefone", e.responsavel?.telefone)}${linha("Vendedor", e.vendedor ?? "sem dono")}${linha("Instagram", e.redesSociais?.instagram ? `@${e.redesSociais.instagram}` : undefined)}${linha("Facebook", e.redesSociais?.facebook)}${linha("Divulgação nas redes", e.autorizaDivulgacaoEm ? `autorizada em ${dataBr(e.autorizaDivulgacaoEm)}` : "não autorizada")}</dl>${(e.socios ?? []).length ? `<ul class="list small">${e.socios.map((s) => `<li>${esc(s.nome)}${s.cargo ? ` <span class="muted">${esc(s.cargo)}</span>` : ""}${s.aniversario ? ` · 🎂 ${esc(s.aniversario)}` : ""}</li>`).join("")}</ul>` : `<p class="muted small">Sócios ainda não carregados.</p>`}${tags.length ? `<p class="small">${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join(" ")}</p>` : ""}${marcacao?.nota ? `<p class="small">Nota: ${esc(marcacao.nota)}</p>` : ""}</div>
      <div><h3>Plano e uso</h3><dl class="dl1">${linha("Etapa", e.etapa?.nome)}${linha("Plano", e.plano ? `${e.plano.nome} (${e.plano.status}) · ${brl(e.plano.valorMensal)}/mês` : "sem plano")}${linha("Período grátis até", e.plano ? undefined : dataBr(e.periodoGratisAte))}${linha("Pago até hoje", `${brl(e.pagamentos?.totalPago ?? 0)} em ${int(e.pagamentos?.quantidade)} pagamento(s)`)}${linha("Anúncios no ar", `${int(e.anuncios?.noAr)} de ${int(e.anuncios?.total)}`)}${linha("Visualizações", int(e.uso?.visualizacoes))}${linha("Leads", `${int(e.leads?.total)} (${int(e.leads?.ultimos30Dias)} em 30 dias, ${int(e.leads?.paradosMais3Dias)} parados)`)}${linha("Último acesso", e.uso?.ultimoAcesso ? `${dataBr(e.uso.ultimoAcesso)} (${int(e.uso.diasSemAcesso)} dias)` : undefined)}${linha("NPS", e.nps ? `${e.nps.nota} (${e.nps.classificacao}) em ${dataBr(e.nps.data)}${e.nps.comentario ? ` — "${e.nps.comentario}"` : ""}` : undefined)}${linha("Chamados", `${int(e.chamados?.total)} (${int(e.chamados?.abertos)} aberto(s))${e.chamados?.tempoMedioResolucaoHoras !== undefined ? ` · resolução média ${e.chamados.tempoMedioResolucaoHoras} h` : ""}`)}${linha("Motivo de perda", e.motivoPerda ? [e.motivoPerda.categoria, e.motivoPerda.texto].filter(Boolean).join(": ") : undefined)}</dl></div>
    </div>
    <div class="grid2">
      <div><h3>Últimas interações</h3>${(e.ultimasAnotacoes ?? []).length ? `<ul class="list small">${e.ultimasAnotacoes.map((n) => `<li><span class="muted">${esc(dataBr(n.data))} · ${esc(TIPO_INTERACAO[n.tipo] ?? n.tipo)}${n.autor ? ` · ${esc(n.autor)}` : ""}</span><br>${esc(n.texto)}</li>`).join("")}</ul>` : `<p class="muted small">Nenhuma interação registrada.</p>`}</div>
      <div><h3>Jornada</h3>${eventos.length ? `<ul class="list small">${eventos.map((ev) => `<li><span class="muted">${esc(dataBr(ev.data))}</span> ${esc(ev.evento)}</li>`).join("")}</ul>` : `<p class="muted small">Sem mudanças registradas ainda.</p>`}</div>
    </div>
  </div>`;
}

function telaEmpresas(feed, marcacoes, jornada) {
  const porEmpresa = new Map();
  for (const ev of jornada) {
    if (!porEmpresa.has(ev.empresaId)) porEmpresa.set(ev.empresaId, []);
    porEmpresa.get(ev.empresaId).push(ev);
  }
  const etapas = [...new Set((feed.empresas ?? []).map((e) => e.etapa?.nome).filter(Boolean))];
  const filtros = `<div class="filters"><input type="search" id="busca" placeholder="Buscar por nome, cidade, CNPJ ou sócio" aria-label="Buscar empresa"><select id="f-seg" aria-label="Segmento"><option value="">Todos os segmentos</option><option value="vehicle">Veículos</option><option value="property">Imóveis</option></select><select id="f-etapa" aria-label="Etapa"><option value="">Todas as etapas</option>${etapas.map((n) => `<option>${esc(n)}</option>`).join("")}</select><label class="small"><input type="checkbox" id="f-imp"> Só importantes</label></div>`;
  const linhas = (feed.empresas ?? [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((e) => {
      const m = marcacoes[e.id] ?? {};
      const busca = [e.nome, e.cidade, e.cnpj, ...(e.socios ?? []).map((s) => s.nome)].join(" ").toLowerCase();
      return `<details class="empresa" id="empresa-${esc(e.id)}" data-busca="${esc(busca)}" data-seg="${esc(e.segmento ?? "")}" data-etapa="${esc(e.etapa?.nome ?? "")}" data-imp="${m.importante ? "1" : ""}"><summary><span><strong>${m.importante ? "⭐ " : ""}${esc(e.nome)}</strong> <span class="muted small">${esc([e.cidade, e.uf].filter(Boolean).join(" - "))} · ${esc(SEGMENTO[e.segmento] ?? e.tipo)}</span></span><span class="small"><span class="badge">${esc(e.etapa?.nome)}</span> ${e.plano ? esc(`${brl(e.plano.valorMensal)}/mês`) : ""}</span></summary>${ficha(e, m, (porEmpresa.get(e.id) ?? []).slice(-15).reverse())}</details>`;
    })
    .join("");
  return `${filtros}<p class="muted small" id="contagem"></p><div id="empresas">${linhas || `<p class="muted">Nenhuma empresa ainda.</p>`}</div>`;
}

function telaProspeccao(feed) {
  const cols = ["a_abordar", "em_contato", "interessada", "proposta", "perdida"];
  const nomes = { a_abordar: "A abordar", em_contato: "Em contato", interessada: "Interessada", proposta: "Proposta enviada", perdida: "Perdida" };
  const pros = feed.prospeccao ?? [];
  return `<p class="muted small">Empresas que ainda não se cadastraram. A equipe move os cards em /comercial no site; aqui é só visualização.</p><div class="kanban">${cols
    .map((c) => {
      const cards = pros.filter((p) => p.etapa?.id === c);
      return `<div class="kcol"><h3>${esc(nomes[c])} <span class="muted">(${cards.length})</span></h3>${cards
        .map(
          (p) =>
            `<div class="kcard"><strong>${esc(p.nome)}</strong><p class="muted small">${esc([p.cidade, p.uf].filter(Boolean).join(" - "))} · ${esc(SEGMENTO[p.segmento] ?? p.segmento)}</p>${p.contato ? `<p class="small">${esc(p.contato)}${p.cargo ? ` · ${esc(p.cargo)}` : ""}</p>` : ""}<p class="small">Dono: ${esc(p.vendedor ?? "sem dono")}</p>${p.proximoContato ? `<p class="small">Próximo contato: ${esc(dataBr(p.proximoContato))}${p.proximoContatoTipo ? ` (${esc(TIPO_INTERACAO[p.proximoContatoTipo] ?? p.proximoContatoTipo)})` : ""}</p>` : ""}${p.motivoPerda ? `<p class="small muted">Motivo: ${esc([p.motivoPerda.categoria, p.motivoPerda.texto].filter(Boolean).join(": "))}</p>` : ""}</div>`,
        )
        .join("")}</div>`;
    })
    .join("")}</div>`;
}

function telaAvisos(avisos) {
  if (!avisos.length) return `<p class="muted">Sem avisos. Rode <code>node scripts/avisos.mjs</code> depois de sincronizar.</p>`;
  const grupos = [
    ["urgente", "Urgente"],
    ["oportunidade", "Oportunidades"],
    ["acompanhar", "Acompanhar"],
  ];
  return grupos
    .map(([nivel, titulo]) => {
      const itens = avisos.filter((a) => a.nivel === nivel);
      return card(`${titulo} (${itens.length})`, "", itens.length ? `<ul class="list">${itens.map((a) => `<li>${a.importante ? "⭐ " : ""}${esc(a.texto)}${a.ordem ? `<br><span class="muted small">Ordem sugerida (${esc(a.ordem.area)}): ${esc(a.ordem.titulo)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Nada.</p>`);
    })
    .join("");
}

function telaOrdens(ordens) {
  if (!ordens.length) return `<p class="muted">Nenhuma ordem enviada ainda.</p>`;
  const linhas = ordens
    .slice()
    .sort((a, b) => String(b.criadaEm ?? b.createdAt ?? "").localeCompare(String(a.criadaEm ?? a.createdAt ?? "")))
    .map((o) => `<tr><td><span class="badge ${o.status === "aberta" ? "bad-soft" : ""}">${esc(o.status)}</span></td><td>${esc(o.area)}</td><td>${esc(o.titulo ?? o.title)}${o.empresa ? ` <span class="muted small">· ${esc(o.empresa)}</span>` : ""}${o.resultado ?? o.result ? `<br><span class="muted small">${esc(o.resultado ?? o.result)}</span>` : ""}</td><td>${esc(dataBr(o.criadaEm ?? o.createdAt))}</td><td>${esc(o.prazo ?? o.dueAt ? dataBr(o.prazo ?? o.dueAt) : "—")}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Situação</th><th>Área</th><th>Ordem</th><th>Criada</th><th>Prazo</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function telaAgenda(feed, marcacoes, calendario, hoje) {
  const itens = agenda(feed, marcacoes, calendario, hoje, 60);
  if (!itens.length) return `<p class="muted">Nada nos próximos 60 dias.</p>`;
  return `<p class="muted small">Próximos 60 dias.</p><table><thead><tr><th>Data</th><th>O quê</th><th>Detalhe</th></tr></thead><tbody>${itens.map((i) => `<tr><td>${esc(dataBr(i.data))}</td><td>${esc(i.tipo)}</td><td>${i.empresaId ? `<a href="#empresa-${esc(i.empresaId)}" data-open="${esc(i.empresaId)}">${esc(i.texto)}</a>` : esc(i.texto)}</td></tr>`).join("")}</tbody></table>`;
}

const CSS = `:root{color-scheme:light;--page:#f7f7f3;--raised:#fff;--sober:#eef2f4;--ink:#20261b;--muted:#5c6455;--border:#dfe3da;--blue:#006aa4;--c1:#006aa4;--c2:#f18e29;--good:#5a9e1a;--bad:#c42b3a;--mid:#9aa294}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#14170f;--raised:#1e2317;--sober:#101922;--ink:#edefe6;--muted:#aeb6a2;--border:#343b2c;--blue:#5aa9e0;--c1:#3987e5;--c2:#d95926;--good:#6fb52a;--bad:#e66767;--mid:#6b7362}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{padding:20px 16px 0;max-width:1200px;margin:0 auto}h1{margin:0;font-size:24px}h2{margin:0 0 4px;font-size:17px}h3{margin:0 0 6px;font-size:14px}
nav.tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-top:14px}nav.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:8px 10px;font:inherit;font-weight:600;color:var(--muted);cursor:pointer}nav.tabs button[aria-selected=true]{color:var(--blue);border-color:var(--blue)}
main{max-width:1200px;margin:0 auto;padding:16px;display:block}section.tab,.recorte{display:flex;flex-direction:column;gap:14px}.recorte[hidden]{display:none}.card p,.card h2{margin:0}section.tab[hidden]{display:none}
.muted{color:var(--muted)}.small{font-size:13px}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.tile,.card{background:var(--raised);border:1px solid var(--border);border-radius:16px;padding:14px}.tile p{margin:0}.big{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}.hero{font-size:34px;font-weight:700;margin:4px 0}
.card{display:flex;flex-direction:column;gap:8px;min-width:0;overflow-x:auto}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.hbars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.hbars li{display:grid;grid-template-columns:minmax(6rem,10rem) 1fr auto;gap:10px;align-items:center;font-size:14px}.hbars strong{text-align:right;font-variant-numeric:tabular-nums}.track{height:12px;background:var(--sober);border-radius:0 4px 4px 0}.fill{display:block;height:12px;border-radius:0 4px 4px 0}.fill.c1{background:var(--c1)}.fill.dim{background:var(--mid)}
.cols{display:flex;align-items:flex-end;gap:2px;height:150px}.col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:2px}.col:hover{opacity:.8}.seg{display:block}.seg:first-child{border-radius:4px 4px 0 0}.seg.c1{background:var(--c1)}.seg.dim{background:var(--mid)}.seg.c2{background:var(--c2)}.zero{display:block;height:2px;background:var(--sober)}.axis{display:flex;gap:2px;font-size:10px;color:var(--muted)}.axis span{flex:1;text-align:center}
.legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted)}.legend li{display:flex;align-items:center;gap:6px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px}.sw.c1{background:var(--c1)}.sw.c2{background:var(--c2)}.sw.good,.stack .good{background:var(--good)}.sw.bad,.stack .bad{background:var(--bad)}.sw.mid,.stack .mid{background:var(--mid)}
.stack{display:flex;gap:2px;height:12px;border-radius:4px;overflow:hidden}.stack span{display:block}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:400;color:var(--muted);font-size:12px;padding:4px 8px 4px 0}td{border-top:1px solid var(--border);padding:6px 8px 6px 0;vertical-align:top}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.list strong,.hbars strong,.dl dd{white-space:nowrap}
.list{list-style:none;margin:0;padding:0}.list li{padding:6px 0;border-top:1px solid var(--border)}.list li:first-child{border-top:0}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--sober);font-size:12px;font-weight:600}.badge.bad-soft{color:var(--bad)}.pill{display:inline-block;margin:0;padding:3px 10px;border-radius:999px;background:var(--sober);font-size:12px;font-weight:600;width:fit-content}
.dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:0}.dl dt,.dl1 dt{font-size:12px;color:var(--muted)}.dl dd,.dl1 dd{margin:0;font-weight:600}.dl1{margin:0;display:flex;flex-direction:column;gap:4px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.filters input[type=search],.filters select{font:inherit;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--raised);color:var(--ink)}.filters input[type=search]{flex:1;min-width:220px}
details.empresa{background:var(--raised);border:1px solid var(--border);border-radius:14px;margin-top:8px}details.empresa summary{cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.ficha{padding:0 14px 14px;display:flex;flex-direction:column;gap:14px}
.kanban{display:grid;grid-template-columns:repeat(5,minmax(200px,1fr));gap:10px;overflow-x:auto}.kcol{background:var(--sober);border-radius:14px;padding:10px}.kcard{background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px}.kcard p{margin:2px 0}
a{color:var(--blue)}code{background:var(--sober);padding:1px 5px;border-radius:6px}details summary{color:var(--blue)}details.empresa summary{color:var(--ink)}
.recorte-nav{display:flex;gap:4px;background:var(--sober);border-radius:999px;padding:4px;width:fit-content}.recorte-nav button{border:0;background:none;border-radius:999px;padding:6px 14px;font:inherit;font-weight:600;color:var(--ink);cursor:pointer}.recorte-nav button[aria-pressed=true]{background:var(--c1);color:#fff}
@media (max-width:640px){.hbars li{grid-template-columns:6rem 1fr 5rem}.grid2,.grid3{grid-template-columns:1fr}}`;

const JS = `(()=>{const tabs=[...document.querySelectorAll("nav.tabs button")];const show=(id)=>{tabs.forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===id)));document.querySelectorAll("section.tab").forEach(s=>s.hidden=s.id!==id);};tabs.forEach(b=>b.addEventListener("click",()=>{show(b.dataset.tab);history.replaceState(null,"","#"+b.dataset.tab);}));
document.querySelectorAll(".recorte-nav button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".recorte-nav button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));document.querySelectorAll(".recorte").forEach(r=>r.hidden=r.dataset.recorte!==b.dataset.recorte);}));
document.addEventListener("click",(ev)=>{const a=ev.target.closest("[data-open]");if(!a)return;ev.preventDefault();show("empresas");const d=document.getElementById("empresa-"+a.dataset.open);if(d){d.open=true;d.scrollIntoView({behavior:"smooth",block:"start"});}});
const busca=document.getElementById("busca"),seg=document.getElementById("f-seg"),et=document.getElementById("f-etapa"),imp=document.getElementById("f-imp"),cont=document.getElementById("contagem");const filtrar=()=>{const q=(busca.value||"").toLowerCase().trim();let n=0;document.querySelectorAll("details.empresa").forEach(d=>{const ok=(!q||d.dataset.busca.includes(q))&&(!seg.value||d.dataset.seg===seg.value)&&(!et.value||d.dataset.etapa===et.value)&&(!imp.checked||d.dataset.imp==="1");d.hidden=!ok;if(ok)n++;});cont.textContent=n+" empresa(s)";};[busca,seg,et,imp].forEach(x=>x&&x.addEventListener("input",filtrar));if(busca)filtrar();
const doHash=()=>{const h=location.hash.slice(1);if(tabs.some(b=>b.dataset.tab===h))show(h);};window.addEventListener("hashchange",doHash);const inicial=location.hash.slice(1);show(tabs.some(b=>b.dataset.tab===inicial)?inicial:"visao");})();`;

export function renderPainel({ feed, receitas, ordens = [], avisos = [], marcacoes = {}, jornada = [], calendario = [], hoje = new Date() }) {
  const abas = [
    ["visao", "Visão geral", `<div class="recorte-nav" role="group" aria-label="Recorte"><button aria-pressed="true" data-recorte="all">Geral</button><button aria-pressed="false" data-recorte="vehicle">Veículos</button><button aria-pressed="false" data-recorte="property">Imóveis</button></div>${telaVisaoGeral(feed, receitas, hoje)}`],
    ["receitas", "Receitas", telaReceitas(receitas)],
    ["empresas", "Empresas", telaEmpresas(feed, marcacoes, jornada)],
    ["prospeccao", "Prospecção", telaProspeccao(feed)],
    ["avisos", "Avisos", telaAvisos(avisos)],
    ["ordens", "Ordens", telaOrdens(ordens)],
    ["agenda", "Agenda", telaAgenda(feed, marcacoes, calendario, hoje)],
  ];
  const geradoEm = new Date(feed.geradoEm ?? hoje).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><title>CRM NovoSeminovo</title><style>${CSS}</style></head>
<body><header><h1>CRM NovoSeminovo</h1><p class="muted small">Dados do site baixados em ${esc(geradoEm)}. Para atualizar, rode <code>node scripts/sincronizar.mjs</code> e abra esta página de novo. Arquivo com dados de clientes: não enviar a ninguém.</p>
<nav class="tabs" role="tablist">${abas.map(([id, nome]) => `<button role="tab" data-tab="${id}" aria-selected="false">${esc(nome)}</button>`).join("")}</nav></header>
<main>${abas.map(([id, nome, corpo]) => `<section class="tab" id="${id}" aria-label="${esc(nome)}" hidden>${corpo}</section>`).join("")}</main>
<script>${JS}</script></body></html>`;
}
