import { z } from "zod";

// Contrato compartilhado entre apps/web, apps/mobile (futuro) e apps/api.
// Deliberadamente independente do @prisma/client: só a API fala com o banco;
// o front-end fala com este contrato.

export const AssetType = z.enum(["vehicle", "property"]);
export type AssetType = z.infer<typeof AssetType>;

export const SellerType = z.enum(["individual", "partner"]);
export type SellerType = z.infer<typeof SellerType>;

export const BadgeTone = z.enum(["green", "blue", "orange", "purple", "pink"]);
export type BadgeTone = z.infer<typeof BadgeTone>;

export const Role = z.enum(["buyer", "individual_seller", "partner_agent", "partner_owner", "admin"]);
export type Role = z.infer<typeof Role>;

// Autenticação (apps/api/src/auth) — a senha nunca trafega de volta neste contrato.
// E-mail sempre normalizado (trim + minúsculas) antes de validar o formato:
// sem isso, "Diego@X.com" e "diego@x.com" viram duas contas diferentes e a
// checagem de duplicidade no registro (unique constraint do Postgres é
// case-sensitive) não pega o conflito.
const EmailSchema = z.string().trim().toLowerCase().email("E-mail inválido");

export const RegisterInputSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: EmailSchema,
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  // Opcional: sem ele o botão "Chamar no WhatsApp" não aparece nos anúncios
  // da pessoa (ver ListingDetail.sellerPhone) — não trava o cadastro.
  phone: z.string().min(8, "Informe um telefone válido com DDD").optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: Role,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// POST /auth/login também devolve um JWT — é o que apps/web guarda na sessão
// do Auth.js e reenvia como Bearer token nas chamadas autenticadas à API
// (favoritos, e o que mais vier a exigir "quem está logado").
export const LoginResponseSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const BadgeSchema = z.object({
  label: z.string(),
  tone: BadgeTone,
});
export type Badge = z.infer<typeof BadgeSchema>;

// O card de anúncio (site e app) só precisa disto — já formatado para exibição.
export const ListingSummarySchema = z.object({
  id: z.string(),
  assetType: AssetType,
  title: z.string(),
  subtitle: z.string().optional(),
  priceLabel: z.string(),
  location: z.string(),
  image: z.string().url().optional(),
  badge: BadgeSchema.optional(),
  sellerType: SellerType.optional(),
  // Só quando sellerType é "partner" — link para a vitrine da loja (/lojas/[slug])
  // e se ela já passou pela verificação (ainda sem fila de admin para isso —
  // ver Etapa 1). Nunca afirme "verificada" sem checar este campo.
  partnerSlug: z.string().optional(),
  partnerVerified: z.boolean().optional(),
});
export type ListingSummary = z.infer<typeof ListingSummarySchema>;

export const VehicleFiltersSchema = z.object({
  assetType: z.literal("vehicle"),
  brand: z.string().optional(),
  model: z.string().optional(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  mileageMax: z.number().int().optional(),
  transmission: z.enum(["manual", "automatic"]).optional(),
  fuelType: z.enum(["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"]).optional(),
  city: z.string().optional(),
});
export type VehicleFilters = z.infer<typeof VehicleFiltersSchema>;

export const PropertyFiltersSchema = z.object({
  assetType: z.literal("property"),
  propertyType: z.enum(["house", "apartment", "land", "commercial"]).optional(),
  purpose: z.enum(["sale", "rent"]).optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  bedroomsMin: z.number().int().optional(),
  areaMin: z.number().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
});
export type PropertyFilters = z.infer<typeof PropertyFiltersSchema>;

export const SearchFiltersSchema = z.discriminatedUnion("assetType", [
  VehicleFiltersSchema,
  PropertyFiltersSchema,
]);
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// Busca salva (/busca -> "Salvar esta busca"). Deliberadamente mais restrito
// que SearchFiltersSchema acima: só os campos que GET /listings de fato
// filtra hoje (ver ListingsService.search) — marca/modelo/câmbio/combustível/
// tipo de imóvel ainda não têm filtro implementado, então não faz sentido
// deixar salvar um filtro que a busca vai ignorar ao reabrir.
export const SavedSearchFiltersSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  yearMin: z.number().optional(),
  yearMax: z.number().optional(),
  bedroomsMin: z.number().optional(),
});
export type SavedSearchFilters = z.infer<typeof SavedSearchFiltersSchema>;

export const CreateSavedSearchInputSchema = z.object({
  assetType: AssetType,
  filters: SavedSearchFiltersSchema,
});
export type CreateSavedSearchInput = z.infer<typeof CreateSavedSearchInputSchema>;

// alertEnabled já nasce no schema pensando em avisar por e-mail quando um
// anúncio novo bate com os filtros — isso ainda não existe (sem worker/envio
// de e-mail no projeto, ver Etapa 3). Por ora é só uma preferência que a
// pessoa liga/desliga, sem efeito nenhum ainda; o toggle na UI deixa isso
// explícito.
export const SavedSearchSchema = z.object({
  id: z.string(),
  assetType: AssetType,
  filters: SavedSearchFiltersSchema,
  alertEnabled: z.boolean(),
  createdAt: z.string(),
});
export type SavedSearch = z.infer<typeof SavedSearchSchema>;

export const UpdateSavedSearchInputSchema = z.object({
  alertEnabled: z.boolean(),
});
export type UpdateSavedSearchInput = z.infer<typeof UpdateSavedSearchInputSchema>;

export const SpecItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type SpecItem = z.infer<typeof SpecItemSchema>;

// Bloco de financiamento já exibido na página do anúncio (simulação padrão,
// 20% de entrada). Distinto de FinancingSimulationResult abaixo, que é o
// resultado de uma simulação sob medida que a pessoa pede em seguida.
export const ListingFinancingSummarySchema = z.object({
  price: z.string(),
  // Preço bruto (não formatado) do anúncio — o front-end precisa dele pra
  // mandar em POST /listings/:id/financing-simulations quando a pessoa
  // ajusta entrada/parcelas; price acima é só pra exibição.
  priceValue: z.number(),
  downPayment: z.string(),
  installments: z.string(),
  rate: z.string(),
});
export type ListingFinancingSummary = z.infer<typeof ListingFinancingSummarySchema>;

export const ListingStatus = z.enum([
  "draft",
  "pending_review",
  "active",
  "paused",
  "sold",
  "rejected",
  "expired",
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const ListingDetailSchema = ListingSummarySchema.extend({
  description: z.string(),
  specs: z.array(SpecItemSchema),
  financing: ListingFinancingSummarySchema,
  // Só para o site decidir se mostra "Conversar no chat" (não faz sentido
  // falar com o próprio anúncio) — nunca é o e-mail nem outro dado sensível.
  ownerUserId: z.string(),
  // Só para o dono ver "seu anúncio está em análise" — a busca pública nunca
  // devolve um anúncio que não esteja active, então esse status aqui só
  // importa quando quem está olhando é o próprio dono.
  status: ListingStatus,
  // Presente só quando o dono cadastrou telefone (RegisterInputSchema.phone é
  // opcional) — o site só mostra "Chamar no WhatsApp" quando isto vem preenchido.
  sellerPhone: z.string().optional(),
  // "not_eligible": visitante anônimo, dono do próprio anúncio, ou nunca
  // conversou sobre ele. "can_review": já conversou e ainda não avaliou.
  // "already_reviewed": já avaliou — a API recusa uma segunda vez.
  reviewStatus: z.enum(["not_eligible", "can_review", "already_reviewed"]),
});
export type ListingDetail = z.infer<typeof ListingDetailSchema>;

// "Meus anúncios" precisa do status (a busca pública, não — só mostra ativos).
export const MyListingSummarySchema = ListingSummarySchema.extend({
  status: ListingStatus,
});
export type MyListingSummary = z.infer<typeof MyListingSummarySchema>;

// Criar anúncio (MVP): sem geração automática por IA, sem consulta a
// Detran/FIPE por placa — isso é Fase 2 (ver Etapa 1). A pessoa preenche os
// campos à mão; marca/modelo do veículo são texto livre (a API cria a
// entrada no catálogo se ainda não existir).
const listingCoreFields = {
  title: z.string().min(5, "Escreva um título com pelo menos 5 caracteres"),
  description: z.string().min(20, "Descreva o anúncio com pelo menos 20 caracteres"),
  price: z.number().positive("Informe um preço válido"),
  city: z.string().min(2, "Informe a cidade"),
  state: z.string().length(2, "Use a sigla do estado (ex.: MG)"),
  neighborhood: z.string().optional(),
};

export const CreateVehicleInputSchema = z.object({
  assetType: z.literal("vehicle"),
  ...listingCoreFields,
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  version: z.string().optional(),
  yearManufacture: z.number().int().min(1950).max(2100),
  yearModel: z.number().int().min(1950).max(2100),
  mileage: z.number().int().min(0),
  transmission: z.enum(["manual", "automatic"]),
  fuelType: z.enum(["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"]),
  color: z.string().min(1, "Informe a cor"),
  doors: z.number().int().min(2).max(6).optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleInputSchema>;

export const CreatePropertyInputSchema = z.object({
  assetType: z.literal("property"),
  ...listingCoreFields,
  propertyType: z.enum(["house", "apartment", "land", "commercial"]),
  purpose: z.enum(["sale", "rent"]),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  parkingSpots: z.number().int().min(0).optional(),
  areaM2: z.number().positive("Informe a área em m²"),
  condoFee: z.number().min(0).optional(),
  iptu: z.number().min(0).optional(),
  streetAddress: z.string().min(5, "Informe o endereço"),
});
export type CreatePropertyInput = z.infer<typeof CreatePropertyInputSchema>;

export const CreateListingInputSchema = z.discriminatedUnion("assetType", [
  CreateVehicleInputSchema,
  CreatePropertyInputSchema,
]);
export type CreateListingInput = z.infer<typeof CreateListingInputSchema>;

// "sold" é terminal: ListingsService.updateStatus não deixa sair dele — uma
// vez vendido, o jeito de voltar a vender é criar um anúncio novo.
export const UpdateListingStatusInputSchema = z.object({
  status: z.enum(["active", "paused", "sold"]),
});
export type UpdateListingStatusInput = z.infer<typeof UpdateListingStatusInputSchema>;

// Calculadora do MVP — sem integração bancária real (ver Etapa 3).
export const FinancingSimulationInputSchema = z.object({
  listingId: z.string(),
  assetPrice: z.number().positive(),
  downPaymentPct: z.number().min(0).max(0.9),
  // 360 cobre financiamento imobiliário (até 30 anos); veículo usa no máximo
  // 84 no front-end, mas o schema não distingue por assetType.
  installments: z.number().int().min(1).max(360),
});
export type FinancingSimulationInput = z.infer<typeof FinancingSimulationInputSchema>;

export const FinancingSimulationResultSchema = z.object({
  downPaymentLabel: z.string(),
  installmentLabel: z.string(),
  rateLabel: z.string(),
});
export type FinancingSimulationResult = z.infer<typeof FinancingSimulationResultSchema>;

// Chat comprador↔vendedor (Etapa 1). MVP: sem WebSocket ainda — a página
// reenvia a lista de mensagens a cada envio via revalidatePath (ver Etapa 3,
// "Socket.IO" fica para quando o volume de conversas justificar).
export const MessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  isMine: z.boolean(),
  senderName: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSummarySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  otherPartyName: z.string(),
  lastMessagePreview: z.string().optional(),
  lastMessageAt: z.string().optional(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ConversationDetailSchema = ConversationSummarySchema.extend({
  messages: z.array(MessageSchema),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export const SendMessageInputSchema = z.object({
  body: z.string().min(1, "Escreva uma mensagem").max(2000, "Mensagem muito longa"),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// Painel do parceiro (lojista/imobiliária) — Etapa 1. MVP: sem convite de
// equipe, sem upload em lote, sem cobrança de plano de verdade (o schema já
// tem Plan/Subscription para quando isso for construído).
export const PartnerType = z.enum(["dealership", "real_estate_agency", "broker"]);
export type PartnerType = z.infer<typeof PartnerType>;

export const CreatePartnerInputSchema = z.object({
  type: PartnerType,
  legalName: z.string().min(3, "Informe a razão social ou nome fantasia"),
  document: z.string().min(11, "Informe o CNPJ ou CPF"),
  description: z.string().optional(),
  address: z.string().optional(),
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerInputSchema>;

export const PartnerStatsSchema = z.object({
  activeListings: z.number().int(),
  totalListings: z.number().int(),
  leadsTotal: z.number().int(),
  leadsNew: z.number().int(),
  leadsNegotiating: z.number().int(),
  leadsWon: z.number().int(),
});
export type PartnerStats = z.infer<typeof PartnerStatsSchema>;

export const PartnerSchema = z.object({
  id: z.string(),
  type: PartnerType,
  legalName: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  address: z.string().optional(),
  verified: z.boolean(),
  planName: z.string().optional(),
  stats: PartnerStatsSchema,
});
export type Partner = z.infer<typeof PartnerSchema>;

export const ReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  reviewerName: z.string(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const CreateReviewInputSchema = z.object({
  rating: z.number().int().min(1, "Dê uma nota de 1 a 5").max(5, "Dê uma nota de 1 a 5"),
  comment: z.string().trim().max(500, "Comentário muito longo").optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInputSchema>;

export const PartnerStorefrontSchema = z.object({
  legalName: z.string(),
  type: PartnerType,
  description: z.string().optional(),
  address: z.string().optional(),
  verified: z.boolean(),
  listings: z.array(ListingSummarySchema),
  averageRating: z.number().optional(),
  reviews: z.array(ReviewSchema),
});
export type PartnerStorefront = z.infer<typeof PartnerStorefrontSchema>;

export const LeadStatus = z.enum(["new", "negotiating", "won", "lost"]);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadSource = z.enum(["chat", "whatsapp", "phone"]);
export type LeadSource = z.infer<typeof LeadSource>;

export const LeadSummarySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  source: LeadSource,
  status: LeadStatus,
  createdAt: z.string(),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const UpdateLeadStatusInputSchema = z.object({
  status: LeadStatus,
});
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusInputSchema>;

// Moderação (Etapa 1 — painel do admin). MVP: um único papel "admin" sem
// níveis; toda regra é manual, nenhuma automática ainda.
export const PendingListingSchema = z.object({
  id: z.string(),
  assetType: AssetType,
  title: z.string(),
  priceLabel: z.string(),
  location: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  createdAt: z.string(),
});
export type PendingListing = z.infer<typeof PendingListingSchema>;

export const ModerateListingInputSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});
export type ModerateListingInput = z.infer<typeof ModerateListingInputSchema>;

export const PendingPartnerSchema = z.object({
  id: z.string(),
  type: PartnerType,
  legalName: z.string(),
  document: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  createdAt: z.string(),
});
export type PendingPartner = z.infer<typeof PendingPartnerSchema>;

// Denúncia de anúncio (Report já existia no schema do banco desde a Etapa 2,
// sem nenhum código usando — igual LeadSource.whatsapp estava até o botão de
// WhatsApp ser ligado). "open" é o único status que aparece na fila do admin;
// as outras duas são o resultado da revisão.
export const ReportStatus = z.enum(["open", "reviewed", "dismissed"]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const CreateReportInputSchema = z.object({
  reason: z.string().trim().min(10, "Descreva o motivo com pelo menos 10 caracteres"),
});
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;

export const PendingReportSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  reporterName: z.string(),
  reporterEmail: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});
export type PendingReport = z.infer<typeof PendingReportSchema>;

export const UpdateReportStatusInputSchema = z.object({
  status: z.enum(["reviewed", "dismissed"]),
});
export type UpdateReportStatusInput = z.infer<typeof UpdateReportStatusInputSchema>;

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
