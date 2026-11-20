// Cálculos da tela inicial do painel do parceiro (/parceiro), em funções
// puras para poder testar sem banco (dashboard.spec.ts). Só dados que já
// existem: nada aqui estima o que o banco não guarda.
import {
  FIPE_MARGEM_MEDIA_PCT,
  LEAD_STATUS_LABELS,
  PAINEL_FUSO,
  PAINEL_MIN_DESCRICAO,
  PAINEL_MIN_FOTOS,
  PAINEL_POUCA_PROCURA_DIAS,
  PAINEL_POUCA_PROCURA_VISUALIZACOES,
  referenciaFipe,
  type LeadStatus,
  type PainelAnalise,
  type PainelFunil,
  type PainelQualidade,
} from "@novoseminovo/shared-types";

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------- Dias no fuso de São Paulo ----------

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatadorDia(fuso: string) {
  let f = formatadores.get(fuso);
  if (!f) {
    // en-CA formata como AAAA-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" });
    formatadores.set(fuso, f);
  }
  return f;
}

export function chaveDoDia(data: Date, fuso = PAINEL_FUSO): string {
  return formatadorDia(fuso).format(data);
}

// Os `dias` dias que terminam hoje (no fuso), do mais antigo para hoje.
export function ultimosDias(agora: Date, dias: number, fuso = PAINEL_FUSO): string[] {
  const hoje = chaveDoDia(agora, fuso);
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  const meioDia = Date.UTC(a, m - 1, d, 12);
  return Array.from({ length: dias }, (_, i) => new Date(meioDia - (dias - 1 - i) * DIA_MS).toISOString().slice(0, 10));
}

// Meia-noite do dia `chave` no fuso, como instante. O deslocamento vem do
// próprio Intl (não fica escrito "-03:00"), então segue certo se o horário
// de verão voltar.
export function inicioDoDia(chave: string, fuso = PAINEL_FUSO): Date {
  const meioDia = new Date(`${chave}T12:00:00Z`);
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(meioDia)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nome ?? "");
  const offset = m ? `${m[1]}${m[2]}:${m[3] ?? "00"}` : "Z";
  return new Date(`${chave}T00:00:00${offset}`);
}

export function leadsPorDia(datas: Date[], agora: Date, dias: number, fuso = PAINEL_FUSO): { data: string; total: number }[] {
  const chaves = ultimosDias(agora, dias, fuso);
  const contagem = new Map(chaves.map((c) => [c, 0]));
  for (const data of datas) {
    const chave = chaveDoDia(data, fuso);
    if (contagem.has(chave)) contagem.set(chave, contagem.get(chave)! + 1);
  }
  return chaves.map((data) => ({ data, total: contagem.get(data)! }));
}

// ---------- Funil (etapas do quadro de leads) ----------

const ETAPAS_DO_FUNIL = ["contacted", "visit_scheduled", "negotiating", "won"] as const;

// Contagem pela etapa ATUAL de cada lead (o banco não guarda o histórico de
// etapas). Rótulos iguais aos do LeadsKanban.
export function funilDosLeads(porStatus: Partial<Record<LeadStatus, number>>, ehCarro: boolean): Omit<PainelFunil, "visualizacoesAnunciosAtivos" | "sinais"> {
  const total = (s: LeadStatus) => porStatus[s] ?? 0;
  const totalLeads = Object.values(porStatus).reduce((soma, n) => soma + (n ?? 0), 0);
  return {
    totalLeads,
    etapas: ETAPAS_DO_FUNIL.map((status) => ({
      status,
      label: status === "visit_scheduled" ? (ehCarro ? "Visita / test-drive" : "Visita agendada") : LEAD_STATUS_LABELS[status],
      total: total(status),
    })),
    perdidos: total("lost"),
  };
}

// ---------- Tempo de resposta no chat ----------

export function formatarDuracao(minutos: number): string {
  if (minutos < 1) return "menos de 1 min";
  const total = Math.round(minutos);
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  if (horas < 24) {
    const resto = total % 60;
    return resto ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  const diaTxt = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return h ? `${diaTxt} e ${h} h` : diaTxt;
}

type Conversa = { compradorId: string; mensagens: { autorId: string; em: Date }[] };

// Da primeira mensagem do comprador até a primeira mensagem de outra pessoa
// (vendedor ou equipe da loja) depois dela. Só o chat do site tem esse dado;
// WhatsApp e formulário ficam fora (o site não vê a resposta). Sem nenhuma
// conversa respondida, não devolve nada (a tela omite o bloco).
export function tempoDeResposta(conversas: Conversa[]) {
  const tempos: number[] = [];
  let comPergunta = 0;
  for (const conversa of conversas) {
    const ordenadas = [...conversa.mensagens].sort((a, b) => a.em.getTime() - b.em.getTime());
    const pergunta = ordenadas.find((m) => m.autorId === conversa.compradorId);
    if (!pergunta) continue;
    comPergunta += 1;
    const resposta = ordenadas.find((m) => m.autorId !== conversa.compradorId && m.em.getTime() >= pergunta.em.getTime());
    if (resposta) tempos.push((resposta.em.getTime() - pergunta.em.getTime()) / 60_000);
  }
  if (tempos.length === 0) return undefined;
  const media = Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 10) / 10;
  return { mediaMinutos: media, label: formatarDuracao(media), respondidas: tempos.length, conversas: comPergunta };
}

// ---------- Análise de anúncios ----------

export type AnuncioParaAnalise = {
  preco: number;
  fipe?: number;
  fotos: number;
  descricao: number; // tamanho em caracteres
  temVideo: boolean;
  visualizacoes: number;
  noArDesde: Date;
};

function poucaProcura(a: AnuncioParaAnalise, agora: Date): boolean {
  return a.visualizacoes < PAINEL_POUCA_PROCURA_VISUALIZACOES && agora.getTime() - a.noArDesde.getTime() > PAINEL_POUCA_PROCURA_DIAS * DIA_MS;
}

const contar = (lista: AnuncioParaAnalise[], f: (a: AnuncioParaAnalise) => boolean) => lista.filter(f).length;

// Carros: acima/abaixo da FIPE pela MESMA regra da página do anúncio
// (referenciaFipe: dentro de ±FIPE_MARGEM_MEDIA_PCT% é "na média"); anúncio
// sem FIPE cadastrada não entra nessa conta.
export function analisarCarros(anuncios: AnuncioParaAnalise[], agora: Date): PainelAnalise {
  const situacao = (a: AnuncioParaAnalise) => referenciaFipe(a.preco, a.fipe)?.situacao;
  const semFipe = contar(anuncios, (a) => !situacao(a));
  return {
    segmento: "vehicle",
    anunciosAtivos: anuncios.length,
    itens: [
      { chave: "acima_fipe", titulo: "Acima da FIPE", total: contar(anuncios, (a) => situacao(a) === "acima"), dica: "podem demorar mais para vender", tom: "alerta" },
      { chave: "abaixo_fipe", titulo: "Abaixo da FIPE", total: contar(anuncios, (a) => situacao(a) === "abaixo"), dica: "bons para destacar", tom: "bom" },
      { chave: "pouca_procura", titulo: "Pouca procura", total: contar(anuncios, (a) => poucaProcura(a, agora)), dica: `menos de ${PAINEL_POUCA_PROCURA_VISUALIZACOES} visualizações em mais de ${PAINEL_POUCA_PROCURA_DIAS} dias`, tom: "alerta" },
      { chave: "poucas_fotos", titulo: `Menos de ${PAINEL_MIN_FOTOS} fotos`, total: contar(anuncios, (a) => a.fotos < PAINEL_MIN_FOTOS), dica: "mais fotos, mais contatos", tom: "neutro" },
    ],
    regra: `Preço comparado à FIPE guardada no cadastro: mais de ${FIPE_MARGEM_MEDIA_PCT}% de diferença conta como acima ou abaixo (a mesma regra da página do anúncio).${semFipe ? ` ${semFipe} anúncio${semFipe === 1 ? "" : "s"} sem FIPE ficou de fora.` : ""}`,
  };
}

export function analisarImoveis(anuncios: AnuncioParaAnalise[], agora: Date): PainelAnalise {
  return {
    segmento: "property",
    anunciosAtivos: anuncios.length,
    itens: [
      { chave: "sem_video", titulo: "Sem vídeo", total: contar(anuncios, (a) => !a.temVideo), dica: "vídeo ajuda a decidir a visita", tom: "neutro" },
      { chave: "poucas_fotos", titulo: `Menos de ${PAINEL_MIN_FOTOS} fotos`, total: contar(anuncios, (a) => a.fotos < PAINEL_MIN_FOTOS), dica: "mais fotos, mais contatos", tom: "neutro" },
      { chave: "descricao_curta", titulo: "Descrição curta", total: contar(anuncios, (a) => a.descricao < PAINEL_MIN_DESCRICAO), dica: `menos de ${PAINEL_MIN_DESCRICAO} caracteres`, tom: "alerta" },
      { chave: "pouca_procura", titulo: "Pouca procura", total: contar(anuncios, (a) => poucaProcura(a, agora)), dica: `menos de ${PAINEL_POUCA_PROCURA_VISUALIZACOES} visualizações em mais de ${PAINEL_POUCA_PROCURA_DIAS} dias`, tom: "alerta" },
    ],
    regra: `Contamos só os anúncios no ar. Pouca procura = menos de ${PAINEL_POUCA_PROCURA_VISUALIZACOES} visualizações desde que entrou no ar, há mais de ${PAINEL_POUCA_PROCURA_DIAS} dias.`,
  };
}

// ---------- Qualidade da loja (0 a 100) ----------

// Regra (mostrada na tela item a item): cada item vale os pontos abaixo. Os
// de percentual valem proporcionalmente (50% dos anúncios = metade dos
// pontos); avaliação vale nota/5. Avaliação e leads atendidos só entram se a
// loja tiver avaliação / lead para atender; aí a nota é sobre o que entrou
// (pontos ganhos ÷ pontos possíveis × 100). "✓" a partir de 80% (ou 4
// estrelas); abaixo disso "!".
export const PESOS_QUALIDADE = {
  verificada: 20,
  logo: 10,
  fotos: 25,
  descricao: 20,
  avaliacao: 10,
  respostas: 15,
} as const;
const OK_A_PARTIR = 0.8;

export type DadosQualidade = {
  verificada: boolean;
  temLogo: boolean;
  anunciosAtivos: number;
  comFotosSuficientes: number;
  comDescricaoCompleta: number;
  avaliacoes: number;
  avaliacaoMedia?: number;
  // Leads dos últimos 30 dias criados há mais de 24 h, e quantos já saíram de "Novo".
  leadsParaResponder: number;
  leadsRespondidos: number;
};

const arred = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const um = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function notaDaLoja(d: DadosQualidade): PainelQualidade {
  const itens: PainelQualidade["itens"] = [];
  const fracao = (parte: number, todo: number) => (todo > 0 ? Math.min(1, parte / todo) : 0);

  itens.push({
    chave: "verificada",
    label: d.verificada ? "Perfil verificado" : "Perfil ainda não verificado",
    ok: d.verificada,
    pontos: d.verificada ? PESOS_QUALIDADE.verificada : 0,
    max: PESOS_QUALIDADE.verificada,
    detalhe: d.verificada ? "Selo de empresa verificada na vitrine." : "A equipe confere os dados da empresa e libera o selo.",
  });
  itens.push({
    chave: "logo",
    label: d.temLogo ? "Logo enviada" : "Sem logo",
    ok: d.temLogo,
    pontos: d.temLogo ? PESOS_QUALIDADE.logo : 0,
    max: PESOS_QUALIDADE.logo,
    detalhe: d.temLogo ? "Aparece na vitrine e nos anúncios." : "Envie a logo nesta tela.",
  });

  const fFotos = fracao(d.comFotosSuficientes, d.anunciosAtivos);
  itens.push({
    chave: "fotos",
    label: `${pct(fFotos)} dos anúncios com ${PAINEL_MIN_FOTOS} fotos ou mais`,
    ok: fFotos >= OK_A_PARTIR,
    pontos: arred(PESOS_QUALIDADE.fotos * fFotos),
    max: PESOS_QUALIDADE.fotos,
    detalhe: d.anunciosAtivos ? `${d.comFotosSuficientes} de ${um(d.anunciosAtivos, "anúncio no ar", "anúncios no ar")}.` : "Nenhum anúncio no ar.",
  });

  const fDesc = fracao(d.comDescricaoCompleta, d.anunciosAtivos);
  itens.push({
    chave: "descricao",
    label: `${pct(fDesc)} dos anúncios com descrição completa`,
    ok: fDesc >= OK_A_PARTIR,
    pontos: arred(PESOS_QUALIDADE.descricao * fDesc),
    max: PESOS_QUALIDADE.descricao,
    detalhe: d.anunciosAtivos
      ? `${d.comDescricaoCompleta} de ${um(d.anunciosAtivos, "anúncio", "anúncios")} com ${PAINEL_MIN_DESCRICAO} caracteres ou mais.`
      : "Nenhum anúncio no ar.",
  });

  if (d.avaliacoes > 0 && d.avaliacaoMedia !== undefined) {
    const media = Math.max(0, Math.min(5, d.avaliacaoMedia));
    itens.push({
      chave: "avaliacao",
      label: `Avaliação média ${media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      ok: media >= 5 * OK_A_PARTIR,
      pontos: arred((PESOS_QUALIDADE.avaliacao * media) / 5),
      max: PESOS_QUALIDADE.avaliacao,
      detalhe: `${um(d.avaliacoes, "avaliação publicada", "avaliações publicadas")}.`,
    });
  }

  if (d.leadsParaResponder > 0) {
    const f = fracao(d.leadsRespondidos, d.leadsParaResponder);
    itens.push({
      chave: "respostas",
      label: `${pct(f)} dos leads atendidos`,
      ok: f >= OK_A_PARTIR,
      pontos: arred(PESOS_QUALIDADE.respostas * f),
      max: PESOS_QUALIDADE.respostas,
      detalhe: `${d.leadsRespondidos} de ${um(d.leadsParaResponder, "lead", "leads")} dos últimos 30 dias (com mais de 24 h) já saíram de "Novo".`,
    });
  }

  const ganhos = itens.reduce((s, i) => s + i.pontos, 0);
  const possiveis = itens.reduce((s, i) => s + i.max, 0);
  return { nota: possiveis ? Math.round((ganhos / possiveis) * 100) : 0, itens };
}

// ---------- Plano ----------

export function situacaoDoPlano(p: {
  precisaPlano: boolean;
  trialAte: Date;
  assinatura?: { status: "active" | "past_due" | string };
  agora: Date;
}): "trial" | "em_dia" | "atrasado" | "sem_plano" | "nao_precisa" {
  if (!p.precisaPlano) return "nao_precisa";
  if (p.assinatura?.status === "past_due") return "atrasado";
  if (p.assinatura?.status === "active") return "em_dia";
  return p.trialAte > p.agora ? "trial" : "sem_plano";
}
