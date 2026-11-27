// Regras sem zod usadas pelo navegador em toda página do site (origem da
// visita, aviso de cookies, Pixel da Meta e links seguros). Ficam num arquivo
// separado porque o pacote sai em CommonJS (sem tree-shaking): o componente
// do navegador que importa daqui (@novoseminovo/shared-types/dist/navegador)
// não leva junto o contrato inteiro nem o zod. index.ts reexporta tudo, então
// API e demais telas continuam importando da raiz do pacote.

// De onde a pessoa veio (cadastro, leads, financiamento). O site grava no
// cookie ACQUISITION_COOKIE a última origem que não foi "direto" (link com
// utm_*, ?ref= de afiliado, ou o site de onde ela clicou) e repassa à API no
// header ACQUISITION_HEADER, no formato "origem|meio|campanha".
export const ACQUISITION_COOKIE = "ns_origem";
export const ACQUISITION_HEADER = "x-ns-origem";
export const ACQUISITION_MAX_AGE = 90 * 24 * 60 * 60;

export const ACQUISITION_SOURCES = {
  google: "Google (busca)",
  google_ads: "Google Ads",
  instagram: "Instagram",
  facebook: "Facebook",
  meta_ads: "Anúncio Meta (Instagram/Facebook)",
  tiktok: "TikTok",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  afiliado: "Afiliados",
  email: "E-mail",
  prospeccao: "Prospecção por e-mail (CRM)",
  outros_buscadores: "Outros buscadores",
  outros_sites: "Outros sites",
  direto: "Direto (digitou o endereço)",
} as const;
export type AcquisitionSource = keyof typeof ACQUISITION_SOURCES;
// Meio "lead_form" = a pessoa preencheu o formulário dentro do Instagram/
// Facebook (Lead Ads), sem passar pelo site.
export const META_LEAD_FORM_MEDIUM = "lead_form";
export function originChannelLabel(canal: string | null | undefined, meio?: string | null): string | undefined {
  if (!canal) return undefined;
  if (meio === META_LEAD_FORM_MEDIUM) return "Formulário Meta (Instagram/Facebook)";
  return ACQUISITION_SOURCES[canal as AcquisitionSource] ?? canal;
}
// content = anúncio (utm_content), term = público/conjunto (utm_term),
// clickId = id do clique da Meta (fbclid). Todos opcionais: cookie antigo
// (origem|meio|campanha) continua valendo.
export type Acquisition = { source: AcquisitionSource; medium?: string; campaign?: string; content?: string; term?: string; clickId?: string };

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsocial|paid_social|ads?|display|cpm)$/i;

function cleanPart(value: string | null | undefined, max = 60): string | undefined {
  const text = (value ?? "").trim().toLowerCase().replace(/[|\s]+/g, "_").replace(/[<>"'`]/g, "").slice(0, max);
  return text || undefined;
}

// fbclid diferencia maiúsculas: só tira o que não é letra, número, _ ou -.
function cleanClickId(value: string | null | undefined): string | undefined {
  const text = (value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 255);
  return text || undefined;
}

// Chave para casar a campanha do site (utm_campaign) com o nome da campanha
// no gerenciador de anúncios (Windsor): mesma regra do cookie — minúsculas,
// espaços viram "_", até 60 caracteres. "Lojas Novembro" = "lojas_novembro".
export function campaignKey(name: string | null | undefined): string | undefined {
  return cleanPart(name);
}

// Classifica a chegada: utm_source tem prioridade, depois ?ref= de afiliado,
// depois o site de onde veio (document.referrer). Sem nada disso = direto.
export function classifyAcquisition(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  ref?: string | null;
  referrer?: string | null;
  ownHost?: string;
}): Acquisition {
  const detail = { content: cleanPart(input.utmContent, 100), term: cleanPart(input.utmTerm, 100), clickId: cleanClickId(input.fbclid) };
  const base = classifyBase(input);
  return dropEmpty({ ...base, ...detail });
}

function dropEmpty(value: Acquisition): Acquisition {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Acquisition;
}

function classifyBase(input: Parameters<typeof classifyAcquisition>[0]): Acquisition {
  const medium = cleanPart(input.utmMedium);
  const campaign = cleanPart(input.utmCampaign);
  const utm = cleanPart(input.utmSource);
  const paid = medium ? PAID_MEDIUMS.test(medium) : false;
  if (utm) {
    if (/afiliad|affiliate/.test(utm)) return { source: "afiliado", medium, campaign };
    if (/^(ig|instagram)/.test(utm)) return { source: paid ? "meta_ads" : "instagram", medium, campaign };
    if (/^(fb|facebook|meta)/.test(utm)) return { source: paid ? "meta_ads" : "facebook", medium, campaign };
    if (/^google/.test(utm)) return { source: paid ? "google_ads" : "google", medium, campaign };
    if (/tiktok/.test(utm)) return { source: "tiktok", medium, campaign };
    if (/youtube|^yt/.test(utm)) return { source: "youtube", medium, campaign };
    if (/whats|^wa$/.test(utm)) return { source: "whatsapp", medium, campaign };
    // E-mails de prospecção do CRM do Hub (sequências): utm_source=prospeccao.
    if (/^prospec/.test(utm)) return { source: "prospeccao", medium, campaign };
    if (/mail|newsletter/.test(utm)) return { source: "email", medium, campaign };
    return { source: "outros_sites", medium: medium ?? utm, campaign };
  }
  if (input.ref) return { source: "afiliado", medium: "link", campaign: cleanPart(input.ref) };
  let host = "";
  try {
    host = input.referrer ? new URL(input.referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  if (!host || (input.ownHost && host.endsWith(input.ownHost.replace(/^www\./, "")))) {
    // A Meta põe fbclid em todo link que sai do Facebook/Instagram; sem utm e
    // sem site de origem (navegador do app não manda), conta como Facebook.
    return cleanClickId(input.fbclid) ? { source: "facebook", medium: "social" } : { source: "direto" };
  }
  if (/(^|\.)google\./.test(host)) return { source: "google", medium: "organic" };
  if (/instagram\.com$/.test(host)) return { source: "instagram", medium: "social" };
  if (/(facebook\.com|fb\.me|fb\.com)$/.test(host)) return { source: "facebook", medium: "social" };
  if (/tiktok\.com$/.test(host)) return { source: "tiktok", medium: "social" };
  if (/(youtube\.com|youtu\.be)$/.test(host)) return { source: "youtube", medium: "social" };
  if (/(whatsapp\.com|wa\.me)$/.test(host)) return { source: "whatsapp", medium: "social" };
  if (/(bing\.com|yahoo\.|duckduckgo\.com|ecosia\.org)/.test(host)) return { source: "outros_buscadores", medium: "organic" };
  return { source: "outros_sites", medium: "referral", campaign: cleanPart(host) };
}

// "origem|meio|campanha" e, quando houver, "|anúncio|público|clique". Sem o
// detalhe novo o texto fica igual ao formato antigo.
export function serializeAcquisition(value: Acquisition): string {
  const parts = [value.source, value.medium ?? "", value.campaign ?? ""];
  if (value.content || value.term || value.clickId) parts.push(value.content ?? "", value.term ?? "", value.clickId ?? "");
  return parts.join("|");
}

export function parseAcquisition(raw: string | null | undefined): Acquisition | undefined {
  if (!raw) return undefined;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // já veio decodificado
  }
  const [source, medium, campaign, content, term, clickId] = text.slice(0, 1000).split("|");
  if (!source || !(source in ACQUISITION_SOURCES)) return undefined;
  return dropEmpty({
    source: source as AcquisitionSource,
    medium: cleanPart(medium),
    campaign: cleanPart(campaign),
    content: cleanPart(content, 100),
    term: cleanPart(term, 100),
    clickId: cleanClickId(clickId),
  });
}

// Meta Pixel + API de Conversões (Etapa 2a de marketing). Dormente até o
// ID do pixel e o token estarem configurados; só com o "Aceitar" dos cookies.
// O site repassa à API, nos cabeçalhos META_HEADERS, o aceite, o id do evento
// (o mesmo que o navegador usa no fbq — a Meta junta os dois e conta uma vez),
// os cookies _fbp/_fbc da Meta e a página. CONSENT_COOKIE espelha a escolha
// do aviso de cookies para o servidor do site conseguir ler.
export const CONSENT_COOKIE = "ns_consent";
export const META_EVENT_COOKIE = "ns_meta_evt";
export const META_HEADERS = {
  consent: "x-ns-consent",
  eventId: "x-ns-event-id",
  fbp: "x-ns-fbp",
  fbc: "x-ns-fbc",
  pageUrl: "x-ns-page-url",
} as const;
export const META_EVENT_NAMES = ["Lead", "CompleteRegistration"] as const;
export type MetaEventName = (typeof META_EVENT_NAMES)[number];
// Categoria do evento (custom_data.content_category) — nunca dado pessoal.
export const META_CONTENT_CATEGORIES = ["lojas", "veiculo", "imovel", "conta"] as const;
export type MetaContentCategory = (typeof META_CONTENT_CATEGORIES)[number];
export type MetaQueuedEvent = { name: MetaEventName; eventId: string; category?: MetaContentCategory };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMetaPixelId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{5,20}$/.test(value);
}

export function cleanMetaEventId(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length <= 64 && UUID_RE.test(value) ? value : undefined;
}

// Cookie _fbp do pixel: fb.<subdomínio>.<criação em ms>.<aleatório>.
export function cleanFbp(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length <= 100 && /^fb\.[0-2]\.\d{10,16}\.\d{1,25}$/.test(value) ? value : undefined;
}

// Cookie _fbc: fb.<subdomínio>.<criação em ms>.<fbclid>.
export function cleanFbc(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length <= 600 && /^fb\.[0-2]\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(value) ? value : undefined;
}

// Fila de eventos para o navegador disparar depois de uma ação que deu certo
// (inclusive quando a página muda, como no cadastro): "nome:id:categoria,...".
export function serializeMetaEventQueue(events: MetaQueuedEvent[]): string {
  return events
    .slice(-5)
    .map((event) => `${event.name}:${event.eventId}:${event.category ?? ""}`)
    .join(",");
}

export function parseMetaEventQueue(raw: string | null | undefined): MetaQueuedEvent[] {
  if (!raw) return [];
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // já veio decodificado
  }
  return text
    .slice(0, 1000)
    .split(",")
    .flatMap((item): MetaQueuedEvent[] => {
      const [name, id, category] = item.split(":");
      const eventId = cleanMetaEventId(id);
      if (!eventId || !name || !(META_EVENT_NAMES as readonly string[]).includes(name)) return [];
      if (category && !(META_CONTENT_CATEGORIES as readonly string[]).includes(category)) return [];
      return [category ? { name: name as MetaEventName, eventId, category: category as MetaContentCategory } : { name: name as MetaEventName, eventId }];
    })
    .slice(0, 5);
}

// ---------------- Links seguros ----------------
// Caminho do próprio site (redirecionar depois do login, link do chat).
// "//x.com" e "/\x.com" o navegador abre como outro site; "%2F%2F" idem.
export function safeInternalPath(value: string | undefined | null, fallback: string): string {
  const path = String(value ?? "");
  if (!/^\/(?![\/\\])/.test(path)) return fallback;
  if (/[\\\s]/.test(path) || /%2f|%5c/i.test(path.split(/[?#]/)[0]!)) return fallback;
  return path;
}

// Link para fora que o chat dos assistentes pode mostrar como clicável.
const TRUSTED_LINK_HOSTS = /^(?:[a-z0-9-]+\.)*novoseminovo\.com\.br$/;
export function isTrustedExternalLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && TRUSTED_LINK_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Programa de afiliados — influenciadores e parceiros indicam pelo link
// novoseminovo.com.br/?ref=CODIGO (ou o código no cadastro) e ganham comissão
// sobre o que os indicados pagam. As regras (percentuais e prazos) ficam
// aqui porque aparecem na página pública do programa e são as mesmas que a
// API usa pra calcular.
export const AFFILIATE_RULES = {
  // Mensalidade de loja/imobiliária/construtora indicada: % de cada fatura paga…
  partnerSubscriptionRate: 20,
  // …durante os primeiros N meses desde a primeira fatura.
  partnerSubscriptionMonths: 12,
  // Plano pago de anúncio de pessoa física (Flex/Turbo/Nitro): % do valor.
  listingPlanRate: 20,
  // O link vale por N dias (cookie) até a pessoa se cadastrar.
  cookieDays: 60,
  // Comissão fica "em análise" N dias (estornos/chargebacks) antes de liberar.
  holdDays: 30,
  // Valor mínimo disponível pra pedir o pagamento (Pix).
  minPayout: 50,
} as const;

export const AFFILIATE_CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

// Código do vendedor da equipe comercial (?vendedor=CODIGO).
export const SALES_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

// ---------------- Marketing operacional ----------------
// Interesses da caixa de novidades por e-mail (rodapé do site).
export const MARKETING_INTERESTS = {
  geral: "Novidades em geral",
  comprar_carro: "Quer comprar carro",
  comprar_imovel: "Quer comprar ou alugar imóvel",
  vender: "Quer vender (pessoa física)",
  loja: "Loja, imobiliária ou corretor",
} as const;
export type MarketingInterest = keyof typeof MARKETING_INTERESTS;

// ---------------- Formulário da campanha para lojas (/para-lojas/comecar) ----------------
export const CAMPAIGN_BUSINESS_TYPES = { loja: "Loja de veículos", imobiliaria: "Imobiliária", corretor: "Corretor de imóveis" } as const;
export type CampaignBusinessType = keyof typeof CAMPAIGN_BUSINESS_TYPES;
export const CAMPAIGN_CONSENT_TEXT = "Autorizo o NovoSeminovo a entrar em contato comigo por WhatsApp, telefone ou e-mail para falar sobre a plataforma.";

// ---------------- Dinheiro ----------------
// Valor em R$ no padrão brasileiro ("R$ 1.234,56").
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ---------------- Marketing do Hub ----------------
// Redes de cada conteúdo (o Hub mostra o nome no navegador).
export const MKT_REDES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", google: "Google (Perfil da Empresa)", linkedin: "LinkedIn", email: "E-mail", whatsapp: "WhatsApp", meta_ads: "Meta Ads", google_ads: "Google Ads", tiktok_ads: "TikTok Ads" } as const;
