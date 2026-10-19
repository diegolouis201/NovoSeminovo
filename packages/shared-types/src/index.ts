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

// Lista única — usada no filtro de busca, no formulário de anunciar e na
// criação do anúncio — pra nunca ter o enum repetido divergindo entre eles.
export const PropertyType = z.enum(["house", "apartment", "land", "commercial", "penthouse", "farm", "warehouse"]);
export type PropertyType = z.infer<typeof PropertyType>;

export const PropertyFiltersSchema = z.object({
  assetType: z.literal("property"),
  propertyType: PropertyType.optional(),
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

// Foto de anúncio. Upload em disco local por enquanto (ver
// apps/api/src/main.ts) — trocar por S3/R2 é a migração de produção sugerida
// no README, sem precisar mudar este contrato (url continua sendo só uma
// string, local ou de um bucket).
export const PhotoSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().optional(),
});
export type Photo = z.infer<typeof PhotoSchema>;

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
  // Todas as fotos do anúncio, capa primeiro (ver Photo.isCover). Vazio até o
  // dono enviar alguma em /anuncio/:id/fotos — a UI cai pro emoji placeholder
  // nesse caso (ver ListingSummary.image, que usa a mesma primeira foto). O
  // id de cada uma é só para a própria página de gerenciar fotos (excluir
  // uma foto específica); a galeria pública só usa a url.
  photos: z.array(PhotoSchema),
  // Só em anúncio de veículo cuja placa já foi informada (ver
  // CreateVehicleInputSchema.plate) — o site usa isto pra mostrar "Ver
  // histórico completo deste veículo" linkando pro Passaporte Digital.
  vehicleId: z.string().optional(),
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
// entrada no catálogo se ainda não existir). A placa (abaixo, em
// CreateVehicleInputSchema) já liga o anúncio ao Passaporte Digital do
// veículo (ver VehicleProfileSchema) — sem consultar Detran ainda, só pra
// reconhecer "é o mesmo carro de um anúncio anterior".
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
  // Opcional de propósito — não barra quem não tem a placa em mãos agora,
  // mas sem ela a API não consegue reconhecer "é o mesmo carro de um
  // anúncio anterior" (ver VehiclesService.resolveForListing na API).
  plate: z.string().min(7, "Informe uma placa válida").max(8).optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleInputSchema>;

// Diferenciais soltos (ver PropertyDetails.features) — lista fixa pequena,
// escolhida a dedo a partir do pedido original, em vez de texto livre: dá
// pra mostrar como checklist no formulário e manter uma legenda PT-BR
// sempre consistente (ver PROPERTY_FEATURE_OPTIONS no front).
export const PropertyFeature = z.enum([
  "pool",
  "balcony",
  "barbecue",
  "elevator",
  "gourmet_area",
  "garden",
  "furnished",
  "concierge",
]);
export type PropertyFeature = z.infer<typeof PropertyFeature>;

export const CreatePropertyInputSchema = z.object({
  assetType: z.literal("property"),
  ...listingCoreFields,
  propertyType: PropertyType,
  purpose: z.enum(["sale", "rent"]),
  bedrooms: z.number().int().min(0).optional(),
  suites: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  parkingSpots: z.number().int().min(0).optional(),
  floor: z.number().int().min(0).optional(),
  areaM2: z.number().positive("Informe a área em m²"),
  totalAreaM2: z.number().positive().optional(),
  condoFee: z.number().min(0).optional(),
  iptu: z.number().min(0).optional(),
  features: z.array(PropertyFeature).optional(),
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

// ---------- Passaporte Digital do Veículo ----------
// "Ativo" separado do anúncio: um carro pode ter vários anúncios ao longo da
// vida, mas o Vehicle (e seu histórico) é um só, identificado pela placa.
// ownership_change e listing_published são gerados só pelo backend (nunca
// pelo próprio dono, ver CreateVehicleEventInputSchema) — o resto é
// autoanunciado até existir parceiro verificado alimentando isso de verdade.

export const VehicleEventType = z.enum([
  "ownership_change",
  "revision",
  "repair",
  "accident",
  "inspection",
  "listing_published",
  "other",
]);
export type VehicleEventType = z.infer<typeof VehicleEventType>;

export const VehicleEventSource = z.enum(["owner_reported", "partner_verified", "system"]);
export type VehicleEventSource = z.infer<typeof VehicleEventSource>;

export const VehicleEventSchema = z.object({
  id: z.string(),
  type: VehicleEventType,
  source: VehicleEventSource,
  title: z.string(),
  description: z.string().optional(),
  mileageAtEvent: z.number().optional(),
  occurredAt: z.string(),
  // Comprovante anexado na hora de registrar (ver CreateVehicleEventInputSchema) —
  // sempre tem pelo menos uma foto pra eventos autoanunciados.
  photos: z.array(z.string()),
  // Nome da oficina que confirmou (só quando source === "partner_verified"),
  // ou que foi marcada e ainda não confirmou (source ainda "owner_reported").
  verifiedByPartnerName: z.string().optional(),
});
export type VehicleEvent = z.infer<typeof VehicleEventSchema>;

export const VehicleProfileSchema = z.object({
  id: z.string(),
  brand: z.string().optional(),
  model: z.string().optional(),
  yearManufacture: z.number().optional(),
  yearModel: z.number().optional(),
  color: z.string().optional(),
  plateMasked: z.string().optional(),
  // Nº de donos registrados nesta plataforma — não é o histórico real de
  // propriedade do Detran, só o que a própria base já viu (1 + quantos
  // "ownership_change" o Vehicle acumulou).
  ownersCount: z.number(),
  // true só quando quem está vendo é o dono atual — controla se o site
  // mostra o formulário de "adicionar evento".
  isOwner: z.boolean(),
  events: z.array(VehicleEventSchema),
});
export type VehicleProfile = z.infer<typeof VehicleProfileSchema>;

// Tipos que o próprio dono pode registrar — troca de dono e publicação de
// anúncio ficam de fora de propósito (ver comentário da seção acima). Vem
// sempre como multipart (ver VehiclesController.addEvent): o comprovante
// (foto) é obrigatório e validado à parte, não dá pra expressar "pelo menos
// um arquivo" neste schema de metadados.
export const CreateVehicleEventInputSchema = z.object({
  type: z.enum(["revision", "repair", "inspection", "other"]),
  title: z.string().min(3, "Dê um título pro evento"),
  description: z.string().optional(),
  mileageAtEvent: z.number().int().min(0).optional(),
  occurredAt: z.string().optional(),
  // Oficina cadastrada (ver PartnerType.workshop) marcada como responsável
  // pelo serviço — opcional; quando informada, vira uma confirmação
  // pendente até a própria oficina validar (ver VehiclesService.confirmService).
  workshopPartnerId: z.string().optional(),
});
export type CreateVehicleEventInput = z.infer<typeof CreateVehicleEventInputSchema>;

export const WorkshopOptionSchema = z.object({
  id: z.string(),
  legalName: z.string(),
});
export type WorkshopOption = z.infer<typeof WorkshopOptionSchema>;

// Linha da fila de confirmação de uma oficina — ver /parceiro/servicos.
export const PendingServiceConfirmationSchema = z.object({
  eventId: z.string(),
  vehicleId: z.string(),
  vehicleLabel: z.string(),
  title: z.string(),
  description: z.string().optional(),
  mileageAtEvent: z.number().optional(),
  occurredAt: z.string(),
  photos: z.array(z.string()),
});
export type PendingServiceConfirmation = z.infer<typeof PendingServiceConfirmationSchema>;

// Cadastrar um veículo direto, sem precisar anunciar — pra quem quer começar
// o Passaporte Digital do carro enquanto ainda é dono (construindo o
// histórico ao longo do tempo), não só no momento de vender. Marca e modelo
// obrigatórios, resto opcional de propósito: menos campos pra preencher,
// maior chance da pessoa concluir o cadastro na hora.
export const RegisterVehicleInputSchema = z.object({
  plate: z.string().min(7, "Informe uma placa válida").max(8),
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  yearManufacture: z.number().int().min(1950).max(2100).optional(),
  yearModel: z.number().int().min(1950).max(2100).optional(),
  color: z.string().optional(),
});
export type RegisterVehicleInput = z.infer<typeof RegisterVehicleInputSchema>;

// ---------- IA no anúncio (Fase 3) ----------

// Sugestão de preço dinâmico — média/mediana de anúncios ativos parecidos já
// na própria base (sem IA nenhuma, é estatística simples). undefined quando
// a amostra é pequena demais pra significar algo.
export const PriceSuggestionSchema = z.object({
  suggestedPrice: z.number(),
  sampleSize: z.number(),
});
export type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

// Texto livre -> rascunho de anúncio via LLM (ver AiService na API). Exige
// ANTHROPIC_API_KEY configurada no backend — sem isso, o endpoint devolve
// 503 e o site esconde o gerador (mesmo padrão de STRIPE_SECRET_KEY/
// RESEND_API_KEY: funcionalidade opcional, nunca quebra sem a chave).
export const GenerateListingDraftInputSchema = z.object({
  assetType: AssetType,
  freeText: z.string().min(10, "Descreva em pelo menos algumas palavras"),
});
export type GenerateListingDraftInput = z.infer<typeof GenerateListingDraftInputSchema>;

export const ListingDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  suggestedPrice: z.number().optional(),
});
export type ListingDraft = z.infer<typeof ListingDraftSchema>;

// Mesmo padrão de PaymentsStatusSchema — o site usa isto pra decidir se
// mostra o gerador de anúncio por IA.
export const AiStatusSchema = z.object({
  aiEnabled: z.boolean(),
});
export type AiStatus = z.infer<typeof AiStatusSchema>;

// Leitura automática do CRLV (ver AiService.extractCrlvData) — todos os
// campos opcionais de propósito: o documento pode vir com foto ruim, mal
// enquadrado ou parcialmente ilegível, e a IA nunca inventa um valor que não
// conseguiu confirmar visualmente. O campo da placa só vem preenchido se
// estiver completamente legível no documento — o início que a pessoa digita
// à parte é só uma conferência, nunca uma fonte de dados adicionais (não
// existe integração com Detran neste MVP).
export const CrlvExtractResultSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  version: z.string().optional(),
  yearManufacture: z.number().int().optional(),
  yearModel: z.number().int().optional(),
  fuelType: z.enum(["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"]).optional(),
  color: z.string().optional(),
  plate: z.string().optional(),
});
export type CrlvExtractResult = z.infer<typeof CrlvExtractResultSchema>;

// Upload em lote de fotos -> IA classifica, ordena e legenda (ver
// AiService.classifyVehiclePhotos). Só reordena/legenda fotos que já existem
// no anúncio — nunca inventa uma categoria sem uma foto real por trás.
export const PhotoClassificationSchema = z.object({
  photoId: z.string(),
  caption: z.string(),
  order: z.number(),
});
export type PhotoClassification = z.infer<typeof PhotoClassificationSchema>;

export const ClassifyPhotosResultSchema = z.object({
  photos: z.array(PhotoClassificationSchema),
  coverPhotoId: z.string().optional(),
});
export type ClassifyPhotosResult = z.infer<typeof ClassifyPhotosResultSchema>;

// Reordenar/trocar capa na galeria (ver ListingsController PATCH
// /listings/:id/photos/reorder) — a pessoa sempre tem a palavra final sobre
// a sugestão automática da IA.
export const ReorderPhotosInputSchema = z.object({
  order: z.array(z.string()).min(1),
  coverPhotoId: z.string().optional(),
});
export type ReorderPhotosInput = z.infer<typeof ReorderPhotosInputSchema>;

export const UpdatePhotoCaptionInputSchema = z.object({
  caption: z.string().max(200),
});
export type UpdatePhotoCaptionInput = z.infer<typeof UpdatePhotoCaptionInputSchema>;

// Botão "qual carro é ideal pra mim?" — perfil financeiro simples vira faixa
// de orçamento (regra prática de 10-15% da renda comprometida com o carro) +
// até 5 anúncios reais do catálogo (ver ListingsService.recommendVehicle).
// Funciona mesmo sem ANTHROPIC_API_KEY (degradação graciosa: só a faixa de
// orçamento + anúncios mais próximos dela, sem o resumo consultivo da IA).
export const MainUse = z.enum(["commute", "family", "work", "leisure"]);
export type MainUse = z.infer<typeof MainUse>;

export const Priority = z.enum(["economy", "space", "comfort", "performance", "reliability"]);
export type Priority = z.infer<typeof Priority>;

export const VehicleProfileInputSchema = z.object({
  monthlyIncome: z.number().positive(),
  monthlyFixedExpenses: z.number().nonnegative(),
  availableDownPayment: z.number().nonnegative(),
  installments: z.number().int().min(12).max(84),
  mainUse: MainUse,
  familySize: z.number().int().positive().optional(),
  priority: Priority,
  preferredCity: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type VehicleProfileInput = z.infer<typeof VehicleProfileInputSchema>;

export const VehicleRecommendationSchema = z.object({
  budgetRangeMin: z.number(),
  budgetRangeMax: z.number(),
  summary: z.string(),
  recommendations: z.array(ListingSummarySchema),
});
export type VehicleRecommendation = z.infer<typeof VehicleRecommendationSchema>;

// Mesma ideia acima, pra imóvel — regra prática diferente (financiamento
// imobiliário brasileiro costuma limitar a parcela a ~30% da renda bruta,
// não os 10-15% do carro) e prioridades diferentes (ex.: abrir mão de espaço
// por localização/trânsito, conforme a matéria que inspirou a feature).
export const PropertyPriority = z.enum(["location", "space", "price", "condo_amenities", "low_maintenance"]);
export type PropertyPriority = z.infer<typeof PropertyPriority>;

export const PropertyProfileInputSchema = z.object({
  monthlyIncome: z.number().positive(),
  monthlyFixedExpenses: z.number().nonnegative(),
  availableDownPayment: z.number().nonnegative(),
  installments: z.number().int().min(12).max(420),
  householdSize: z.number().int().positive().optional(),
  preferredCity: z.string().optional(),
  preferredNeighborhood: z.string().optional(),
  minBedrooms: z.number().int().nonnegative().optional(),
  priority: PropertyPriority,
  notes: z.string().max(500).optional(),
});
export type PropertyProfileInput = z.infer<typeof PropertyProfileInputSchema>;

export const PropertyRecommendationSchema = z.object({
  budgetRangeMin: z.number(),
  budgetRangeMax: z.number(),
  summary: z.string(),
  recommendations: z.array(ListingSummarySchema),
});
export type PropertyRecommendation = z.infer<typeof PropertyRecommendationSchema>;

// Calculadora do MVP — sem integração bancária real (ver Etapa 3).
export const FinancingSimulationInputSchema = z.object({
  listingId: z.string(),
  assetPrice: z.number().positive(),
  downPaymentPct: z.number().min(0).max(0.9),
  // 420 cobre financiamento imobiliário (até 35 anos, teto de alguns
  // bancos); veículo usa no máximo 84 no front-end, mas o schema não
  // distingue por assetType.
  installments: z.number().int().min(1).max(420),
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

// Payload do WebSocket (ConversationsGateway, evento "message") — diferente
// de MessageSchema porque "isMine" não faz sentido num broadcast: quem
// recebe é que decide comparando senderId com o próprio id.
export const RealtimeMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  body: z.string(),
  createdAt: z.string(),
  senderId: z.string(),
  senderName: z.string(),
});
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;

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

// Painel do parceiro (lojista/imobiliária) — Etapa 1. MVP: sem upload em
// lote de estoque, sem cobrança de plano de verdade (o schema já tem
// Plan/Subscription para quando isso for construído).
export const PartnerType = z.enum(["dealership", "real_estate_agency", "broker", "workshop"]);
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

// Plan/Subscription já estavam no schema do banco desde a Etapa 2 — o seed
// cria um Plan e assina a loja de demonstração nele, mas `/parceiro` só lia
// (""Nenhum plano ativo ainda""); não existia como contratar um plano de
// verdade. "Contratar" aqui é uma simulação (sem gateway de pagamento
// nenhum, ver README "Próximos passos") — ativa a assinatura na hora, sem
// cobrar nada de ninguém.
export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxActiveListings: z.number().int(),
  highlightCredits: z.number().int(),
  priceLabel: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PartnerSubscriptionSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  priceLabel: z.string(),
  maxActiveListings: z.number().int(),
  highlightCredits: z.number().int(),
  currentPeriodEnd: z.string(),
});
export type PartnerSubscription = z.infer<typeof PartnerSubscriptionSchema>;

export const SubscribeToPlanInputSchema = z.object({
  planId: z.string(),
});
export type SubscribeToPlanInput = z.infer<typeof SubscribeToPlanInputSchema>;

// Cobrança de verdade via Stripe é opcional (ver README "Próximos passos"):
// sem STRIPE_SECRET_KEY configurada na API, POST /partners/mine/subscription
// continua sendo a simulação de sempre. Com a chave configurada, o front
// troca pra criar uma sessão de Checkout de verdade — PaymentsStatus é como
// ele descobre qual dos dois caminhos usar.
export const PaymentsStatusSchema = z.object({
  stripeEnabled: z.boolean(),
});
export type PaymentsStatus = z.infer<typeof PaymentsStatusSchema>;

export const CheckoutSessionResultSchema = z.object({
  url: z.string(),
});
export type CheckoutSessionResult = z.infer<typeof CheckoutSessionResultSchema>;

export const PartnerSchema = z.object({
  id: z.string(),
  type: PartnerType,
  legalName: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  address: z.string().optional(),
  verified: z.boolean(),
  subscription: PartnerSubscriptionSchema.optional(),
  stats: PartnerStatsSchema,
  // Só o dono convida/remove gente da equipe (ver /parceiro/equipe) e
  // contrata/cancela plano (ver /parceiro/plano) — um agente vê e opera o
  // painel (anúncios, leads) igual, mas essas duas abas somem pra ele.
  isOwner: z.boolean(),
});
export type Partner = z.infer<typeof PartnerSchema>;

// Convite de equipe é direto: o dono digita o e-mail de alguém que já tem
// conta na plataforma e essa pessoa vira "agent" na hora — sem link de
// convite nem e-mail transacional (não existe envio de e-mail no projeto
// ainda, ver README "Próximos passos"). Quem ainda não tem conta precisa se
// cadastrar primeiro.
export const PartnerMemberRole = z.enum(["owner", "agent"]);
export type PartnerMemberRole = z.infer<typeof PartnerMemberRole>;

export const PartnerMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: PartnerMemberRole,
});
export type PartnerMember = z.infer<typeof PartnerMemberSchema>;

export const AddPartnerMemberInputSchema = z.object({
  email: EmailSchema,
});
export type AddPartnerMemberInput = z.infer<typeof AddPartnerMemberInputSchema>;

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

// Usado só na vitrine da home ("Lojas parceiras em destaque") — por isso é
// bem mais enxuto que PartnerStorefrontSchema, que carrega anúncios e
// avaliações inteiras.
export const FeaturedPartnerSchema = z.object({
  slug: z.string(),
  legalName: z.string(),
  logoUrl: z.string().optional(),
});
export type FeaturedPartner = z.infer<typeof FeaturedPartnerSchema>;

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

// ModerationLog já existia no schema desde a Etapa 2 — AdminService.moderateListing
// sempre gravou uma linha a cada aprovação/recusão, mas nada lia de volta
// (grava e esquece). Isso vira o histórico no fim de /admin.
export const ModerationActionType = z.enum(["approved", "rejected", "suspended"]);
export type ModerationActionType = z.infer<typeof ModerationActionType>;

export const ModerationLogEntrySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  adminName: z.string(),
  action: ModerationActionType,
  reason: z.string().optional(),
  createdAt: z.string(),
});
export type ModerationLogEntry = z.infer<typeof ModerationLogEntrySchema>;

// Notification já existia no schema do banco desde a Etapa 2, sem nenhum
// código usando — mesmo padrão de "modelo morto" do Report e do SavedSearch.
// O título/corpo de cada notificação é montado no backend a partir do tipo +
// payload (nunca no front): assim um tipo novo não exige nenhuma mudança na
// tela, só um `case` a mais em `toNotification` na API.
export const NotificationType = z.enum([
  "listing_approved",
  "listing_rejected",
  "new_message",
  "partner_verified",
  "new_review",
  "saved_search_match",
  "service_confirmation_requested",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  link: z.string().optional(),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const UnreadNotificationsCountSchema = z.object({ count: z.number() });
export type UnreadNotificationsCount = z.infer<typeof UnreadNotificationsCountSchema>;

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ---------- Programa de recompensa por financiamento ----------
// Ver PartnerRebateTier/FinancingDeal no schema do banco: quando o comprador
// de um anúncio fecha financiamento (imobiliário ou veicular) por um
// parceiro financeiro, parte da comissão do correspondente bancário volta
// pra quem anunciou — PF recebe uma fatia fixa, corretor/imobiliária e
// lojista evoluem de nível pelo volume financiado acumulado em negócios
// vindos da plataforma. Ainda não há integração em tempo real com nenhum
// parceiro financeiro, então o negócio fechado é registrado manualmente
// pelo admin (ver RebatesService na API).
export const RebateReceiverType = z.enum(["individual", "dealership", "real_estate_agency", "broker"]);
export type RebateReceiverType = z.infer<typeof RebateReceiverType>;

export const FinancingDealStatus = z.enum(["registered", "paid"]);
export type FinancingDealStatus = z.infer<typeof FinancingDealStatus>;

// Anúncios candidatos ao registro de negócio fechado — só os marcados como
// "vendido" (ver RebatesService.listEligibleListings), pra não deixar o
// admin digitar um id/link à mão: ele escolhe numa lista.
export const EligibleListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  priceLabel: z.string(),
  receiverLabel: z.string(),
});
export type EligibleListing = z.infer<typeof EligibleListingSchema>;

export const RegisterFinancingDealInputSchema = z.object({
  listingId: z.string().min(1, "Selecione o anúncio"),
  financingProvider: z.string().min(2, "Informe o parceiro financeiro (ex.: Credihome)"),
  externalRef: z.string().optional(),
  assetValue: z.number().positive("Informe o valor do bem"),
  financedAmount: z.number().positive("Informe o valor financiado"),
  commissionRate: z.number().min(0).max(100).optional(),
});
export type RegisterFinancingDealInput = z.infer<typeof RegisterFinancingDealInputSchema>;

export const FinancingDealSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  receiverLabel: z.string(),
  receiverType: RebateReceiverType,
  financingProvider: z.string(),
  externalRef: z.string().optional(),
  assetValueLabel: z.string(),
  financedAmountLabel: z.string(),
  commissionRateLabel: z.string(),
  commissionAmountLabel: z.string(),
  rebatePercentLabel: z.string(),
  rebateAmountLabel: z.string(),
  status: FinancingDealStatus,
  paidAt: z.string().optional(),
  paidNote: z.string().optional(),
  createdAt: z.string(),
});
export type FinancingDeal = z.infer<typeof FinancingDealSchema>;

export const MarkFinancingDealPaidInputSchema = z.object({
  note: z.string().optional(),
});
export type MarkFinancingDealPaidInput = z.infer<typeof MarkFinancingDealPaidInputSchema>;

export const RebateTierSchema = z.object({
  id: z.string(),
  partnerType: PartnerType,
  tierOrder: z.number().int(),
  tierName: z.string(),
  minVolume: z.number(),
  minVolumeLabel: z.string(),
  rebatePercent: z.number(),
  rebatePercentLabel: z.string(),
});
export type RebateTier = z.infer<typeof RebateTierSchema>;

export const UpdateRebateTierInputSchema = z.object({
  tierName: z.string().min(1).optional(),
  minVolume: z.number().min(0).optional(),
  rebatePercent: z.number().min(0).max(100).optional(),
});
export type UpdateRebateTierInput = z.infer<typeof UpdateRebateTierInputSchema>;

export const MyRebatesSummarySchema = z.object({
  receiverType: RebateReceiverType,
  currentTierName: z.string().optional(),
  currentRebatePercentLabel: z.string(),
  cumulativeVolumeLabel: z.string().optional(),
  nextTierName: z.string().optional(),
  nextTierMinVolumeLabel: z.string().optional(),
  progressToNextTierPct: z.number().optional(),
  totalPendingLabel: z.string(),
  totalPaidLabel: z.string(),
  deals: z.array(FinancingDealSchema),
});
export type MyRebatesSummary = z.infer<typeof MyRebatesSummarySchema>;

// ---------- Perfil completo e verificação de e-mail ----------
// Cadastro inicial (/cadastro) continua mínimo (nome/e-mail/senha) — esses
// dados entram depois, na tela "Minha conta", principalmente pra viabilizar
// o pagamento do rebate de PF via Pix (precisa de CPF) e deixar o endereço
// pronto pra outras coisas (ex.: busca por padrão).
export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i]! * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

export const Gender = z.enum(["male", "female", "other", "undisclosed"]);
export type Gender = z.infer<typeof Gender>;

export const ProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  gender: Gender.optional(),
  birthDate: z.string().optional(),
  zipCode: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  emailVerified: z.boolean(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UpdateProfileInputSchema = z.object({
  name: z.string().min(2, "Informe seu nome").optional(),
  phone: z.string().optional(),
  cpf: z
    .string()
    .optional()
    .refine((value) => !value || isValidCpf(value), "CPF inválido"),
  gender: Gender.optional(),
  birthDate: z.string().optional(),
  zipCode: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const VerifyEmailInputSchema = z.object({
  code: z.string().length(6, "O código tem 6 dígitos"),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

export const SendEmailVerificationResultSchema = z.object({
  sent: z.boolean(),
});
export type SendEmailVerificationResult = z.infer<typeof SendEmailVerificationResultSchema>;
