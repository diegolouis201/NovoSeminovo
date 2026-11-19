// Limpa as contas e anúncios de TESTE antes dos cadastros reais (decisão do
// Diego, 17/11/2026). Rodar no servidor, depois do backup e do deploy (ver
// DEPLOY.md, "Limpar dados de teste"):
//
//   docker compose exec api node dist/scripts/limpar-dados-de-teste.js             (só mostra o plano)
//   docker compose exec api node dist/scripts/limpar-dados-de-teste.js --confirmar (apaga de verdade)
//
// O que FICA: contas de administrador, a equipe do Hub (perfil no Hub ou
// papel "sales") e tudo delas; o CRM do Hub (empresas, leads de campanha,
// tarefas, ordens, chamados); financiamentos e envios ao banco; pagamentos;
// configurações, conteúdo de marketing e registros de auditoria.
// O que SAI: as demais contas e o que só existe por causa delas (anúncios com
// fotos e vídeos, lojas/imobiliárias, conversas, favoritos, alertas, avisos,
// avaliações, afiliado, cliques em lojas parceiras, arquiteto…). Linha que fica mas apontava
// para algo apagado perde só a ligação (vira vazio).
// Conta de teste com registro financeiro que o banco não deixa desligar
// (plano de anúncio pago, assinatura do Stripe ativa, financiamento que ela
// mesma registrou) não é apagada: aparece no relatório para decidir depois.
//
// Rodar de novo é seguro: o que já foi apagado não aparece mais.
import "dotenv/config";
import type { Prisma } from "@novoseminovo/db";
import { getPhotoStorage, type PhotoStorage } from "../common/storage";
import { photoFileUrls } from "../common/photo-variants";
import { PrismaService } from "../prisma/prisma.service";

type Modelo = Uncapitalize<Prisma.ModelName>;
type Where = Record<string, unknown>;
type Delegate = {
  count(args: { where: Where }): Promise<number>;
  deleteMany(args: { where: Where }): Promise<{ count: number }>;
  updateMany(args: { where: Where; data: Where }): Promise<{ count: number }>;
};
type Db = PrismaService | Prisma.TransactionClient;

interface Regra {
  tabela: string;
  modelo: Modelo;
  apagar?: Where[];
  desvincular?: { campo: string; where: Where }[];
}

export interface OpcoesLimpeza {
  confirmar: boolean;
  storage?: PhotoStorage;
  log?: (linha: string) => void;
  // Só para os testes automáticos: limita a limpeza a estas contas (o banco
  // de teste é compartilhado com outros testes). O script nunca usa.
  somenteUsuarios?: string[];
  tamanhoLote?: number;
}

export interface ContaMantida {
  id: string;
  papel: string;
  emailMascarado: string;
}

export interface ContaBloqueada {
  id: string;
  emailMascarado: string;
  motivos: string[];
}

export interface Valor {
  quantidade: number;
  valor: number;
  valorTexto: string;
}

export interface ResultadoLimpeza {
  modo: "simulacao" | "execucao";
  mantidas: ContaMantida[];
  bloqueadas: ContaBloqueada[];
  apagar: Record<string, number>;
  desvincular: Record<string, number>;
  camposObrigatorios: Record<string, number>;
  arquivos: { total: number; removidos: number; falhas: number };
  stripeAtivas: number;
  receita: {
    assinaturasAtivas: Valor;
    assinaturasDeContasDeTeste: Valor;
    planosAnuncio30d: Valor;
    planosAnuncio30dDeContasDeTeste: Valor;
    pagamentosAssinaturaDeLojasApagadas: Valor;
  };
}

const PAPEIS_DA_EQUIPE = ["admin", "sales"] as const;
const DIA_MS = 86_400_000;

export function mascararEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function dinheiro(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valor(quantidade: number, total: number): Valor {
  return { quantidade, valor: total, valorTexto: dinheiro(total) };
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

function delegate(db: Db, modelo: Modelo): Delegate {
  return (db as unknown as Record<string, Delegate>)[modelo];
}

// Ordem importa: filhos antes dos pais (o banco recusa apagar um pai com
// filho preso a ele, e a transação inteira volta atrás).
function regras(U: string[], P: string[], L: string[]): Regra[] {
  const u = { in: U };
  const p = { in: P };
  const l = { in: L };
  const conversaApagada = { OR: [{ listingId: l }, { buyerId: u }, { sellerUserId: u }] };
  return [
    { tabela: "Mensagens do chat (messages)", modelo: "message", apagar: [{ senderId: u }, { conversation: conversaApagada }] },
    { tabela: "Conversas do chat (conversations)", modelo: "conversation", apagar: [conversaApagada] },
    { tabela: "Favoritos (favorites)", modelo: "favorite", apagar: [{ userId: u }, { listingId: l }] },
    { tabela: "Denúncias (reports)", modelo: "report", apagar: [{ reporterId: u }, { listingId: l }] },
    { tabela: "Simulações de financiamento (financing_simulations)", modelo: "financingSimulation", apagar: [{ userId: u }, { listingId: l }] },
    { tabela: "Moderação (moderation_logs)", modelo: "moderationLog", apagar: [{ listingId: l }], desvincular: [{ campo: "adminId", where: { adminId: u } }] },
    {
      tabela: "Avaliações (reviews)",
      modelo: "review",
      apagar: [{ reviewerId: u }, { reviewedUserId: u }, { reviewedPartnerId: p }, { listingId: l }],
    },
    { tabela: "Leads das lojas no site (leads)", modelo: "lead", apagar: [{ listingId: l }, { partnerId: p }], desvincular: [{ campo: "buyerId", where: { buyerId: u } }] },
    { tabela: "Mensagens pelo formulário do anúncio (listing_contacts)", modelo: "listingContact", apagar: [{ listingId: l }], desvincular: [{ campo: "buyerId", where: { buyerId: u } }] },
    {
      tabela: "Financiamentos registrados (financing_deals)",
      modelo: "financingDeal",
      desvincular: [
        { campo: "listingId", where: { listingId: l } },
        { campo: "buyerUserId", where: { buyerUserId: u } },
      ],
    },
    {
      tabela: "Pedidos de financiamento / envios ao banco (financing_leads)",
      modelo: "financingLead",
      desvincular: [
        { campo: "listingId", where: { listingId: l } },
        { campo: "buyerUserId", where: { buyerUserId: u } },
      ],
    },
    { tabela: "Posts de marketing (marketing_posts)", modelo: "marketingPost", desvincular: [{ campo: "listingId", where: { listingId: l } }] },
    // Plano pago bloqueia a conta antes daqui; só sai o que nunca foi pago.
    { tabela: "Planos de anúncio não pagos (listing_boost_purchases)", modelo: "listingBoostPurchase", apagar: [{ listingId: l, status: { not: "paid" }, paidAt: null }] },
    { tabela: "Cliques em lojas parceiras (affiliate_clicks)", modelo: "affiliateClick", apagar: [{ userId: u }] },
    {
      tabela: "Imagens do arquiteto (architect_images)",
      modelo: "architectImage",
      apagar: [{ userId: u }, { session: { OR: [{ userId: u }, { listingId: l }] } }],
    },
    { tabela: "Projetos do arquiteto (architect_sessions)", modelo: "architectSession", apagar: [{ userId: u }, { listingId: l }] },
    { tabela: "Fotos (photos)", modelo: "photo", apagar: [{ listingId: l }] },
    { tabela: "Detalhes de veículo (vehicle_details)", modelo: "vehicleDetails", apagar: [{ listingId: l }] },
    { tabela: "Detalhes de imóvel (property_details)", modelo: "propertyDetails", apagar: [{ listingId: l }] },
    { tabela: "Histórico de veículo (vehicle_events)", modelo: "vehicleEvent", apagar: [{ createdByUserId: u }], desvincular: [{ campo: "verifiedByPartnerId", where: { verifiedByPartnerId: p } }] },
    { tabela: "Veículos seguidos (vehicle_follows)", modelo: "vehicleFollow", apagar: [{ userId: u }] },
    { tabela: "Veículos (vehicles)", modelo: "vehicle", desvincular: [{ campo: "currentOwnerId", where: { currentOwnerId: u } }] },
    { tabela: "Anúncios (listings)", modelo: "listing", apagar: [{ id: l }] },
    { tabela: "Assinaturas das lojas (subscriptions)", modelo: "subscription", apagar: [{ partnerId: p }] },
    { tabela: "Feeds de integração (integration_feeds)", modelo: "integrationFeed", apagar: [{ partnerId: p }] },
    { tabela: "Chaves de API das lojas (partner_api_keys)", modelo: "partnerApiKey", apagar: [{ partnerId: p }] },
    { tabela: "Sócios das lojas (partner_socios)", modelo: "partnerSocio", apagar: [{ partnerId: p }] },
    { tabela: "NPS das lojas no site (nps_responses)", modelo: "npsResponse", apagar: [{ partnerId: p }] },
    { tabela: "Pesquisas NPS por e-mail (nps_email_surveys)", modelo: "npsEmailSurvey", apagar: [{ partnerId: p }, { userId: u }] },
    { tabela: "Equipe das lojas (partner_members)", modelo: "partnerMember", apagar: [{ partnerId: p }, { userId: u }] },
    {
      tabela: "Empresas do CRM (sales_prospects)",
      modelo: "salesProspect",
      desvincular: [
        { campo: "partnerId", where: { partnerId: p } },
        { campo: "ownerId", where: { ownerId: u } },
      ],
    },
    { tabela: "Ordens do CRM (crm_orders)", modelo: "crmOrder", desvincular: [{ campo: "partnerId", where: { partnerId: p } }] },
    { tabela: "Anotações do CRM (sales_notes)", modelo: "salesNote", desvincular: [{ campo: "authorId", where: { authorId: u } }] },
    { tabela: "Tarefas do Hub (hub_tasks)", modelo: "hubTask", desvincular: [{ campo: "assigneeId", where: { assigneeId: u } }] },
    {
      tabela: "Comissões de afiliado (affiliate_commissions)",
      modelo: "affiliateCommission",
      apagar: [{ affiliate: { userId: u } }],
      desvincular: [{ campo: "partnerId", where: { partnerId: p } }],
    },
    { tabela: "Cliques de afiliado por dia (affiliate_click_days)", modelo: "affiliateClickDay", apagar: [{ affiliate: { userId: u } }] },
    {
      tabela: "Indicação de afiliado em contas que ficam (users)",
      modelo: "user",
      desvincular: [{ campo: "referredByAffiliateId", where: { id: { notIn: U }, referredByAffiliate: { userId: u } } }],
    },
    { tabela: "Afiliados (affiliates)", modelo: "affiliate", apagar: [{ userId: u }] },
    { tabela: "Lojas/imobiliárias (partners)", modelo: "partner", apagar: [{ id: p }] },
    { tabela: "Avisos (notifications)", modelo: "notification", apagar: [{ userId: u }] },
    { tabela: "Celulares para notificação (push_devices)", modelo: "pushDevice", apagar: [{ userId: u }] },
    { tabela: "Buscas salvas e alertas (saved_searches)", modelo: "savedSearch", apagar: [{ userId: u }] },
    { tabela: "Conversas com a IA (agent_conversations)", modelo: "agentConversation", desvincular: [{ campo: "userId", where: { userId: u } }] },
    { tabela: "Contatos de marketing (marketing_contacts)", modelo: "marketingContact", desvincular: [{ campo: "userId", where: { userId: u } }] },
    { tabela: "Contas (users)", modelo: "user", apagar: [{ id: u }] },
  ];
}

function somar(destino: Record<string, number>, chave: string, n: number) {
  if (n) destino[chave] = (destino[chave] ?? 0) + n;
}

async function contarRegras(db: Db, lista: Regra[], apagar: Record<string, number>, desvincular: Record<string, number>) {
  for (const regra of lista) {
    const d = delegate(db, regra.modelo);
    const apagarWhere = regra.apagar ? { OR: regra.apagar } : undefined;
    if (apagarWhere) somar(apagar, regra.tabela, await d.count({ where: apagarWhere }));
    for (const item of regra.desvincular ?? []) {
      const where = apagarWhere ? { AND: [item.where, { NOT: apagarWhere }] } : item.where;
      somar(desvincular, regra.tabela, await d.count({ where }));
    }
  }
}

async function aplicarRegras(db: Db, lista: Regra[], apagar: Record<string, number>, desvincular: Record<string, number>) {
  for (const regra of lista) {
    const d = delegate(db, regra.modelo);
    if (regra.apagar) somar(apagar, regra.tabela, (await d.deleteMany({ where: { OR: regra.apagar } })).count);
    for (const item of regra.desvincular ?? []) {
      somar(desvincular, regra.tabela, (await d.updateMany({ where: item.where, data: { [item.campo]: null } })).count);
    }
  }
}

interface Plano {
  mantidas: ContaMantida[];
  bloqueadas: ContaBloqueada[];
  U: string[];
  P: string[];
  L: string[];
  stripeAtivas: number;
}

// Quem fica, quem sai e quem fica preso por registro financeiro.
async function planejar(prisma: PrismaService, somenteUsuarios?: string[]): Promise<Plano> {
  const escopo: Where = somenteUsuarios ? { id: { in: somenteUsuarios } } : {};
  const daEquipe = { OR: [{ role: { in: [...PAPEIS_DA_EQUIPE] } }, { hubMember: { isNot: null } }] };
  const equipe = await prisma.user.findMany({
    where: { AND: [escopo, daEquipe] },
    select: { id: true, role: true, email: true, hubMember: { select: { profile: true, active: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!equipe.some((u) => u.role === "admin")) {
    throw new Error("Nenhuma conta de administrador para manter: a limpeza não roda (senão ninguém conseguiria entrar no painel).");
  }
  const mantidas: ContaMantida[] = equipe.map((u) => ({
    id: u.id,
    papel: u.role === "admin" ? "administrador" : u.hubMember ? `equipe do Hub (${u.hubMember.profile}${u.hubMember.active ? "" : ", inativo"})` : "equipe comercial",
    emailMascarado: mascararEmail(u.email),
  }));

  const candidatos = await prisma.user.findMany({ where: { AND: [escopo, { NOT: daEquipe }] }, select: { id: true, email: true }, orderBy: { id: "asc" } });
  const emailDe = new Map(candidatos.map((c) => [c.id, c.email]));
  const motivos = new Map<string, Set<string>>();
  const bloquear = (id: string, motivo: string) => {
    if (!emailDe.has(id)) return;
    const set = motivos.get(id) ?? new Set<string>();
    set.add(motivo);
    motivos.set(id, set);
  };

  let U = candidatos.map((c) => c.id);
  let P: string[] = [];
  let L: string[] = [];
  // Bloquear uma conta pode mudar as lojas/anúncios que saem: repete até parar de mudar.
  for (;;) {
    const partners = await prisma.partner.findMany({ where: { ownerUserId: { in: U } }, select: { id: true, ownerUserId: true } });
    P = partners.map((x) => x.id);
    const donoDaLoja = new Map(partners.map((x) => [x.id, x.ownerUserId]));
    const listings = await prisma.listing.findMany({
      where: { OR: [{ ownerUserId: { in: U } }, { partnerId: { in: P } }] },
      select: { id: true, ownerUserId: true, partnerId: true },
    });
    L = listings.map((x) => x.id);
    const antes = motivos.size;

    const pagos = await prisma.listingBoostPurchase.findMany({
      where: { listingId: { in: L }, OR: [{ status: "paid" }, { paidAt: { not: null } }] },
      select: { listingId: true },
    });
    const listingPorId = new Map(listings.map((x) => [x.id, x]));
    for (const pago of pagos) {
      const listing = listingPorId.get(pago.listingId);
      if (!listing) continue;
      bloquear(listing.ownerUserId, "anúncio com plano pago (registro financeiro)");
      const dono = listing.partnerId ? donoDaLoja.get(listing.partnerId) : undefined;
      if (dono) bloquear(dono, "loja com anúncio de plano pago (registro financeiro)");
    }
    const deals = await prisma.financingDeal.findMany({ where: { registeredByUserId: { in: U } }, select: { registeredByUserId: true } });
    for (const deal of deals) bloquear(deal.registeredByUserId, "registrou um financiamento (campo obrigatório, não dá pra desligar)");
    const assinaturas = await prisma.subscription.findMany({
      where: { partnerId: { in: P }, status: { in: ["active", "past_due"] }, paymentProviderRef: { not: null } },
      select: { partnerId: true },
    });
    for (const a of assinaturas) {
      const dono = donoDaLoja.get(a.partnerId);
      if (dono) bloquear(dono, "assinatura do Stripe ativa (cancele no Stripe antes)");
    }

    if (motivos.size === antes) break;
    U = U.filter((id) => !motivos.has(id));
  }
  // As assinaturas ativas que contam são as das contas bloqueadas (que ficam).
  const stripeAtivas = await prisma.subscription.count({
    where: { partner: { ownerUserId: { in: [...motivos.keys()] } }, status: { in: ["active", "past_due"] }, paymentProviderRef: { not: null } },
  });

  const bloqueadas: ContaBloqueada[] = [...motivos.entries()].map(([id, set]) => ({ id, emailMascarado: mascararEmail(emailDe.get(id) ?? ""), motivos: [...set] }));
  return { mantidas, bloqueadas, U, P, L, stripeAtivas };
}

async function arquivosDe(prisma: PrismaService, storage: PhotoStorage, U: string[], P: string[], L: string[]): Promise<string[]> {
  const [fotos, videos, imagens, eventos, logos, avatares] = await Promise.all([
    prisma.photo.findMany({ where: { listingId: { in: L } }, select: { url: true, variantWidths: true } }),
    prisma.listing.findMany({ where: { id: { in: L }, videoUrl: { not: null } }, select: { videoUrl: true } }),
    prisma.architectImage.findMany({
      where: { OR: [{ userId: { in: U } }, { session: { OR: [{ userId: { in: U } }, { listingId: { in: L } }] } }] },
      select: { resultUrl: true },
    }),
    prisma.vehicleEvent.findMany({ where: { createdByUserId: { in: U } }, select: { photoUrls: true } }),
    prisma.partner.findMany({ where: { id: { in: P }, logoUrl: { not: null } }, select: { logoUrl: true } }),
    prisma.user.findMany({ where: { id: { in: U }, avatarUrl: { not: null } }, select: { avatarUrl: true } }),
  ]);
  const urls = [
    ...fotos.flatMap(photoFileUrls),
    ...videos.map((x) => x.videoUrl ?? ""),
    ...imagens.map((x) => x.resultUrl),
    ...eventos.flatMap((x) => x.photoUrls),
    ...logos.map((x) => x.logoUrl ?? ""),
    ...avatares.map((x) => x.avatarUrl ?? ""),
  ];
  // Só arquivo que é nosso (link de CRM/outro site fica como está).
  return [...new Set(urls.filter((url) => url && storage.owns(url)))];
}

async function receita(prisma: PrismaService, plano: Plano): Promise<ResultadoLimpeza["receita"]> {
  const desde30 = new Date(Date.now() - 30 * DIA_MS);
  const deTeste = plano.bloqueadas.map((b) => b.id);
  const [subs, planos, soltos] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "active", paymentProviderRef: { not: null }, partnerId: { notIn: plano.P } },
      select: { plan: { select: { priceMonth: true } }, partner: { select: { ownerUserId: true } } },
    }),
    prisma.listingBoostPurchase.findMany({
      where: { status: "paid", paidAt: { gte: desde30 }, listingId: { notIn: plano.L } },
      select: { amount: true, listing: { select: { ownerUserId: true } } },
    }),
    prisma.subscriptionPayment.findMany({ where: { partnerId: { in: plano.P } }, select: { amount: true, refundedAmount: true } }),
  ]);
  const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const subsTeste = subs.filter((s) => deTeste.includes(s.partner.ownerUserId));
  const planosTeste = planos.filter((x) => deTeste.includes(x.listing.ownerUserId));
  return {
    assinaturasAtivas: valor(subs.length, soma(subs.map((s) => Number(s.plan.priceMonth)))),
    assinaturasDeContasDeTeste: valor(subsTeste.length, soma(subsTeste.map((s) => Number(s.plan.priceMonth)))),
    planosAnuncio30d: valor(planos.length, soma(planos.map((x) => Number(x.amount)))),
    planosAnuncio30dDeContasDeTeste: valor(planosTeste.length, soma(planosTeste.map((x) => Number(x.amount)))),
    pagamentosAssinaturaDeLojasApagadas: valor(soltos.length, soma(soltos.map((x) => Number(x.amount) - Number(x.refundedAmount)))),
  };
}

async function camposObrigatorios(prisma: PrismaService, plano: Plano): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  somar(out, "Pagamentos de assinatura (subscription_payments.partner_id)", await prisma.subscriptionPayment.count({ where: { partnerId: { in: plano.P } } }));
  somar(
    out,
    "Comissões de afiliados que ficam (affiliate_commissions.referred_user_id)",
    await prisma.affiliateCommission.count({ where: { referredUserId: { in: plano.U }, affiliate: { userId: { notIn: plano.U } } } }),
  );
  somar(out, "NPS de lojas que ficam (nps_responses.user_id)", await prisma.npsResponse.count({ where: { userId: { in: plano.U }, partnerId: { notIn: plano.P } } }));
  return out;
}

function imprimir(log: (l: string) => void, titulo: string, contagens: Record<string, number>) {
  log(titulo);
  const linhas = Object.entries(contagens).filter(([, n]) => n > 0);
  if (!linhas.length) log("  (nada)");
  for (const [tabela, n] of linhas) log(`  ${tabela}: ${n}`);
}

function modoDaChaveStripe(): string {
  const chave = process.env.STRIPE_SECRET_KEY ?? "";
  if (!chave) return "sem chave do Stripe configurada";
  return /^(sk|rk)_test_/.test(chave) ? "a chave configurada agora é de TESTE" : "a chave configurada agora é de PRODUÇÃO (live)";
}

export async function limparDadosDeTeste(prisma: PrismaService, opcoes: OpcoesLimpeza): Promise<ResultadoLimpeza> {
  const log = opcoes.log ?? ((linha: string) => console.log(linha)); // eslint-disable-line no-console
  const storage = opcoes.storage ?? getPhotoStorage();
  const plano = await planejar(prisma, opcoes.somenteUsuarios);

  const apagar: Record<string, number> = {};
  const desvincular: Record<string, number> = {};
  await contarRegras(prisma, regras(plano.U, plano.P, plano.L), apagar, desvincular);
  const arquivos = await arquivosDe(prisma, storage, plano.U, plano.P, plano.L);
  const obrigatorios = await camposObrigatorios(prisma, plano);
  const rec = await receita(prisma, plano);

  log(`=== Limpeza dos dados de teste — ${opcoes.confirmar ? "EXECUÇÃO" : "SIMULAÇÃO (nada foi apagado)"} ===`);
  log(`Contas que FICAM (${plano.mantidas.length}):`);
  for (const m of plano.mantidas) log(`  - ${m.papel}: ${m.emailMascarado}`);
  if (plano.bloqueadas.length) {
    log(`Contas de teste que FICAM por enquanto, por registro financeiro (${plano.bloqueadas.length}) — decidir depois:`);
    for (const b of plano.bloqueadas) log(`  - ${b.emailMascarado}: ${b.motivos.join("; ")}`);
  }
  imprimir(log, "Vai APAGAR (linhas):", apagar);
  imprimir(log, "Vai DESVINCULAR (a linha fica, só perde a ligação com a conta/anúncio/loja de teste):", desvincular);
  if (Object.keys(obrigatorios).length) imprimir(log, "Ficam com o id antigo (campo obrigatório no banco, não dá pra deixar vazio):", obrigatorios);
  log(`Arquivos a apagar (fotos e cópias WebP, vídeos, logos, avatares, imagens do arquiteto): ${arquivos.length}`);
  log(`Stripe: o banco não guarda se a assinatura é de teste ou produção; ${modoDaChaveStripe()}.`);
  if (plano.stripeAtivas) {
    log(`ATENÇÃO: ${plano.stripeAtivas} assinatura(s) do Stripe ainda ativa(s) em conta(s) de teste — cancele no Stripe antes. Essas contas ficam até lá.`);
  } else {
    log("Nenhuma assinatura do Stripe ativa em contas de teste.");
  }
  log("Receita que continua contando na Jornada do Hub depois da limpeza:");
  log(`  Assinaturas ativas pagas: ${rec.assinaturasAtivas.quantidade} (${rec.assinaturasAtivas.valorTexto}/mês), das quais de contas de teste: ${rec.assinaturasDeContasDeTeste.quantidade} (${rec.assinaturasDeContasDeTeste.valorTexto}/mês)`);
  log(`  Planos de anúncio pagos em 30 dias: ${rec.planosAnuncio30d.quantidade} (${rec.planosAnuncio30d.valorTexto}), dos quais de contas de teste: ${rec.planosAnuncio30dDeContasDeTeste.quantidade} (${rec.planosAnuncio30dDeContasDeTeste.valorTexto})`);
  if (rec.pagamentosAssinaturaDeLojasApagadas.quantidade) {
    log(`  Pagamentos de assinatura de lojas de teste que ficam guardados (contam no Financeiro do Hub): ${rec.pagamentosAssinaturaDeLojasApagadas.quantidade} (${rec.pagamentosAssinaturaDeLojasApagadas.valorTexto})`);
  }

  const base = { mantidas: plano.mantidas, bloqueadas: plano.bloqueadas, camposObrigatorios: obrigatorios, stripeAtivas: plano.stripeAtivas, receita: rec };
  if (!opcoes.confirmar) {
    log("Nada foi apagado. Para apagar de verdade, rode de novo com --confirmar.");
    return { ...base, modo: "simulacao", apagar, desvincular, arquivos: { total: arquivos.length, removidos: 0, falhas: 0 } };
  }

  // Execução: lotes de contas, cada lote numa transação. Os arquivos só saem
  // depois que o banco confirmou o lote.
  const feitoApagar: Record<string, number> = {};
  const feitoDesvincular: Record<string, number> = {};
  const contagemArquivos = { total: 0, removidos: 0, falhas: 0 };
  for (const lote of lotes(plano.U, opcoes.tamanhoLote ?? 25)) {
    const P = (await prisma.partner.findMany({ where: { ownerUserId: { in: lote } }, select: { id: true } })).map((x) => x.id);
    const L = (await prisma.listing.findMany({ where: { OR: [{ ownerUserId: { in: lote } }, { partnerId: { in: P } }] }, select: { id: true } })).map((x) => x.id);
    const urls = await arquivosDe(prisma, storage, lote, P, L);
    const loteApagar: Record<string, number> = {};
    const loteDesvincular: Record<string, number> = {};
    await prisma.$transaction(
      async (tx) => {
        // Última conferência, dentro da transação: nunca apaga conta da equipe nem pagamento.
        const daEquipe = await tx.user.count({ where: { id: { in: lote }, OR: [{ role: { in: [...PAPEIS_DA_EQUIPE] } }, { hubMember: { isNot: null } }] } });
        if (daEquipe) throw new Error("Recusado: o lote incluía conta de administrador ou da equipe do Hub.");
        const pagos = await tx.listingBoostPurchase.count({ where: { listingId: { in: L }, OR: [{ status: "paid" }, { paidAt: { not: null } }] } });
        if (pagos) throw new Error("Recusado: apareceu plano de anúncio pago no meio da limpeza. Rode de novo para refazer o plano.");
        await aplicarRegras(tx, regras(lote, P, L), loteApagar, loteDesvincular);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    for (const [k, n] of Object.entries(loteApagar)) somar(feitoApagar, k, n);
    for (const [k, n] of Object.entries(loteDesvincular)) somar(feitoDesvincular, k, n);
    for (const url of urls) {
      contagemArquivos.total += 1;
      try {
        await storage.remove(url);
        contagemArquivos.removidos += 1;
      } catch (error) {
        contagemArquivos.falhas += 1;
        log(`  Não foi possível apagar o arquivo ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  imprimir(log, "APAGADO (linhas):", feitoApagar);
  imprimir(log, "DESVINCULADO:", feitoDesvincular);
  log(`Arquivos: ${contagemArquivos.removidos} apagado(s), ${contagemArquivos.falhas} com erro.`);
  if (plano.U.length) {
    await prisma.opsReport.create({
      data: {
        agent: "script:limpar-dados-de-teste",
        kind: "limpeza_dados_teste",
        body: `Limpeza dos dados de teste: ${plano.U.length} conta(s) apagada(s), ${plano.bloqueadas.length} guardada(s) por registro financeiro.`,
        data: { apagado: feitoApagar, desvinculado: feitoDesvincular, arquivos: contagemArquivos },
      },
    });
  }
  log("PRONTO.");
  return { ...base, modo: "execucao", apagar: feitoApagar, desvincular: feitoDesvincular, arquivos: contagemArquivos };
}

async function main() {
  const args = process.argv.slice(2);
  const desconhecidos = args.filter((a) => a !== "--confirmar");
  if (desconhecidos.length) throw new Error(`Opção desconhecida: ${desconhecidos.join(" ")}. Use só --confirmar (ou nada, para simular).`);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await limparDadosDeTeste(prisma, { confirmar: args.includes("--confirmar") });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Limpeza não executada:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
