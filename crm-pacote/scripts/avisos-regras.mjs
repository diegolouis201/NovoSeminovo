// Regras dos avisos inteligentes do CRM. Recebe os dados já baixados do site
// (dados/clientes.json), as marcações locais (dados/marcacoes.json) e o
// calendário do setor; devolve a lista de avisos em ordem de prioridade, cada
// um com uma sugestão de ordem para a área certa. Não envia nada.
import { br, daysBetween, nextFromDdMm, nextOccurrence, sectorDate } from "./lib.mjs";

const LEVEL = { urgente: 0, oportunidade: 1, acompanhar: 2 };
const PERIODO_GRATIS_AVISO = 10;
const JANELA_ANIVERSARIO = 7;
const JANELA_DATA_SETOR = 14;
const LEADS_PARADOS_LIMITE = 3;
const IMPORTANTE_SEM_CONTATO_DIAS = 30;
const CHAMADO_PARADO_DIAS = 2;
const SEM_ACESSO_DIAS = 30;

const parseDay = (text) => (text ? new Date(`${String(text).slice(0, 10)}T00:00:00Z`) : undefined);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function buildAlerts(feed, marcacoes = {}, calendar = [], hoje = new Date(), ordens = [], { apiBase = "https://api.novoseminovo.com.br" } = {}) {
  const alerts = [];
  const add = (alert) => alerts.push(alert);
  const empresas = feed.empresas ?? [];

  for (const e of empresas) {
    const mark = marcacoes[e.id] ?? {};
    const base = { empresaId: e.id, cardId: e.cardId, empresa: e.nome, importante: Boolean(mark.importante) };
    const plano = e.plano;
    const temPlano = plano && plano.status !== "cancelada";

    // ---- Urgente ----
    if (plano?.status === "em_atraso") {
      add({ ...base, nivel: "urgente", tipo: "pagamento_atrasado", texto: `${e.nome}: pagamento do plano ${plano.nome} atrasado.`, ordem: { area: "comercial", titulo: `Ajudar ${e.nome} a atualizar o cartão (pagamento atrasado)`, prioridade: "alta" } });
    }
    const fimGratis = parseDay(e.periodoGratisAte);
    if (!temPlano && fimGratis && (e.anuncios?.noAr ?? 0) > 0) {
      const dias = daysBetween(hoje, fimGratis);
      if (dias >= 0 && dias <= PERIODO_GRATIS_AVISO) {
        add({ ...base, nivel: "urgente", tipo: "fim_periodo_gratis", texto: `${e.nome}: período grátis acaba em ${plural(dias, "dia", "dias")} (${br(fimGratis)}), com ${e.anuncios.noAr} anúncio(s) no ar e sem plano.`, ordem: { area: "comercial", titulo: `Contato de fim do período grátis com ${e.nome} (COM-04)`, detalhes: `Tem ${e.anuncios.noAr} anúncios no ar. Indicar o plano que cobre esse estoque.`, prioridade: "alta" } });
      }
    }
    if (plano?.status === "cancelada" && plano.mudouEm && daysBetween(parseDay(plano.mudouEm), hoje) <= 7) {
      add({ ...base, nivel: "urgente", tipo: "cancelou", texto: `${e.nome} cancelou o plano ${plano.nome} em ${br(parseDay(plano.mudouEm))}.`, ordem: { area: "comercial", titulo: `Perguntar a ${e.nome} o motivo do cancelamento (COM-06)` } });
    }
    if ((e.leads?.paradosMais3Dias ?? 0) >= LEADS_PARADOS_LIMITE) {
      add({ ...base, nivel: "urgente", tipo: "leads_parados", texto: `${e.nome}: ${e.leads.paradosMais3Dias} clientes esperando resposta há mais de 3 dias.`, ordem: { area: "comercial", titulo: `Orientar ${e.nome} a responder os leads parados (COM-05)` } });
    }
    const nps = e.nps;
    if (nps && daysBetween(parseDay(nps.data), hoje) <= 30) {
      if (nps.classificacao === "detrator") {
        add({ ...base, nivel: "urgente", tipo: "nps_detrator", texto: `${e.nome} deu nota ${nps.nota} no NPS${nps.comentario ? ` ("${nps.comentario}")` : ""}.`, ordem: { area: "comercial", titulo: `Ligar para ${e.nome} e entender a nota ${nps.nota} no NPS`, prioridade: "alta" } });
      } else if (nps.classificacao === "promotor" && !mark.naoContatar) {
        add({ ...base, nivel: "oportunidade", tipo: "nps_promotor", texto: `${e.nome} deu nota ${nps.nota} no NPS: pedir indicação de outra empresa ou autorização para um depoimento.`, ordem: { area: "comercial", titulo: `Pedir indicação a ${e.nome} (nota ${nps.nota} no NPS)` } });
      }
    }
    const abertoDesde = parseDay(e.chamados?.abertoDesde);
    if (abertoDesde && daysBetween(abertoDesde, hoje) > CHAMADO_PARADO_DIAS) {
      add({ ...base, nivel: "urgente", tipo: "chamado_parado", texto: `${e.nome}: chamado de suporte aberto desde ${br(abertoDesde)}.`, ordem: { area: "atendimento", titulo: `Resolver o chamado aberto de ${e.nome}`, prioridade: "alta" } });
    }
    if (temPlano && (e.uso?.diasSemAcesso ?? 0) >= SEM_ACESSO_DIAS) {
      add({ ...base, nivel: "urgente", tipo: "risco_cancelamento", texto: `${e.nome} é assinante e não entra no painel há ${e.uso.diasSemAcesso} dias (risco de cancelamento).`, ordem: { area: "comercial", titulo: `Contato de sucesso do cliente com ${e.nome} (sem acesso há ${e.uso.diasSemAcesso} dias)` } });
    }
    if (mark.importante) {
      const ultima = (e.ultimasAnotacoes ?? [])[0]?.data;
      const dias = ultima ? daysBetween(parseDay(ultima), hoje) : Infinity;
      if (dias > IMPORTANTE_SEM_CONTATO_DIAS) {
        add({ ...base, nivel: "urgente", tipo: "importante_sem_contato", texto: `${e.nome} (importante): ${ultima ? `sem contato há ${dias} dias` : "nenhum contato registrado"}.`, ordem: { area: "comercial", titulo: `Fazer contato de relacionamento com ${e.nome} (cliente importante)` } });
      }
    }

    // ---- Boas-vindas nas redes (assinou o plano) ----
    if (plano?.status === "ativa" && !mark.naoContatar && !boasVindasPedida(e.id, ordens, mark)) {
      const redes = e.redesSociais ?? {};
      const temRede = Boolean(redes.instagram || redes.facebook);
      if (e.logo && e.autorizaDivulgacaoEm && temRede) {
        add({ ...base, nivel: "oportunidade", tipo: "boas_vindas_redes", texto: `${e.nome} assinou, enviou a logo e autorizou o post de boas-vindas nas redes.`, ordem: { area: "marketing", titulo: `Post de boas-vindas: ${e.nome}`, detalhes: detalhesBoasVindas(e, apiBase) } });
      } else {
        const falta = [!e.logo && "logo", !temRede && "Instagram ou Facebook", !e.autorizaDivulgacaoEm && "autorização"].filter(Boolean);
        add({ ...base, nivel: "acompanhar", tipo: "boas_vindas_pendente", texto: `${e.nome} assinou, mas falta para o post de boas-vindas: ${falta.join(", ")}.`, ordem: { area: "comercial", titulo: `Pedir a ${e.nome}: ${falta.join(", ")} (painel do parceiro → Redes sociais da empresa)` } });
      }
    }

    // ---- Oportunidade (respeita "não contatar") ----
    if (!mark.naoContatar) {
      const aberta = parseDay(e.abertaEm);
      if (aberta) {
        const next = nextOccurrence(aberta.getUTCDate(), aberta.getUTCMonth() + 1, hoje);
        const dias = next ? daysBetween(hoje, next) : Infinity;
        const anos = next ? next.getUTCFullYear() - aberta.getUTCFullYear() : 0;
        if (dias <= JANELA_ANIVERSARIO && anos > 0) {
          add({ ...base, nivel: "oportunidade", tipo: "aniversario_empresa", texto: `${e.nome} faz ${plural(anos, "ano", "anos")} em ${br(next)}.`, ordem: { area: "marketing", titulo: `Parabéns pelos ${anos} anos de ${e.nome}`, detalhes: `Data: ${br(next)}. Sócios: ${(e.socios ?? []).map((s) => s.nome).join(", ") || "não informados"}.` } });
        }
      }
      const cadastro = parseDay(e.cadastroNoSiteEm);
      if (cadastro) {
        const next = nextOccurrence(cadastro.getUTCDate(), cadastro.getUTCMonth() + 1, hoje);
        const anos = next ? next.getUTCFullYear() - cadastro.getUTCFullYear() : 0;
        if (next && anos > 0 && daysBetween(hoje, next) <= JANELA_ANIVERSARIO) {
          add({ ...base, nivel: "oportunidade", tipo: "aniversario_parceria", texto: `${e.nome} completa ${plural(anos, "ano", "anos")} de NovoSeminovo em ${br(next)}.`, ordem: { area: "marketing", titulo: `Agradecer ${e.nome} pelo ${anos}º ano de parceria` } });
        }
      }
      for (const socio of e.socios ?? []) {
        const next = nextFromDdMm(socio.aniversario, hoje);
        if (next && daysBetween(hoje, next) <= JANELA_ANIVERSARIO) {
          add({ ...base, nivel: "oportunidade", tipo: "aniversario_socio", texto: `Aniversário de ${socio.nome} (${e.nome}) em ${br(next)}.`, ordem: { area: "comercial", titulo: `Mandar parabéns para ${socio.nome} (${e.nome})` } });
        }
      }
    }

    // ---- Acompanhar ----
    if (e.etapa?.id === "cadastrou" && cadastroHaMaisDe(e, hoje, 7)) {
      add({ ...base, nivel: "acompanhar", tipo: "sem_anuncio", texto: `${e.nome} se cadastrou em ${br(parseDay(e.cadastroNoSiteEm))} e ainda não publicou anúncio.`, ordem: { area: "comercial", titulo: `Ajudar ${e.nome} a publicar o primeiro anúncio (COM-03)` } });
    }
  }

  // Datas do setor: um aviso por data, com o público que recebe.
  for (const item of calendar) {
    const date = [hoje.getUTCFullYear(), hoje.getUTCFullYear() + 1].map((y) => sectorDate(item.data, y)).find((d) => d && d >= hoje);
    if (!date || daysBetween(hoje, date) > JANELA_DATA_SETOR) continue;
    const publico = empresas.filter((e) => !(marcacoes[e.id]?.naoContatar) && (item.publico === "todos" || e.segmento === item.publico));
    if (!publico.length) continue;
    add({ nivel: "oportunidade", tipo: "data_do_setor", empresa: item.nome, importante: false, texto: `${item.nome} em ${br(date)}: ${plural(publico.length, "empresa", "empresas")} no público. Ideia: ${item.ideia}`, ordem: { area: "marketing", titulo: `Campanha ${item.nome} (${br(date)})`, detalhes: `${item.ideia}. Público: ${item.publico === "todos" ? "todas as empresas" : item.publico === "vehicle" ? "lojas de veículos" : "imobiliárias, corretores e construtoras"}.` } });
  }

  // Prospecção: próximo contato vencido.
  for (const p of feed.prospeccao ?? []) {
    const when = p.proximoContato ? new Date(p.proximoContato) : undefined;
    if (when && when < hoje && p.etapa?.id !== "perdida") {
      add({ nivel: "acompanhar", tipo: "contato_vencido", cardId: p.cardId, empresa: p.nome, importante: Boolean(marcacoes[p.cardId]?.importante), texto: `${p.nome}: próximo contato era ${br(when)}${p.vendedor ? ` (${p.vendedor})` : ""}.`, ordem: { area: "comercial", titulo: `Retomar contato com ${p.nome}` } });
    }
  }

  return alerts.sort((a, b) => LEVEL[a.nivel] - LEVEL[b.nivel] || Number(b.importante) - Number(a.importante) || a.empresa.localeCompare(b.empresa));
}

// Já existe ordem de boas-vindas (aberta ou feita) ou a marcação manual.
function boasVindasPedida(empresaId, ordens, mark) {
  if ((mark.tags ?? []).includes("boas-vindas-postada")) return true;
  return ordens.some((o) => o.empresaId === empresaId && o.status !== "cancelada" && String(o.titulo ?? "").startsWith("Post de boas-vindas"));
}

function detalhesBoasVindas(e, apiBase) {
  const r = e.redesSociais ?? {};
  const logo = /^https?:\/\//.test(e.logo) ? e.logo : `${apiBase.replace(/\/$/, "")}${e.logo}`;
  const site = e.pagina ? `novoseminovo.com.br${e.pagina}` : "novoseminovo.com.br";
  const marca = r.instagram ? `@${r.instagram}` : e.nome;
  return [
    `Logo da empresa: ${logo}`,
    r.instagram ? `Instagram: @${r.instagram} (marcar na foto e escrever na legenda)` : "Instagram: a empresa não informou (post só com o nome)",
    r.facebook ? `Facebook: https://www.facebook.com/${r.facebook} (marcar a página no post)` : "Facebook: a empresa não informou (post só com o nome)",
    `Arte: logo da empresa + "Bem-vinda ao NovoSeminovo", nas cores da marca.`,
    `Legenda sugerida: "Seja bem-vinda ao NovoSeminovo, ${marca}! 🚗🏠 Agora os anúncios de ${e.nome} também estão no NovoSeminovo. Confira: ${site} #NovoSeminovo"`,
    "Mostrar a prévia ao Diego e só publicar depois do OK dele. Não inventar dados da empresa.",
  ].join("\n");
}

function cadastroHaMaisDe(e, hoje, dias) {
  const cadastro = parseDay(e.cadastroNoSiteEm);
  return cadastro ? daysBetween(cadastro, hoje) > dias : false;
}
