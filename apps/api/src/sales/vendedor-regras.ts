import {
  LOSS_CATEGORIES,
  OBJECOES,
  RascunhoModeloSchema,
  VENDEDOR_TITULO,
  DIAS_SUPERVISIONADO,
  type EtapaSugerida,
  type LossCategory,
  type MotivoEscalar,
  type Objecao,
  type VendedorAutonomia,
  type VendedorNumeros,
} from "@novoseminovo/shared-types";
import { TERMOS_PROIBIDOS_REGEX } from "./termos-proibidos";

// Regras puras dos vendedores IA (testadas em vendedor-regras.spec.ts).
// Tudo que vem de fora (e-mail da empresa, saída do modelo) passa por aqui
// antes de virar qualquer ação: o modelo só sugere, o código decide.

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------------ e-mail recebido

export type TipoEntrada = "resposta" | "aquecimento" | "automatica" | "devolvido";
export type EmailParaClassificar = { de: string; assunto: string; texto: string; cabecalhos: Record<string, string> };

// Aquecimento (warm-up) do Mailerfind/Smartlead: e-mails trocados entre
// caixas para "esquentar" o remetente. Têm cabeçalho próprio ou uma etiqueta
// no assunto/corpo (configurável em PROSPECCAO_WARMUP_TAGS). Nunca responder.
export function classificarEntrada(m: EmailParaClassificar, opcoes: { etiquetasAquecimento?: string[] } = {}): TipoEntrada {
  const cab = Object.fromEntries(Object.entries(m.cabecalhos).map(([k, v]) => [k.toLowerCase(), String(v ?? "")]));
  const assunto = sem(m.assunto ?? "");
  const de = (m.de ?? "").toLowerCase();

  if (Object.keys(cab).some((k) => /warm-?_?up/.test(k)) || Object.values(cab).some((v) => /warm-?_?up/i.test(v) && /mailerfind|smartlead|instantly|lemwarm|warm/i.test(v))) return "aquecimento";
  const etiquetas = (opcoes.etiquetasAquecimento ?? []).map((e) => e.trim()).filter((e) => e.length >= 4);
  if (etiquetas.some((e) => m.assunto?.includes(e) || m.texto?.includes(e))) return "aquecimento";

  if (/^(mailer-daemon|postmaster|mail-daemon)@/.test(de) || /report-type=delivery-status/i.test(cab["content-type"] ?? "")) return "devolvido";
  if (/undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|nao foi possivel entregar|falha na entrega|mensagem nao entregue|delivery failure/.test(assunto)) return "devolvido";

  const auto = cab["auto-submitted"];
  if ((auto && auto.toLowerCase() !== "no") || cab["x-autoreply"] || cab["x-autorespond"] || /^(auto_reply|bulk|junk)$/i.test(cab.precedence ?? "")) return "automatica";
  if (/^(resposta automatica|automatic reply|auto(matic)?[- ]?reply|out of (the )?office|ausente|fora do escritorio|ferias|estou de ferias)\b/.test(assunto) || /\b(resposta automatica|out of office)\b/.test(assunto)) return "automatica";
  return "resposta";
}

// "SAIR", "me tire da lista", "descadastrar", "unsubscribe"... = sair (sem IA).
export function pedidoDeSaida(texto: string): boolean {
  const t = sem(texto).trim();
  const primeira = t.split(/\n/).find((l) => l.trim())?.trim() ?? "";
  if (/^(sair|remover|remova|stop|parar|unsubscribe|descadastrar)[.!]*$/.test(primeira)) return true;
  return /\b(me (tire|tira|remova|remove|exclua|descadastr\w*)|(tire|tira|remova|remove|exclua)[- ]me|descadastr\w*|unsubscribe|nao (quero|desejo) (mais )?receber|pare(m)? de (me )?(mandar|enviar)|para(m)? de (me )?(mandar|enviar)|remover (da|desta) lista|sair (da|desta) lista)\b/.test(t);
}

// Casos que vão direto para uma pessoa, sem chamar a IA (decisão do Diego).
export function motivoEscalar(texto: string): MotivoEscalar | undefined {
  const t = sem(texto);
  if (/\b(porra|caralho|merda|idiota|imbecil|vagabund\w*|fdp|vai se f\w*|vai tomar|lixo de|otario\w*|babaca)\b/.test(t)) return "agressivo";
  if (/\b(lgpd|anpd|advogad\w*|process(o|ar|arei)|judicial|juridic\w*|meus dados|dados pessoais|apag(ar|uem|ue) (os )?(meus|nossos)|exclu(ir|sao) (dos |de )?(meus |nossos )?dados|onde (voces )?(pegaram|conseguiram|acharam))\b/.test(t)) return "juridico";
  if (/\b(reclama\w*|procon|insatisfeit\w*|absurdo|spam|denunci\w*|reclame aqui)\b/.test(t)) return "reclamacao";
  if (/\b(desconto|abatimento|preco especial|condicao especial|condicoes especiais|mais barato|fazer por menos|faz por menos|\d{1,3} ?% ?(de )?(off|desconto))\b/.test(t)) return "desconto";
  if (/\b(financiamento|financiar|financia|credito|emprestimo|consorcio|parcelar o carro)\b/.test(t)) return "financiamento";
  if (/\b(me liga|me ligue|ligue|ligar|ligacao|telefonema|me telefon\w*|reuniao|videochamada|chamada de video|call|meet|zoom|agendar|marcar um horario)\b/.test(t)) return "ligacao";
  return undefined;
}

export function perguntaSeRobo(texto: string): boolean {
  const t = sem(texto);
  return /\b(robo|robozinho|bot|chatbot|inteligencia artificial|pessoa de verdade|pessoa real|ser humano|humano|resposta automatica)\b/.test(t) || /(^|\b)(e|eh|sao|voce e|vc e|isso e|tu e)( uma?)? ia\b/.test(t);
}

// Telefone brasileiro com DDD (fixo ou celular) → 55DDDNÚMERO.
function telefoneBr(texto: string): string | undefined {
  const m = texto.match(/(?:\+?55[\s.-]?)?\(?([1-9]\d)\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/);
  if (!m) return undefined;
  return `55${m[1]}${m[2]}${m[3]}`;
}

// A empresa pediu para continuar no WhatsApp (e deu o número, ou é o do card).
export function extrairWhatsapp(texto: string, telefoneDoCard?: string | null): { numero: string } | undefined {
  const t = sem(texto);
  if (!/\b(whats\s?app|whats|zap|wpp|zapzap)\b/.test(t)) return undefined;
  const numero = telefoneBr(texto) ?? (telefoneDoCard ? telefoneBr(telefoneDoCard) : undefined);
  return numero ? { numero } : undefined;
}

// Só o que a pessoa escreveu agora: sem a citação do e-mail anterior, sem
// caractere de controle/direção, no máximo 4.000 caracteres.
export function limparCorpo(texto: string): string {
  const linhas = (texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const fim = linhas.findIndex(
    (l) =>
      /^\s*>/.test(l) ||
      /^\s*(em|on)\s.+(escreveu|wrote)\s*:\s*$/i.test(l) ||
      /^\s*-{2,}\s*(original message|mensagem original|forwarded message|mensagem encaminhada)\s*-{2,}/i.test(l) ||
      /^\s*(de|from)\s*:\s.+/i.test(l),
  );
  const proprio = (fim >= 0 ? linhas.slice(0, fim) : linhas).join("\n");
  return proprio
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

// ------------------------------------------------------------ links

const SITE = /^https:\/\/(www\.)?novoseminovo\.com\.br(\/[^\s]*)?$/i;
const URL_OU_DOMINIO = /\b(?:(?:https?|ftp):\/\/[^\s<>"')]+|(?:javascript|data|vbscript):[^\s<>"')]+|www\.[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|br|net|org|io|ly|me|co|app|site|online|xyz|info|link)(?:\/[^\s<>"')]*)?)/gi;

// Só link do próprio site; a página de cadastro ganha o UTM do vendedor.
export function higienizarLinks(texto: string, slug: string): { texto: string; removidos: number } {
  let removidos = 0;
  const saida = texto.replace(URL_OU_DOMINIO, (bruto) => {
    const pont = bruto.match(/[.,;:!?)]+$/)?.[0] ?? "";
    const url = pont ? bruto.slice(0, -pont.length) : bruto;
    if (!/^https?:\/\//i.test(url) && /^novoseminovo\.com\.br/i.test(url)) return `https://${url}${pont}`;
    const seguro = url.replace(/^http:\/\//i, "https://");
    if (!SITE.test(seguro)) {
      removidos++;
      return `[link removido]${pont}`;
    }
    const u = new URL(seguro);
    if (u.hostname.toLowerCase() !== "novoseminovo.com.br" && u.hostname.toLowerCase() !== "www.novoseminovo.com.br") {
      removidos++;
      return `[link removido]${pont}`;
    }
    if (u.pathname.replace(/\/+$/, "") === "/para-lojas/comecar") {
      return `https://novoseminovo.com.br/para-lojas/comecar?utm_source=prospeccao&utm_medium=email&utm_campaign=${encodeURIComponent(slug)}${pont}`;
    }
    return `https://novoseminovo.com.br${u.pathname}${pont}`;
  });
  return { texto: saida, removidos };
}

// ------------------------------------------------------------ rascunho da IA

// O que o roteiro proíbe prometer ou citar (desconto, financiamento, nomes
// de parceiros, programas encerrados, "regional"...).
const PROIBIDO = /\b(desconto\w*|abatimento|regional|financiamento\w*|financiar|credito|emprestimo|\d{1,3} ?%|vendas? garantid\w*|garant\w* (de )?(vendas?|visitas?|clientes?)|vai vender|venda certa)\b/;

export function termosProibidos(texto: string): boolean {
  return PROIBIDO.test(sem(texto)) || TERMOS_PROIBIDOS_REGEX.test(sem(texto));
}

export type RascunhoFinal = { texto: string; objecao: Objecao; etapa: EtapaSugerida; escalar?: MotivoEscalar; followupDias: number };

const ASSINATURA_ALHEIA = /^\s*(abra[cç]os?|att\.?|atenciosamente|obrigad[oa]|um abra[cç]o|at[ée] mais|sds|saudações)[,.!]?\s*$|^\s*(diego|nina|lara|dani|caio|jo[aã]o)\b.*$|^\s*(equipe )?novoseminovo\s*$/i;

function assinar(texto: string, nome: string): string {
  const linhas = texto.trim().split("\n");
  // Tira a despedida/assinatura que o modelo escreveu (às vezes com o nome do dono).
  while (linhas.length && (ASSINATURA_ALHEIA.test(linhas[linhas.length - 1]!) || !linhas[linhas.length - 1]!.trim())) linhas.pop();
  return `${linhas.join("\n").trim()}\n\n${nome}, ${VENDEDOR_TITULO}`.trim();
}

// Confere a saída do modelo (zod), troca links, assina com o nome do
// vendedor e decide se vai para o dono. Nunca lança erro.
export function finalizarRascunho(bruto: unknown, ctx: { nome: string; slug: string; entrada: string }): RascunhoFinal {
  const r = RascunhoModeloSchema.safeParse(bruto);
  if (!r.success) return { texto: "", objecao: "outra", etapa: "manter", escalar: "incerto", followupDias: 2 };
  const s = r.data;
  let texto = s.reply_text.replace(/\r\n?/g, "\n").trim();
  let escalar: MotivoEscalar | undefined = s.escalate.needed ? (s.escalate.reason ?? "incerto") : undefined;
  if (!texto && !escalar) escalar = "incerto";
  if (termosProibidos(texto)) escalar = "fora_do_roteiro";
  texto = higienizarLinks(texto, ctx.slug).texto;
  if (texto && perguntaSeRobo(ctx.entrada) && !/assistente virtual/i.test(texto)) {
    texto = `Sou a ${ctx.nome}, assistente virtual da equipe comercial da NovoSeminovo (não sou uma pessoa). Se preferir falar com alguém da equipe, é só me dizer que eu passo o seu contato.\n\n${texto}`;
  }
  if (texto) texto = assinar(texto, ctx.nome);
  return { texto: texto.slice(0, 3500), objecao: s.detected_objection, etapa: s.suggested_stage, escalar, followupDias: s.next_followup_days };
}

// ------------------------------------------------------------ etapas

const DESTINO: Record<Exclude<EtapaSugerida, "manter">, string> = { contatado: "em_contato", negociacao: "interessada", perdido: "perdida" };
const PERMITIDAS: Record<string, readonly string[]> = {
  a_abordar: ["em_contato"],
  em_contato: ["interessada", "perdida"],
  interessada: ["perdida"],
};

// Etapa que o código aplica a partir da sugestão (ou nada). "ganho" não
// existe: só o cadastro no site marca ganho.
export function etapaDestino(atual: string, sugerida: EtapaSugerida, card: { parceira?: boolean } = {}): string | undefined {
  if (card.parceira || sugerida === "manter") return undefined;
  const para = DESTINO[sugerida as keyof typeof DESTINO];
  if (!para) return undefined;
  return PERMITIDAS[atual]?.includes(para) ? para : undefined;
}

export function categoriaPerda(objecao: Objecao): LossCategory {
  const mapa: Partial<Record<Objecao, LossCategory>> = { ja_anuncia: "concorrencia", sem_interesse: "sem_interesse", quanto_custa: "preco", sem_tempo: "timing", pouco_estoque: "pouco_estoque" };
  return mapa[objecao] ?? "outro";
}

// ------------------------------------------------------------ rodízio / autonomia

// Cada card vai para o vendedor com menos cards; no empate, a ordem da lista.
export function distribuirRodizio(cards: string[], vendedores: { id: string; carga: number }[]): Map<string, string> {
  const r = new Map<string, string>();
  if (!vendedores.length) return r;
  const carga = vendedores.map((v) => ({ ...v }));
  for (const c of cards) {
    let melhor = carga[0]!;
    for (const v of carga) if (v.carga < melhor.carga) melhor = v;
    r.set(c, melhor.id);
    melhor.carga++;
  }
  return r;
}

export function podeAutomatico(noArDesde: Date | null | undefined, agora = new Date()): boolean {
  return Boolean(noArDesde) && agora.getTime() - noArDesde!.getTime() >= DIAS_SUPERVISIONADO * 86_400_000;
}

export function diasParaAutomatico(noArDesde: Date | null | undefined, agora = new Date()): number {
  if (!noArDesde) return DIAS_SUPERVISIONADO;
  return Math.max(0, Math.ceil((noArDesde.getTime() + DIAS_SUPERVISIONADO * 86_400_000 - agora.getTime()) / 86_400_000));
}

// Rotina = sem escalar, objeção conhecida, sem tirar o card do funil.
const ROTINA: readonly Objecao[] = ["nenhuma", "ja_anuncia", "sem_tempo", "quanto_custa", "como_funciona", "nao_confia", "pouco_estoque"];
export function saiSozinho(r: { escalar?: MotivoEscalar; objecao: Objecao; etapa: EtapaSugerida }, autonomia: VendedorAutonomia): boolean {
  return autonomia === "automatico" && !r.escalar && ROTINA.includes(r.objecao) && r.etapa !== "perdido";
}

// Seg–sex, 9h às 18h de Brasília (UTC−3 o ano todo).
export function dentroDoHorarioRespostas(d: Date): boolean {
  const l = new Date(d.getTime() - 3 * 3_600_000);
  const dia = l.getUTCDay();
  const min = l.getUTCHours() * 60 + l.getUTCMinutes();
  return dia >= 1 && dia <= 5 && min >= 9 * 60 && min < 18 * 60;
}

// ------------------------------------------------------------ painel

export type DadosPainel = {
  primeirosEnvios: Date[];
  cards: { etapa: string; respondeu: boolean; parceira: boolean; objecao: string | null; motivoPerda: string | null; contatado: boolean }[];
  respostasEnviadas: { recebidaEm: Date; enviadaEm: Date }[];
  aprovacoesPendentes: number;
  custoHojeBrl: number;
  custoMesBrl: number;
  rascunhosHoje: number;
  emailsHoje: number;
  fila: number;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : undefined);
const contar = (xs: string[]) =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));

export function numerosDoVendedor(d: DadosPainel, agora = new Date()): VendedorNumeros {
  const desde = (dias: number) => d.primeirosEnvios.filter((x) => agora.getTime() - x.getTime() < dias * 86_400_000).length;
  const inicioHoje = new Date(Date.UTC(...((): [number, number, number] => {
    const l = new Date(agora.getTime() - 3 * 3_600_000);
    return [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()];
  })()) + 3 * 3_600_000);
  const contatadosTotal = d.primeirosEnvios.length;
  const respostas = d.cards.filter((c) => c.respondeu).length;
  const ganhos = d.cards.filter((c) => c.parceira).length;
  const tempos = d.respostasEnviadas.map((r) => (r.enviadaEm.getTime() - r.recebidaEm.getTime()) / 3_600_000).filter((h) => h >= 0);
  return {
    fila: d.fila,
    contatadosHoje: d.primeirosEnvios.filter((x) => x >= inicioHoje).length,
    contatados7d: desde(7),
    contatados30d: desde(30),
    contatadosTotal,
    respostas,
    taxaResposta: pct(respostas, contatadosTotal),
    emNegociacao: d.cards.filter((c) => !c.parceira && c.etapa === "interessada").length,
    ganhos,
    conversao: pct(ganhos, contatadosTotal),
    perdidos: contar(d.cards.filter((c) => !c.parceira && c.etapa === "perdida").map((c) => LOSS_CATEGORIES[(c.motivoPerda ?? "outro") as LossCategory] ?? "Outro")).map(({ k, v }) => ({ motivo: k, quantidade: v })),
    objecoes: contar(d.cards.map((c) => c.objecao).filter((o): o is string => Boolean(o) && o !== "nenhuma")).map(({ k, v }) => ({ objecao: OBJECOES[k as Objecao] ?? k, quantidade: v })),
    aprovacoesPendentes: d.aprovacoesPendentes,
    tempoMedioRespostaHoras: tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : undefined,
    custoIaHojeBrl: Math.round(d.custoHojeBrl * 100) / 100,
    custoIaMesBrl: Math.round(d.custoMesBrl * 100) / 100,
    rascunhosHoje: d.rascunhosHoje,
    emailsHoje: d.emailsHoje,
  };
}
