// Monta relatorios/painel.html: todas as telas do CRM numa página só, que
// abre no navegador do computador sem internet. Todo texto que vem do site
// passa por esc(); o único script da página é o das abas e dos filtros.
import { agenda, esc, visaoGeral } from "./painel-dados.mjs";
import { brl } from "./receitas-relatorio.mjs";
import { LOGO_DATA_URI } from "./marca.mjs";
import { CAMPOS_MENSAGEM, MENSAGENS_INICIAIS, convidarIcs, horarioReuniao, linkAgenda, linkEmail, linkLigar, linkWhatsApp, preencherMensagem, telefoneBr } from "./painel-acoes.mjs";

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
    ${card("Financiamentos", "Comissão do banco pelos financiamentos fechados (fica toda com a empresa).", `${so}<dl class="dl"><div><dt>Negócios (12 meses)</dt><dd>${int(f.negocios12m)}</dd></div><div><dt>Valor financiado</dt><dd>${esc(brl(f.valorFinanciado12m))}</dd></div><div><dt>Comissão (12 meses)</dt><dd>${esc(brl(f.comissao12m))}</dd></div><div><dt>Comissão a receber</dt><dd>${esc(brl(f.comissaoAReceber))}</dd></div><div><dt>Pedidos em andamento</dt><dd>${int(f.leadsAbertos)}</dd></div></dl>${colunas(f.porMes.map((m) => ({ mes: m.mes, values: [Math.max(0, m.comissao)] })), ["Comissão"], brl, "dim")}`)}
    ${card("Lojas parceiras (links de afiliado)", "Comissão de Amazon, Mercado Livre e outras lojas (lançada por mês no admin).", `${so}<p class="small">12 meses: <strong>${esc(brl(a.lojas.total12m))}</strong> · cliques (30 dias): <strong>${int(a.lojas.cliques30d)}</strong></p>${hbars(a.lojas.porLoja.map((l) => ({ name: l.loja, value: l.valor12m, display: brl(l.valor12m) })), "Nenhuma comissão de loja lançada.")}`)}
    ${card("Programa de afiliados", "Quem indica o NovoSeminovo: o que os indicados pagaram e as comissões (custo).", `${so}<dl class="dl"><div><dt>Afiliados ativos</dt><dd>${int(pr.ativos)}${pr.pendentes ? ` <span class="muted small">· ${int(pr.pendentes)} aguardando</span>` : ""}</dd></div><div><dt>Indicados</dt><dd>${int(pr.indicados)}</dd></div><div><dt>Cliques (30 dias)</dt><dd>${int(pr.cliques30d)}</dd></div><div><dt>Receita gerada (12 meses)</dt><dd>${esc(brl(pr.receitaGerada12m))}</dd></div></dl>${hbars([
      { name: "A confirmar (garantia)", value: pr.comissoes.aConfirmar, display: brl(pr.comissoes.aConfirmar) },
      { name: "Liberada para pagar", value: pr.comissoes.disponivel, display: brl(pr.comissoes.disponivel) },
      { name: "Paga", value: pr.comissoes.paga, display: brl(pr.comissoes.paga) },
      { name: "Cancelada (estorno)", value: pr.comissoes.cancelada, display: brl(pr.comissoes.cancelada), dim: true },
    ])}${pr.ranking.length ? `<table><thead><tr><th>Afiliado</th><th class="num">Indicados</th><th class="num">Receita gerada</th><th class="num">Comissão</th></tr></thead><tbody>${pr.ranking.map((x) => `<tr><td>${esc(x.nome)} <span class="muted small">(${esc(x.codigo)})</span></td><td class="num">${int(x.indicados)}</td><td class="num">${esc(brl(x.receitaGerada))}</td><td class="num"><strong>${esc(brl(x.comissao))}</strong></td></tr>`).join("")}</tbody></table>` : ""}`)}
    ${card("Para o Diego decidir", "Envolve dinheiro: nada aqui vira ordem automática.", `<ul class="list"><li>Comissões de afiliados liberadas para pagar: <strong>${esc(brl(pr.comissoes.disponivel))}</strong></li><li>Comissão de financiamento a receber do banco: <strong>${esc(brl(f.comissaoAReceber))}</strong></li></ul>`)}
  </div>`;
}

// Botões de ação de uma empresa, card de prospecção ou pessoa física. Os dados
// vão em atributos data-* (sempre por esc()); a página monta os links na hora.
function acoes(alvo, { naoContatar = false, registrar = true } = {}) {
  const fone = telefoneBr(alvo.telefone);
  const bloqueio = naoContatar ? "Pediu para não ser contatado" : "";
  const btn = (acao, rotulo, motivo, classe = "") =>
    `<button type="button" class="acao ${classe}" data-acao="${acao}"${motivo ? ` disabled title="${esc(motivo)}"` : ""}>${esc(rotulo)}</button>`;
  const dados = Object.entries({
    tipo: alvo.tipo,
    id: alvo.id,
    nome: alvo.nome,
    responsavel: alvo.responsavel,
    telefone: alvo.telefone,
    email: alvo.email,
    cidade: alvo.cidade,
    card: alvo.card,
    pagina: alvo.pagina,
    fimgratis: alvo.fimgratis,
    leadsparados: alvo.leadsparados,
    segmento: alvo.segmento,
  })
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ");
  return `<div class="acoes" ${dados}>${btn("ligar", "Ligar", bloqueio || (!fone && "Sem telefone"))}${btn("whatsapp", "WhatsApp", bloqueio || (!fone && "Sem telefone"), "wa")}${btn("email", "E-mail", bloqueio || (!alvo.email && "Sem e-mail"))}${btn("reuniao", "Marcar reunião")}${registrar && alvo.card ? btn("registrar", "Registrar", "", "destaque") : ""}${alvo.pagina ? btn("site", "Ver no site") : ""}${naoContatar ? `<span class="small muted">Pediu para não ser contatado</span>` : ""}</div>`;
}

const alvoEmpresa = (e) => ({
  tipo: "empresa",
  id: e.id,
  nome: e.nome,
  responsavel: e.responsavel?.nome,
  telefone: e.responsavel?.telefone,
  email: e.responsavel?.email,
  cidade: e.cidade,
  card: e.cardId,
  pagina: e.pagina,
  fimgratis: !e.plano && e.periodoGratisAte ? dataBr(e.periodoGratisAte) : undefined,
  leadsparados: e.leads?.paradosMais3Dias,
  segmento: e.segmento,
});

function ficha(e, marcacao, eventos) {
  const linha = (rotulo, valor) => (valor === undefined || valor === null || valor === "" ? "" : `<div><dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd></div>`);
  const tags = [marcacao?.importante ? "⭐ importante" : "", marcacao?.naoContatar ? "não contatar" : "", ...(marcacao?.tags ?? [])].filter(Boolean);
  return `<div class="ficha">
    ${acoes(alvoEmpresa(e), { naoContatar: Boolean(marcacao?.naoContatar) })}
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

function telaProspeccao(feed, marcacoes = {}) {
  const cols = ["a_abordar", "em_contato", "interessada", "proposta", "perdida"];
  const nomes = { a_abordar: "A abordar", em_contato: "Em contato", interessada: "Interessada", proposta: "Proposta enviada", perdida: "Perdida" };
  const pros = feed.prospeccao ?? [];
  return `<p class="muted small">Empresas que ainda não se cadastraram. A equipe move os cards em /comercial no site; aqui é só visualização.</p><div class="kanban">${cols
    .map((c) => {
      const cards = pros.filter((p) => p.etapa?.id === c);
      return `<div class="kcol"><h3>${esc(nomes[c])} <span class="muted">(${cards.length})</span></h3>${cards
        .map(
          (p) =>
            `<div class="kcard"><strong>${esc(p.nome)}</strong><p class="muted small">${esc([p.cidade, p.uf].filter(Boolean).join(" - "))} · ${esc(SEGMENTO[p.segmento] ?? p.segmento)}</p>${p.contato ? `<p class="small">${esc(p.contato)}${p.cargo ? ` · ${esc(p.cargo)}` : ""}</p>` : ""}<p class="small">Dono: ${esc(p.vendedor ?? "sem dono")}</p>${p.proximoContato ? `<p class="small">Próximo contato: ${esc(dataBr(p.proximoContato))}${p.proximoContatoTipo ? ` (${esc(TIPO_INTERACAO[p.proximoContatoTipo] ?? p.proximoContatoTipo)})` : ""}</p>` : ""}${p.motivoPerda ? `<p class="small muted">Motivo: ${esc([p.motivoPerda.categoria, p.motivoPerda.texto].filter(Boolean).join(": "))}</p>` : ""}${acoes({ tipo: "prospeccao", id: p.cardId, nome: p.nome, responsavel: p.contato, telefone: p.telefone, email: p.email, cidade: p.cidade, card: p.cardId, segmento: p.segmento }, { naoContatar: Boolean(marcacoes[p.cardId]?.naoContatar) })}</div>`,
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

// ---------------- Pessoas físicas ----------------
function telaPF(feed, receitas, marcacoes) {
  const meses = receitas?.planos?.porMes ?? [];
  const total12 = meses.reduce((t, m) => t + (m.anuncios ?? 0), 0);
  const esteMes = meses.length ? meses[meses.length - 1].anuncios ?? 0 : 0;
  const receita = meses.length
    ? `<div class="tiles">${tile("Planos de anúncio: este mês", brl(esteMes), "mês em andamento (entra no faturamento)")}${tile("Planos de anúncio: 12 meses", brl(Math.round(total12 * 100) / 100))}</div>${card("Planos de anúncio de pessoa física por mês", "Já somados no faturamento (receita de planos).", colunas(meses.map((m) => ({ mes: m.mes, values: [m.anuncios ?? 0] })), ["Planos de anúncio"], brl))}`
    : `<p class="muted">Ainda sem receitas baixadas.</p>`;
  const pessoas = feed.pessoasFisicas;
  let lista;
  if (!Array.isArray(pessoas)) {
    lista = `<p class="muted small">A lista de pessoas físicas aparece aqui quando o site passar a enviar esses contatos para o CRM.</p>`;
  } else {
    const linhas = pessoas
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .map((pf) => {
        const busca = [pf.nome, pf.cidade, pf.email].join(" ").toLowerCase();
        return `<div class="pf" data-busca="${esc(busca)}" data-seg="${esc(pf.segmento ?? "")}"><div><strong>${esc(pf.nome)}</strong> <span class="muted small">${esc([pf.cidade, pf.uf].filter(Boolean).join(" - "))}${pf.segmento ? ` · ${esc(SEGMENTO[pf.segmento] ?? pf.segmento)}` : ""}</span></div>${acoes({ tipo: "pf", id: pf.id, nome: pf.nome, responsavel: pf.nome, telefone: pf.telefone, email: pf.email, cidade: pf.cidade, segmento: pf.segmento }, { naoContatar: Boolean(pf.naoContatar || marcacoes[pf.id]?.naoContatar), registrar: false })}</div>`;
      })
      .join("");
    lista = `<div class="filters"><input type="search" id="busca-pf" placeholder="Buscar por nome, cidade ou e-mail" aria-label="Buscar pessoa"><select id="f-seg-pf" aria-label="Segmento"><option value="">Carros e imóveis</option><option value="vehicle">Carros</option><option value="property">Imóveis</option></select></div><div id="lista-pf">${linhas || `<p class="muted">Nenhuma pessoa física ainda.</p>`}</div>`;
  }
  return `${receita}${card("Pessoas físicas", "Quem anuncia como pessoa física. Uma mensagem por vez, nada de envio em massa.", lista)}`;
}

// ---------------- Configurações (ficam no navegador deste computador) ----------------
function telaConfig() {
  const campo = (rotulo, html) => `<label class="campo"><span>${rotulo}</span>${html}</label>`;
  return `${card("Configurações", "Ficam salvas só neste navegador, neste computador. Nada vai para o site.", `<form id="form-config" class="grid-form">
      ${campo("Seu nome", `<input name="nome" maxlength="80">`)}
      ${campo("Seu cargo", `<input name="cargo" maxlength="80">`)}
      ${campo("Endereço do site", `<input name="site" maxlength="120">`)}
      ${campo("Caminho da tela comercial", `<input name="comercial" maxlength="60">`)}
      ${campo("Onde abrir o WhatsApp", `<select name="whatsapp"><option value="smb">Aplicativo WhatsApp Business</option><option value="app">Aplicativo WhatsApp</option><option value="web">WhatsApp Web</option><option value="wame">wa.me</option></select>`)}
      ${campo("Onde abrir o e-mail", `<select name="email"><option value="gmail">Gmail</option><option value="mailto">Programa de e-mail do computador (Outlook)</option></select>`)}
      ${campo("Conta Google (Gmail e Agenda)", `<input name="conta" maxlength="120">`)}
      ${campo("Agenda", `<select name="agenda"><option value="google">Google Agenda</option><option value="ics">Baixar convite (.ics)</option></select>`)}
      ${campo("Duração padrão da reunião (min)", `<input name="duracao" type="number" min="10" max="480" step="5">`)}
      ${campo("Local padrão da reunião", `<input name="local" maxlength="120">`)}
      ${campo("Tema", `<select name="tema"><option value="auto">Automático</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select>`)}
      <label class="campo check"><input type="checkbox" name="lembrete"> <span>Lembrar de registrar a conversa depois de ligar, mandar WhatsApp ou e-mail</span></label>
      <div><button type="submit" class="acao destaque">Salvar configurações</button> <span id="cfg-ok" class="small muted"></span></div>
    </form>`)}
  ${card("Mensagens prontas", "Aparecem como etiquetas ao clicar em WhatsApp ou E-mail. Campos: {responsavel} {empresa} {cidade} {seunome} {fimgratis} {leadsparados} {link}. Nada de preço nem desconto: preço é o de tabela.", `<ul id="lista-msgs" class="list"></ul>
    <form id="form-msg-edit" class="grid-form">
      <input type="hidden" name="indice">
      ${campo("Nome da etiqueta", `<input name="nome" maxlength="60" required>`)}
      ${campo("Canal", `<select name="canal"><option value="ambos">WhatsApp e e-mail</option><option value="whatsapp">Só WhatsApp</option><option value="email">Só e-mail</option></select>`)}
      ${campo("Público", `<select name="publico"><option value="todos">Todos</option><option value="vehicle">Lojas de veículos</option><option value="property">Imobiliárias e corretores</option></select>`)}
      ${campo("Assunto (e-mail)", `<input name="assunto" maxlength="150">`)}
      <label class="campo largo"><span>Texto</span><textarea name="texto" rows="4" maxlength="2000" required></textarea></label>
      <div><button type="submit" class="acao destaque">Salvar mensagem</button> <button type="button" class="acao" id="msg-nova">Nova mensagem</button> <button type="button" class="acao" id="msg-restaurar">Restaurar mensagens iniciais</button></div>
    </form>`)}`;
}

// Janelas (dialogs) das ações. Só estrutura: os dados entram pelo script.
const DIALOGOS = `
<dialog id="dlg-msg"><form method="dialog" id="form-msg">
  <h2 id="msg-titulo">Mensagem</h2>
  <p class="small muted" id="msg-para"></p>
  <div id="msg-tags" class="tags"></div>
  <label class="campo largo" id="msg-assunto-campo"><span>Assunto</span><input name="assunto" maxlength="200"></label>
  <label class="campo largo"><span>Texto</span><textarea name="texto" rows="7" maxlength="4000"></textarea></label>
  <p class="small aviso" id="msg-aviso"></p>
  <div class="botoes"><button value="cancelar" class="acao">Cancelar</button><button value="ok" class="acao destaque" id="msg-ok">Abrir</button></div>
</form></dialog>
<dialog id="dlg-reuniao"><form method="dialog" id="form-reuniao">
  <h2>Marcar reunião</h2>
  <label class="campo largo"><span>Assunto</span><input name="titulo" maxlength="200" required></label>
  <div class="grid-form"><label class="campo"><span>Data</span><input type="date" name="data" required></label><label class="campo"><span>Hora</span><input type="time" name="hora" required></label><label class="campo"><span>Duração (min)</span><input type="number" name="duracao" min="10" max="480" step="5"></label><label class="campo"><span>Local</span><input name="local" maxlength="200"></label></div>
  <label class="campo largo"><span>Pauta</span><textarea name="pauta" rows="3" maxlength="2000"></textarea></label>
  <div class="botoes"><button value="cancelar" class="acao">Cancelar</button><button value="ok" class="acao destaque">Abrir agenda</button></div>
</form></dialog>
<dialog id="dlg-registrar"><form method="dialog" id="form-registrar">
  <h2>Registrar conversa</h2>
  <p class="small muted">O texto é copiado e a ficha da empresa abre no site: é só colar e salvar.</p>
  <label class="campo largo"><span>Tipo</span><select name="tipo"><option value="Ligação">Ligação</option><option value="WhatsApp">WhatsApp</option><option value="E-mail">E-mail</option><option value="Reunião">Reunião</option><option value="Anotação">Anotação</option><option value="Dor">Dor</option><option value="Objeção">Objeção</option><option value="Preferência">Preferência</option></select></label>
  <label class="campo largo"><span>O que aconteceu</span><textarea name="texto" rows="4" maxlength="2000" required></textarea></label>
  <label class="campo largo"><span>Próximo passo</span><input name="proximo" maxlength="300"></label>
  <div class="botoes"><button value="cancelar" class="acao">Cancelar</button><button value="ok" class="acao destaque">Copiar e abrir a ficha</button></div>
</form></dialog>
<div id="lembrete" class="lembrete" hidden><span id="lembrete-texto"></span> <button type="button" class="acao destaque" id="lembrete-registrar">Registrar</button> <button type="button" class="acao" id="lembrete-fechar">Fechar</button></div>`;

const ESCURO = "--page:#0B1C2C;--raised:#12283B;--sober:#183349;--soft2:#1d3c55;--ink:#EAF2F8;--muted:#A9BCCB;--border:#25425A;--blue:#5AA9E0;--c1:#3987e5;--c2:#d95926;--good:#6fb52a;--bad:#e66767;--mid:#6b7d8c";
const CSS = `:root{color-scheme:light;--page:#FAF8F3;--raised:#FFFFFF;--sober:#E8F1F7;--soft2:#DCEDF7;--ink:#0E2F4A;--muted:#4F6475;--border:#D9E3EA;--blue:#006AA4;--c1:#006AA4;--c2:#F18E29;--orange:#F18E29;--green:#76B82A;--good:#5a9e1a;--bad:#c42b3a;--mid:#9aa294}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;${ESCURO}}}
:root[data-theme=dark]{color-scheme:dark;${ESCURO}}
*{box-sizing:border-box}[hidden]{display:none !important}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 "Nunito Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1,h2,h3,.big,.hero{font-family:Fredoka,"Nunito Sans",system-ui,sans-serif}
.topo{background:#FAF8F3;color:#0E2F4A;border-bottom:4px solid #F18E29}.topo-in{max-width:1200px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.topo img{height:56px;width:auto;display:block}.topo .titulo{display:flex;align-items:center;gap:14px}.topo h1{margin:0;font-size:22px;color:#0E2F4A}.topo .muted{color:#4F6475}.topo .acao{background:#FFFFFF;color:#0E2F4A;border-color:#D9E3EA}
header.abas{padding:12px 16px 0;max-width:1200px;margin:0 auto}h2{margin:0 0 4px;font-size:17px}h3{margin:0 0 6px;font-size:14px}
nav.tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-top:10px}nav.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:8px 10px;font:inherit;font-weight:700;color:var(--muted);cursor:pointer}nav.tabs button[aria-selected=true]{color:var(--blue);border-color:var(--blue)}
main{max-width:1200px;margin:0 auto;padding:16px;display:block}section.tab,.recorte{display:flex;flex-direction:column;gap:14px}.recorte[hidden]{display:none}.card p,.card h2{margin:0}section.tab[hidden]{display:none}
.muted{color:var(--muted)}.small{font-size:13px}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.tile,.card{background:var(--raised);border:1px solid var(--border);border-radius:16px;padding:14px}.tile p{margin:0}.big{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}.hero{font-size:34px;font-weight:600;margin:4px 0}
.card{display:flex;flex-direction:column;gap:8px;min-width:0;overflow-x:auto}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.hbars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.hbars li{display:grid;grid-template-columns:minmax(6rem,10rem) 1fr auto;gap:10px;align-items:center;font-size:14px}.hbars strong{text-align:right;font-variant-numeric:tabular-nums}.track{height:12px;background:var(--sober);border-radius:0 4px 4px 0}.fill{display:block;height:12px;border-radius:0 4px 4px 0}.fill.c1{background:var(--c1)}.fill.dim{background:var(--mid)}
.cols{display:flex;align-items:flex-end;gap:2px;height:150px}.col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:2px}.col:hover{opacity:.8}.seg{display:block}.seg:first-child{border-radius:4px 4px 0 0}.seg.c1{background:var(--c1)}.seg.c2{background:var(--c2)}.seg.dim{background:var(--mid)}.zero{display:block;height:2px;background:var(--sober)}.axis{display:flex;gap:2px;font-size:10px;color:var(--muted)}.axis span{flex:1;text-align:center}
.legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted)}.legend li{display:flex;align-items:center;gap:6px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px}.sw.c1{background:var(--c1)}.sw.c2{background:var(--c2)}.sw.good,.stack .good{background:var(--good)}.sw.bad,.stack .bad{background:var(--bad)}.sw.mid,.stack .mid{background:var(--mid)}
.stack{display:flex;gap:2px;height:12px;border-radius:4px;overflow:hidden}.stack span{display:block}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:400;color:var(--muted);font-size:12px;padding:4px 8px 4px 0}td{border-top:1px solid var(--border);padding:6px 8px 6px 0;vertical-align:top}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.list strong,.hbars strong,.dl dd{white-space:nowrap}
.list{list-style:none;margin:0;padding:0}.list li{padding:6px 0;border-top:1px solid var(--border)}.list li:first-child{border-top:0}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--sober);font-size:12px;font-weight:700}.badge.bad-soft{color:var(--bad)}.pill{display:inline-block;margin:0;padding:3px 10px;border-radius:999px;background:var(--sober);font-size:12px;font-weight:700;width:fit-content}
.dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:0}.dl dt,.dl1 dt{font-size:12px;color:var(--muted)}.dl dd,.dl1 dd{margin:0;font-weight:700}.dl1{margin:0;display:flex;flex-direction:column;gap:4px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}input,select,textarea{font:inherit;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--raised);color:var(--ink)}.filters input[type=search]{flex:1;min-width:220px}
details.empresa{background:var(--raised);border:1px solid var(--border);border-radius:14px;margin-top:8px}details.empresa summary{cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;color:var(--ink)}.ficha{padding:0 14px 14px;display:flex;flex-direction:column;gap:14px}
.kanban{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:10px;overflow-x:auto}.kcol{background:var(--sober);border-radius:14px;padding:10px}.kcard{background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px}.kcard p{margin:2px 0}
.acoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.acao{border:1px solid var(--border);background:var(--raised);color:var(--ink);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.acao:hover{border-color:var(--blue)}.acao.wa{background:#76B82A;border-color:#76B82A;color:#fff}.acao.destaque{background:#F18E29;border-color:#F18E29;color:#fff}.acao[disabled]{opacity:.45;cursor:not-allowed}
.pf{background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-top:8px}
a{color:var(--blue)}code{background:var(--sober);padding:1px 5px;border-radius:6px}details summary{color:var(--blue)}
.recorte-nav{display:flex;gap:4px;background:var(--sober);border-radius:999px;padding:4px;width:fit-content}.recorte-nav button{border:0;background:none;border-radius:999px;padding:6px 14px;font:inherit;font-weight:700;color:var(--ink);cursor:pointer}.recorte-nav button[aria-pressed=true]{background:var(--c1);color:#fff}
dialog{border:1px solid var(--border);border-radius:16px;background:var(--raised);color:var(--ink);padding:18px;width:min(560px,94vw)}dialog::backdrop{background:rgba(14,47,74,.45)}dialog form{display:flex;flex-direction:column;gap:10px}.botoes{display:flex;gap:8px;justify-content:flex-end}
.campo{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700}.campo.check{flex-direction:row;align-items:center;font-weight:400}.campo.largo,.grid-form .largo{grid-column:1/-1}.grid-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.tags{display:flex;flex-wrap:wrap;gap:6px}.tags button{border:1px solid var(--border);background:var(--soft2);color:var(--ink);border-radius:999px;padding:4px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.aviso{color:var(--bad);margin:0}
.lembrete{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:var(--raised);border:2px solid #F18E29;border-radius:14px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:94vw;z-index:10}.lembrete[hidden]{display:none}
@media (max-width:640px){.hbars li{grid-template-columns:6rem 1fr auto}.grid2,.grid3{grid-template-columns:1fr}.topo img{height:44px}}`;

// Script da página (roda no navegador). Usa as funções de painel-acoes.mjs,
// copiadas para a página por renderPainel. Não carrega nada de fora.
function clientePainel() {
  var PADRAO = { nome: "Diego", cargo: "", site: "https://novoseminovo.com.br", comercial: "/comercial", whatsapp: "smb", email: "gmail", conta: "diego.louis@novoseminovo.com.br", agenda: "google", duracao: 45, local: "Google Meet", tema: "auto", lembrete: true };
  function lerJson(chave, padrao) {
    try {
      var v = window.localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch (e) {
      return padrao;
    }
  }
  function gravar(chave, valor) {
    try {
      window.localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {}
  }
  var cfg = Object.assign({}, PADRAO, lerJson("crm-config", {}));
  var msgs = lerJson("crm-mensagens", null);
  if (!Array.isArray(msgs)) msgs = MENSAGENS_INICIAIS.slice();
  function aplicarTema() {
    var raiz = document.documentElement;
    if (cfg.tema === "claro") raiz.setAttribute("data-theme", "light");
    else if (cfg.tema === "escuro") raiz.setAttribute("data-theme", "dark");
    else raiz.removeAttribute("data-theme");
  }
  aplicarTema();

  // ---- abas, recortes, filtros ----
  var tabs = Array.prototype.slice.call(document.querySelectorAll("nav.tabs button"));
  function show(id) {
    tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === id)); });
    document.querySelectorAll("section.tab").forEach(function (s) { s.hidden = s.id !== id; });
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.tab); history.replaceState(null, "", "#" + b.dataset.tab); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.goto); history.replaceState(null, "", "#" + b.dataset.goto); });
  });
  document.querySelectorAll(".recorte-nav button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".recorte-nav button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      document.querySelectorAll(".recorte").forEach(function (r) { r.hidden = r.dataset.recorte !== b.dataset.recorte; });
    });
  });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("[data-open]");
    if (!a) return;
    ev.preventDefault();
    show("empresas");
    var d = document.getElementById("empresa-" + a.dataset.open);
    if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  function filtro(buscaId, segId, seletor, extra) {
    var busca = document.getElementById(buscaId), seg = document.getElementById(segId);
    if (!busca) return;
    var rodar = function () {
      var q = (busca.value || "").toLowerCase().trim(), n = 0;
      document.querySelectorAll(seletor).forEach(function (el) {
        var ok = (!q || el.dataset.busca.indexOf(q) >= 0) && (!seg || !seg.value || el.dataset.seg === seg.value) && (!extra || extra(el));
        el.hidden = !ok;
        if (ok) n++;
      });
      var cont = document.getElementById("contagem");
      if (cont && seletor === "details.empresa") cont.textContent = n + " empresa(s)";
    };
    [busca, seg].forEach(function (x) { if (x) x.addEventListener("input", rodar); });
    rodar();
    return rodar;
  }
  var etapa = document.getElementById("f-etapa"), imp = document.getElementById("f-imp");
  var rodarEmpresas = filtro("busca", "f-seg", "details.empresa", function (el) {
    return (!etapa || !etapa.value || el.dataset.etapa === etapa.value) && (!imp || !imp.checked || el.dataset.imp === "1");
  });
  [etapa, imp].forEach(function (x) { if (x && rodarEmpresas) x.addEventListener("input", rodarEmpresas); });
  filtro("busca-pf", "f-seg-pf", "#lista-pf .pf");

  // ---- ações ----
  var alvoAtual = null;
  function dadosMsg(a) {
    return { responsavel: a.responsavel, empresa: a.nome, cidade: a.cidade, seunome: cfg.nome, fimgratis: a.fimgratis, leadsparados: a.leadsparados, link: String(cfg.site || "").replace(/\/$/, "") + (a.pagina || "") };
  }
  function abrir(url) {
    if (/^https?:/.test(url)) window.open(url, "_blank", "noopener");
    else window.location.href = url;
  }
  function lembrar(a) {
    if (!cfg.lembrete) return;
    var box = document.getElementById("lembrete");
    document.getElementById("lembrete-texto").textContent = "Registre a conversa com " + a.nome + " (regra de ouro: se não está no CRM, não existe).";
    document.getElementById("lembrete-registrar").hidden = !a.card;
    box.hidden = false;
  }
  document.getElementById("lembrete-fechar").addEventListener("click", function () { document.getElementById("lembrete").hidden = true; });
  document.getElementById("lembrete-registrar").addEventListener("click", function () {
    document.getElementById("lembrete").hidden = true;
    if (alvoAtual) abrirRegistrar(alvoAtual);
  });
  function abrirModal(dlg) {
    dlg.returnValue = "";
    dlg.showModal();
  }

  var dlgMsg = document.getElementById("dlg-msg"), formMsg = document.getElementById("form-msg");
  function abrirMensagem(canal, a) {
    dlgMsg.dataset.canal = canal;
    document.getElementById("msg-titulo").textContent = (canal === "email" ? "E-mail para " : "WhatsApp para ") + a.nome;
    document.getElementById("msg-para").textContent = canal === "email" ? a.email : a.telefone;
    document.getElementById("msg-assunto-campo").hidden = canal !== "email";
    document.getElementById("msg-ok").textContent = canal === "email" ? "Abrir e-mail" : "Abrir WhatsApp";
    formMsg.assunto.value = "";
    formMsg.texto.value = "";
    document.getElementById("msg-aviso").textContent = "";
    var tags = document.getElementById("msg-tags");
    tags.textContent = "";
    var lista = msgs.filter(function (m) { return (m.canal === "ambos" || m.canal === canal) && (m.publico === "todos" || m.publico === a.segmento); });
    lista.concat([{ nome: "Em branco", texto: "", assunto: "" }]).forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = m.nome;
      b.addEventListener("click", function () {
        var t = preencherMensagem(m.texto, dadosMsg(a));
        var s = preencherMensagem(m.assunto || "", dadosMsg(a));
        formMsg.texto.value = t.texto;
        formMsg.assunto.value = s.texto;
        var falta = t.faltando.concat(s.faltando.filter(function (x) { return t.faltando.indexOf(x) < 0; }));
        var NOMES = { responsavel: "nome do responsável", empresa: "nome da empresa", cidade: "cidade", seunome: "seu nome (Configurações)", fimgratis: "fim do período grátis", leadsparados: "leads parados", link: "link da página" };
        document.getElementById("msg-aviso").textContent = falta.length ? "Faltou: " + falta.map(function (x) { return NOMES[x] || x; }).join(", ") + ". Troque o ___ antes de enviar." : "";
      });
      tags.appendChild(b);
    });
    abrirModal(dlgMsg);
  }
  // Abrir o link no submit (não no "close"): no close o navegador pode bloquear.
  formMsg.addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok" || !alvoAtual) return;
    var a = alvoAtual, canal = dlgMsg.dataset.canal, texto = formMsg.texto.value;
    if (canal === "email") {
      if (texto.indexOf("Um abraço") < 0) texto = texto + "\n\nUm abraço,\n" + cfg.nome + (cfg.cargo ? "\n" + cfg.cargo : "") + "\nNovoSeminovo";
      abrir(linkEmail(cfg.email, cfg.conta, a.email, formMsg.assunto.value, texto));
    } else {
      abrir(linkWhatsApp(cfg.whatsapp, telefoneBr(a.telefone), texto));
    }
    lembrar(a);
  });

  var dlgReuniao = document.getElementById("dlg-reuniao"), formReuniao = document.getElementById("form-reuniao");
  function abrirReuniao(a) {
    var amanha = new Date(Date.now() + 86400000);
    formReuniao.titulo.value = "Reunião NovoSeminovo - " + a.nome;
    formReuniao.data.value = amanha.toISOString().slice(0, 10);
    formReuniao.hora.value = "10:00";
    formReuniao.duracao.value = cfg.duracao;
    formReuniao.local.value = cfg.local;
    formReuniao.pauta.value = "";
    abrirModal(dlgReuniao);
  }
  formReuniao.addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok") return;
    var r = { titulo: formReuniao.titulo.value, data: formReuniao.data.value, hora: formReuniao.hora.value, duracao: Number(formReuniao.duracao.value) || cfg.duracao, local: formReuniao.local.value, pauta: formReuniao.pauta.value };
    if (cfg.agenda === "ics") {
      var blob = new Blob([convidarIcs(r, new Date().toISOString())], { type: "text/calendar" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reuniao.ics";
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
    } else {
      abrir(linkAgenda(cfg.conta, r));
    }
  });

  // Copia pelo jeito que funciona em arquivo local (execCommand dentro do
  // diálogo aberto); se o navegador não deixar, tenta a área de transferência nova.
  function copiar(texto, dentro) {
    var ok = false;
    try {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      dentro.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) {}
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(texto).catch(function () {});
  }
  var dlgReg = document.getElementById("dlg-registrar"), formReg = document.getElementById("form-registrar");
  function abrirRegistrar(a) {
    formReg.texto.value = "";
    formReg.proximo.value = "";
    abrirModal(dlgReg);
  }
  formReg.addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok" || !alvoAtual) return;
    var texto = "[" + formReg.tipo.value + "] " + formReg.texto.value + (formReg.proximo.value ? "\nPróximo passo: " + formReg.proximo.value : "");
    copiar(texto, formReg);
    abrir(String(cfg.site || "").replace(/\/$/, "") + cfg.comercial + "/" + encodeURIComponent(alvoAtual.card));
  });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-acao]");
    if (!b || b.disabled) return;
    var caixa = b.closest(".acoes");
    var a = Object.assign({}, caixa.dataset);
    alvoAtual = a;
    var acao = b.dataset.acao;
    if (acao === "ligar") { abrir(linkLigar(a.telefone)); lembrar(a); }
    else if (acao === "whatsapp" || acao === "email") abrirMensagem(acao, a);
    else if (acao === "reuniao") abrirReuniao(a);
    else if (acao === "registrar") abrirRegistrar(a);
    else if (acao === "site") abrir(String(cfg.site || "").replace(/\/$/, "") + a.pagina);
  });

  // ---- configurações ----
  var formCfg = document.getElementById("form-config");
  Object.keys(PADRAO).forEach(function (k) {
    var el = formCfg.elements[k];
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(cfg[k]);
    else el.value = cfg[k];
  });
  formCfg.addEventListener("submit", function (ev) {
    ev.preventDefault();
    Object.keys(PADRAO).forEach(function (k) {
      var el = formCfg.elements[k];
      if (!el) return;
      cfg[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) || PADRAO[k] : el.value.trim() || PADRAO[k];
    });
    gravar("crm-config", cfg);
    aplicarTema();
    document.getElementById("cfg-ok").textContent = "Salvo.";
  });

  var listaMsgs = document.getElementById("lista-msgs"), formEdit = document.getElementById("form-msg-edit");
  var PUBLICO = { todos: "Todos", vehicle: "Lojas de veículos", property: "Imobiliárias e corretores" };
  var CANAL = { ambos: "WhatsApp e e-mail", whatsapp: "WhatsApp", email: "E-mail" };
  function desenharMsgs() {
    listaMsgs.textContent = "";
    msgs.forEach(function (m, i) {
      var li = document.createElement("li");
      var nome = document.createElement("strong");
      nome.textContent = m.nome;
      var info = document.createElement("span");
      info.className = "small muted";
      info.textContent = " · " + (CANAL[m.canal] || m.canal) + " · " + (PUBLICO[m.publico] || m.publico) + " ";
      var editar = document.createElement("button");
      editar.type = "button"; editar.className = "acao"; editar.textContent = "Editar";
      editar.addEventListener("click", function () {
        formEdit.indice.value = String(i);
        ["nome", "canal", "publico", "assunto", "texto"].forEach(function (k) { formEdit.elements[k].value = m[k] || (k === "canal" ? "ambos" : k === "publico" ? "todos" : ""); });
        formEdit.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      var apagar = document.createElement("button");
      apagar.type = "button"; apagar.className = "acao"; apagar.textContent = "Apagar";
      apagar.addEventListener("click", function () {
        if (!window.confirm("Apagar a mensagem \"" + m.nome + "\"?")) return;
        msgs.splice(i, 1); gravar("crm-mensagens", msgs); desenharMsgs();
      });
      li.appendChild(nome); li.appendChild(info); li.appendChild(editar); li.appendChild(document.createTextNode(" ")); li.appendChild(apagar);
      listaMsgs.appendChild(li);
    });
  }
  desenharMsgs();
  formEdit.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var m = { nome: formEdit.nome.value.trim(), canal: formEdit.canal.value, publico: formEdit.publico.value, assunto: formEdit.assunto.value, texto: formEdit.texto.value };
    var i = formEdit.indice.value === "" ? -1 : Number(formEdit.indice.value);
    if (i >= 0 && msgs[i]) msgs[i] = m; else msgs.push(m);
    gravar("crm-mensagens", msgs);
    formEdit.reset(); formEdit.indice.value = "";
    desenharMsgs();
  });
  document.getElementById("msg-nova").addEventListener("click", function () { formEdit.reset(); formEdit.indice.value = ""; });
  document.getElementById("msg-restaurar").addEventListener("click", function () {
    if (!window.confirm("Voltar para as mensagens iniciais? As mensagens que você criou serão apagadas.")) return;
    msgs = MENSAGENS_INICIAIS.slice(); gravar("crm-mensagens", msgs); desenharMsgs();
  });

  var doHash = function () { var h = location.hash.slice(1); if (tabs.some(function (b) { return b.dataset.tab === h; })) show(h); };
  window.addEventListener("hashchange", doHash);
  var inicial = location.hash.slice(1);
  show(tabs.some(function (b) { return b.dataset.tab === inicial; }) ? inicial : "visao");
}

// Funções e textos que vão para dentro da página (JSON com "<" escapado).
const jsonPagina = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const JS = [telefoneBr, linkLigar, linkWhatsApp, linkEmail, horarioReuniao, linkAgenda, convidarIcs, preencherMensagem].map((f) => f.toString()).join("\n") +
  `\nvar CAMPOS_MENSAGEM = ${jsonPagina(CAMPOS_MENSAGEM)};\nvar MENSAGENS_INICIAIS = ${jsonPagina(MENSAGENS_INICIAIS)};\n(${clientePainel.toString()})();`;

const CSP = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src data:";

export function renderPainel({ feed, receitas, ordens = [], avisos = [], marcacoes = {}, jornada = [], calendario = [], hoje = new Date() }) {
  const abas = [
    ["visao", "Visão geral", `<div class="recorte-nav" role="group" aria-label="Recorte"><button aria-pressed="true" data-recorte="all">Geral</button><button aria-pressed="false" data-recorte="vehicle">Veículos</button><button aria-pressed="false" data-recorte="property">Imóveis</button></div>${telaVisaoGeral(feed, receitas, hoje)}`],
    ["receitas", "Receitas", telaReceitas(receitas)],
    ["empresas", "Empresas", telaEmpresas(feed, marcacoes, jornada)],
    ["prospeccao", "Prospecção", telaProspeccao(feed, marcacoes)],
    ["pf", "Pessoas físicas", telaPF(feed, receitas, marcacoes)],
    ["avisos", "Avisos", telaAvisos(avisos)],
    ["ordens", "Ordens", telaOrdens(ordens)],
    ["agenda", "Agenda", telaAgenda(feed, marcacoes, calendario, hoje)],
    ["config", "Configurações", telaConfig()],
  ];
  const geradoEm = new Date(feed.geradoEm ?? hoje).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>CRM NovoSeminovo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;700&display=swap"><style>${CSS}</style></head>
<body><div class="topo"><div class="topo-in"><div class="titulo"><img src="${LOGO_DATA_URI}" alt="NovoSeminovo"><div><h1>CRM</h1><p class="small muted">Dados do site de ${esc(geradoEm)} · atualiza sozinho às 07:30 · não enviar este arquivo a ninguém</p></div></div><button type="button" class="acao" data-goto="config">Configurar</button></div></div>
<header class="abas"><nav class="tabs" role="tablist">${abas.map(([id, nome]) => `<button role="tab" data-tab="${id}" aria-selected="false">${esc(nome)}</button>`).join("")}</nav></header>
<main>${abas.map(([id, nome, corpo]) => `<section class="tab" id="${id}" aria-label="${esc(nome)}" hidden>${corpo}</section>`).join("")}</main>
${DIALOGOS}
<script>${JS}</script></body></html>`;
}
