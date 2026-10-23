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
  // Obrigatório: uma conta por pessoa (User.cpf é único). Nunca aparece no site.
  cpf: z.string({ required_error: "Informe seu CPF" }).refine((value) => isValidCpf(value), "CPF inválido"),
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
  // Busca com mapa (imóveis): preço em número pro marcador e ponto
  // APROXIMADO (~150 m do endereço real, que é privado).
  price: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
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
export const PropertyType = z.enum(["house", "apartment", "land", "commercial", "penthouse", "farm", "warehouse", "condo_house", "studio", "store", "garage"]);
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

// Planos por anúncio da pessoa física (decisão do Diego, out/2026): pagamento
// único, o anúncio fica no ar até vender em todos. Mais fotos e vídeo
// aparecem no anúncio conforme o plano; rank é a ordem na busca (destaque
// pago da loja vem antes de tudo). Loja/imobiliária não usa: o plano mensal
// dela já inclui 20 fotos, vídeo e posição básica (rank 1).
export const LISTING_TIERS = [
  { id: "free", name: "Grátis", price: 0, photos: 5, video: false, rank: 0, position: "Sem destaque na busca" },
  { id: "flex", name: "Flex", price: 39.9, photos: 10, video: true, rank: 1, position: "Posição básica na busca" },
  { id: "turbo", name: "Turbo", price: 69.9, photos: 15, video: true, rank: 2, position: "Posição intermediária na busca" },
  { id: "nitro", name: "Nitro", price: 129.9, photos: 20, video: true, rank: 3, position: "Topo da busca" },
] as const;
export type ListingTierId = (typeof LISTING_TIERS)[number]["id"];
export const ListingTierIdSchema = z.enum(["free", "flex", "turbo", "nitro"]);
export const PARTNER_LISTING_TIER = { photos: 20, video: true, rank: 1 } as const;

export function listingTier(id: string | undefined) {
  return LISTING_TIERS.find((tier) => tier.id === id) ?? LISTING_TIERS[0];
}

export const StartBoostInputSchema = z.object({ tier: z.enum(["flex", "turbo", "nitro"]) });
export type StartBoostInput = z.infer<typeof StartBoostInputSchema>;
export const StartBoostResultSchema = z.object({ url: z.string().optional(), applied: z.boolean() });
export type StartBoostResult = z.infer<typeof StartBoostResultSchema>;

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
  // Vídeo do YouTube (só o id, pra montar o player) e se o vendedor liberou
  // a simulação/contato de financiamento no anúncio.
  youtubeVideoId: z.string().optional(),
  financingEnabled: z.boolean(),
  // Plano do anúncio (pessoa física) e, só pro dono, quantas fotos ele subiu
  // a mais do que o plano mostra — pra oferecer "turbinar".
  planTier: ListingTierIdSchema,
  isPartnerListing: z.boolean(),
  hiddenPhotosCount: z.number().int().optional(),
});
export type ListingDetail = z.infer<typeof ListingDetailSchema>;

// "Meus anúncios" precisa do status (a busca pública, não — só mostra ativos).
export const MyListingSummarySchema = ListingSummarySchema.extend({
  status: ListingStatus,
  planTier: ListingTierIdSchema.optional(),
  // Anúncio de loja: destaque em uso (ver PARTNER_HIGHLIGHT_RANK).
  highlightLevel: z.enum(["none", "highlight", "super"]).optional(),
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

// Opcionais e condições do carro (estilo Webmotors) — lista fechada com
// rótulo PT-BR aqui mesmo, pra formulário, página do anúncio e filtros da
// busca usarem sempre o mesmo texto. Guardados em VehicleDetails.features /
// .conditions (String[]), então item novo não precisa de migração.
export const VEHICLE_FEATURE_OPTIONS = [
  { value: "air_conditioning", label: "Ar-condicionado" },
  { value: "heater", label: "Ar quente" },
  { value: "power_steering", label: "Direção hidráulica/elétrica" },
  { value: "power_windows", label: "Vidros elétricos" },
  { value: "power_locks", label: "Travas elétricas" },
  { value: "airbag", label: "Airbag" },
  { value: "abs", label: "Freio ABS" },
  { value: "alarm", label: "Alarme" },
  { value: "onboard_computer", label: "Computador de bordo" },
  { value: "multimedia", label: "Central multimídia" },
  { value: "rear_camera", label: "Câmera de ré" },
  { value: "parking_sensor", label: "Sensor de estacionamento" },
  { value: "cruise_control", label: "Piloto automático" },
  { value: "leather_seats", label: "Bancos de couro" },
  { value: "seat_height", label: "Banco com ajuste de altura" },
  { value: "alloy_wheels", label: "Rodas de liga leve" },
  { value: "sunroof", label: "Teto solar" },
  { value: "rear_defroster", label: "Desembaçador traseiro" },
  { value: "four_wheel_drive", label: "Tração 4x4" },
  { value: "seven_seats", label: "7 lugares" },
  { value: "side_airbags", label: "Airbags laterais" },
  { value: "digital_ac", label: "Ar-condicionado digital" },
  { value: "traction_control", label: "Controle de tração/estabilidade" },
  { value: "hill_start", label: "Assistente de partida em rampa" },
  { value: "keyless", label: "Partida sem chave" },
  { value: "start_stop", label: "Start-stop" },
  { value: "led_headlights", label: "Faróis de LED" },
  { value: "fog_lights", label: "Faróis de neblina" },
  { value: "rain_sensor", label: "Sensor de chuva" },
  { value: "electric_mirrors", label: "Retrovisores elétricos" },
  { value: "steering_controls", label: "Comandos no volante" },
  { value: "bluetooth", label: "Bluetooth" },
  { value: "gps", label: "GPS/navegador" },
  { value: "usb", label: "Entrada USB" },
  { value: "isofix", label: "Isofix" },
] as const;
// "Veículo completo" no cadastro marca estes de uma vez.
export const VEHICLE_COMPLETE_FEATURES = ["air_conditioning", "power_windows", "power_locks", "airbag", "abs", "power_steering"];

export const VEHICLE_BODY_TYPE_OPTIONS = [
  { value: "hatch", label: "Hatch" },
  { value: "sedan", label: "Sedã" },
  { value: "suv", label: "SUV" },
  { value: "pickup", label: "Picape" },
  { value: "minivan", label: "Minivan" },
  { value: "wagon", label: "Perua/SW" },
  { value: "coupe", label: "Cupê" },
  { value: "convertible", label: "Conversível" },
  { value: "van", label: "Van/Utilitário" },
] as const;
export const VehicleBodyType = z.enum(VEHICLE_BODY_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]]);

export const VEHICLE_STEERING_OPTIONS = [
  { value: "mechanical", label: "Mecânica" },
  { value: "hydraulic", label: "Hidráulica" },
  { value: "electric", label: "Elétrica" },
  { value: "electrohydraulic", label: "Eletro-hidráulica" },
] as const;
export const VehicleSteering = z.enum(VEHICLE_STEERING_OPTIONS.map((o) => o.value) as [string, ...string[]]);

// Só YouTube (o anúncio mostra o vídeo embutido pelo youtube-nocookie).
export const YOUTUBE_URL_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
export function youtubeVideoId(url: string | undefined): string | undefined {
  return url ? YOUTUBE_URL_REGEX.exec(url.trim())?.[1] : undefined;
}

export const FipeBrandSchema = z.object({ name: z.string() });
export type FipeBrand = z.infer<typeof FipeBrandSchema>;
export const VehicleFeature = z.enum(VEHICLE_FEATURE_OPTIONS.map((o) => o.value) as [string, ...string[]]);

export const VEHICLE_CONDITION_OPTIONS = [
  { value: "single_owner", label: "Único dono" },
  { value: "ipva_paid", label: "IPVA pago" },
  { value: "licensed", label: "Licenciado" },
  { value: "dealer_serviced", label: "Revisões em concessionária" },
  { value: "factory_warranty", label: "Garantia de fábrica" },
  { value: "accepts_trade", label: "Aceita troca" },
  { value: "financed", label: "Com financiamento em aberto" },
  { value: "auction", label: "Passagem por leilão" },
  { value: "collector", label: "Veículo de colecionador" },
  { value: "adapted", label: "Adaptado para PcD" },
] as const;
export const FipeVersionSchema = z.object({ code: z.number().int(), name: z.string() });
export type FipeVersion = z.infer<typeof FipeVersionSchema>;
export const FipePriceSchema = z.object({ fipeCode: z.string(), price: z.number(), versionName: z.string().optional() });
export type FipePrice = z.infer<typeof FipePriceSchema>;

export const VehicleConditionTag = z.enum(VEHICLE_CONDITION_OPTIONS.map((o) => o.value) as [string, ...string[]]);

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
  // Versão escolhida na lista da FIPE no /anunciar (código do modelo na
  // tabela) — a API busca o preço por ela em vez de adivinhar pelo nome.
  fipeModelCode: z.number().int().positive().optional(),
  bodyType: VehicleBodyType.optional(),
  steering: VehicleSteering.optional(),
  engine: z.string().max(20).optional(),
  videoUrl: z.string().regex(YOUTUBE_URL_REGEX, "Use um link de vídeo do YouTube").optional(),
  financingEnabled: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  features: z.array(VehicleFeature).max(40).optional(),
  conditions: z.array(VehicleConditionTag).max(20).optional(),
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
  videoUrl: z.string().regex(YOUTUBE_URL_REGEX, "Use um link de vídeo do YouTube").optional(),
  financingEnabled: z.boolean().optional(),
  showPhone: z.boolean().optional(),
});
export type CreatePropertyInput = z.infer<typeof CreatePropertyInputSchema>;

export const CreateListingInputSchema = z.discriminatedUnion("assetType", [
  CreateVehicleInputSchema,
  CreatePropertyInputSchema,
]);
export type CreateListingInput = z.infer<typeof CreateListingInputSchema>;

// "sold" é terminal: ListingsService.updateStatus não deixa sair dele — uma
// vez vendido, o jeito de voltar a vender é criar um anúncio novo. soldPrice
// só importa nessa transição (negociação pode fechar abaixo/acima do preço
// anunciado); a API ignora o campo pras outras transições.
export const UpdateListingStatusInputSchema = z.object({
  status: z.enum(["active", "paused", "sold"]),
  soldPrice: z.number().positive().optional(),
  costPrice: z.number().nonnegative().optional(),
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
export const PartnerType = z.enum(["dealership", "real_estate_agency", "broker", "workshop", "builder"]);

// Rótulo de cada tipo de conta PJ (painel, vitrine, admin).
export const PARTNER_TYPE_LABELS: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a)",
  workshop: "Oficina",
  builder: "Construtora",
};
export type PartnerType = z.infer<typeof PartnerType>;

// Conta PJ: o CNPJ é consultado na Receita (ver CnpjService na API) e o
// ramo de atividade (CNAE) decide o tipo — imobiliária, construtora,
// corretor, loja de veículos/concessionária. `type`/`legalName` só valem
// quando a consulta não identifica o ramo ou está fora do ar.
export const CreatePartnerInputSchema = z.object({
  type: PartnerType.optional(),
  legalName: z.string().min(3, "Informe a razão social ou nome fantasia").optional(),
  document: z.string().refine((value) => isValidCnpj(value), "CNPJ inválido"),
  description: z.string().optional(),
  address: z.string().optional(),
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerInputSchema>;

export const CnpjLookupSchema = z.object({
  cnpj: z.string(),
  legalName: z.string(),
  tradeName: z.string().optional(),
  active: z.boolean(),
  situation: z.string(),
  activity: z.string().optional(),
  detectedType: PartnerType.optional(),
  // "Concessionária", "Loja de veículos", "Imobiliária", "Construtora"…
  detectedLabel: z.string().optional(),
  // Só uma atividade secundária bateu: é sugestão, a pessoa confirma o tipo.
  detectedFromSecondary: z.boolean().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  address: z.string().optional(),
});
export type CnpjLookup = z.infer<typeof CnpjLookupSchema>;

// Cadastro de conta PJ (/cadastro, opção "Empresa"): os dados do
// responsável (CPF incluso — uma conta por pessoa) + o CNPJ.
export const RegisterCompanyInputSchema = RegisterInputSchema.extend({
  cnpj: z.string().refine((value) => isValidCnpj(value), "CNPJ inválido"),
  partnerType: PartnerType.optional(),
  // Só quando a consulta do CNPJ está fora do ar.
  legalName: z.string().min(3).optional(),
});
export type RegisterCompanyInput = z.infer<typeof RegisterCompanyInputSchema>;

export const PartnerStatsSchema = z.object({
  activeListings: z.number().int(),
  totalListings: z.number().int(),
  leadsTotal: z.number().int(),
  leadsNew: z.number().int(),
  leadsNegotiating: z.number().int(),
  leadsWon: z.number().int(),
  // CRM de vendas (ver PartnersService.getMine) — soldTotal é o histórico
  // completo, soldThisMonth/revenueThisMonthLabel olham só o mês corrente.
  // conversionRatePercent e averageTicketLabel ficam undefined sem nenhum
  // lead/venda ainda (divisão por zero), pra UI mostrar "—" em vez de 0%.
  soldTotal: z.number().int(),
  soldThisMonth: z.number().int(),
  revenueThisMonthLabel: z.string(),
  conversionRatePercent: z.number().optional(),
  averageTicketLabel: z.string().optional(),
});
export type PartnerStats = z.infer<typeof PartnerStatsSchema>;

// /parceiro/vendas — histórico de anúncios vendidos do parceiro.
export const SaleSummarySchema = z.object({
  listingId: z.string(),
  title: z.string(),
  assetType: AssetType,
  askingPriceLabel: z.string(),
  // soldPriceValue cru ao lado do label: /parceiro/vendas soma e tira média
  // em cima do número, não reconstrói a partir do texto formatado em R$.
  soldPriceValue: z.number(),
  soldPriceLabel: z.string(),
  soldAt: z.string(),
  // undefined quando o anúncio nunca chegou a ser publicado antes de vender
  // (ex.: marcado como vendido ainda em rascunho) — sem publishedAt não dá
  // pra calcular quanto tempo ficou no ar.
  daysOnMarket: z.number().int().optional(),
  // Custo informado pela loja (compra + preparação) e o lucro da venda.
  costPriceValue: z.number().optional(),
  profitValue: z.number().optional(),
});
export const UpdateSaleInputSchema = z.object({
  soldPrice: z.number().positive().optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
});
export type UpdateSaleInput = z.infer<typeof UpdateSaleInputSchema>;

export type SaleSummary = z.infer<typeof SaleSummarySchema>;

// Plan/Subscription já estavam no schema do banco desde a Etapa 2 — o seed
// cria um Plan e assina a loja de demonstração nele, mas `/parceiro` só lia
// (""Nenhum plano ativo ainda""); não existia como contratar um plano de
// verdade. "Contratar" aqui é uma simulação (sem gateway de pagamento
// nenhum, ver README "Próximos passos") — ativa a assinatura na hora, sem
// cobrar nada de ninguém.
// Regra comercial (decisão do Diego): loja de veículos, imobiliária e
// corretor anunciam à vontade nos primeiros PARTNER_TRIAL_DAYS a partir do
// cadastro; depois, só com plano em vigor — sem plano, vitrine e anúncios
// saem do ar (pausados, nunca apagados) até assinar. Pessoa física (sem loja
// cadastrada) e oficina não pagam.
export const PARTNER_TRIAL_DAYS = 90;


// O que cada tipo de conta pode anunciar (decisão do Diego): loja de carros
// só carro, imobiliária e corretor só imóvel. Pessoa física (sem loja) anuncia
// os dois. Vale no servidor (criar anúncio, integração) e no site.
export const PARTNER_ALLOWED_ASSET_TYPES: Record<string, readonly ("vehicle" | "property")[]> = {
  dealership: ["vehicle"],
  workshop: ["vehicle"],
  real_estate_agency: ["property"],
  broker: ["property"],
  builder: ["property"],
};

export function allowedAssetTypes(partnerType: string | undefined): readonly ("vehicle" | "property")[] {
  return partnerType ? PARTNER_ALLOWED_ASSET_TYPES[partnerType] ?? ["vehicle", "property"] : ["vehicle", "property"];
}

export function assetTypeNotAllowedMessage(partnerType: string): string {
  return allowedAssetTypes(partnerType).includes("vehicle")
    ? "Contas de loja de veículos anunciam só carros. Para anunciar um imóvel, use uma conta de pessoa física ou de imobiliária."
    : "Contas de imobiliária, construtora e corretor anunciam só imóveis. Para anunciar um carro, use uma conta de pessoa física ou de loja de veículos.";
}
export const PLAN_REQUIRED_PARTNER_TYPES = ["dealership", "real_estate_agency", "broker", "builder"] as const;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxActiveListings: z.number().int(),
  highlightCredits: z.number().int(),
  superHighlightCredits: z.number().int().optional(),
  priceLabel: z.string(),
  audience: z.enum(["vehicle", "property"]).optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PartnerSubscriptionSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  priceLabel: z.string(),
  maxActiveListings: z.number().int(),
  highlightCredits: z.number().int(),
  currentPeriodEnd: z.string(),
  // past_due = a renovação falhou no cartão e o Stripe ainda está tentando
  // cobrar de novo — o plano continua valendo, mas o painel avisa a loja.
  status: z.enum(["active", "past_due"]),
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
  // Chave sk_test_ — o checkout não cobra de verdade (aviso em /parceiro/plano).
  stripeTestMode: z.boolean().optional(),
});
export type PaymentsStatus = z.infer<typeof PaymentsStatusSchema>;

export const CheckoutSessionResultSchema = z.object({
  url: z.string(),
});
export type CheckoutSessionResult = z.infer<typeof CheckoutSessionResultSchema>;

// Quadro de assinaturas do admin (/admin/assinaturas): uma linha por
// loja/imobiliária, na coluna do estado atual do plano. Quem move o card é o
// Stripe (webhooks), não a equipe — por isso não há "mover" aqui, só anotar.
export const SubscriptionBoardColumn = z.enum(["trial", "none", "active", "past_due", "canceled"]);
export type SubscriptionBoardColumn = z.infer<typeof SubscriptionBoardColumn>;

export const SubscriptionBoardCardSchema = z.object({
  partnerId: z.string(),
  legalName: z.string(),
  slug: z.string(),
  type: PartnerType,
  verified: z.boolean(),
  partnerCreatedAt: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  ownerPhone: z.string().optional(),
  column: SubscriptionBoardColumn,
  planName: z.string().optional(),
  priceMonth: z.number().optional(),
  priceLabel: z.string().optional(),
  startedAt: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
  statusChangedAt: z.string().optional(),
  // Ativado pela simulação (sem Stripe) — não entra na receita.
  simulated: z.boolean(),
  trialEndsAt: z.string().optional(),
  // Período grátis acabou e não tem plano: vitrine e anúncios fora do ar.
  offline: z.boolean(),
  listingsUsed: z.number().int(),
  listingsLimit: z.number().int().optional(),
  adminNotes: z.string().optional(),
});
export type SubscriptionBoardCard = z.infer<typeof SubscriptionBoardCardSchema>;

export const UpdatePartnerAdminNotesInputSchema = z.object({
  adminNotes: z.string().max(2000),
});
export type UpdatePartnerAdminNotesInput = z.infer<typeof UpdatePartnerAdminNotesInputSchema>;

export const PartnerSchema = z.object({
  id: z.string(),
  type: PartnerType,
  legalName: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  verified: z.boolean(),
  subscription: PartnerSubscriptionSchema.optional(),
  // Só pra quem precisa de plano (PLAN_REQUIRED_PARTNER_TYPES): até quando
  // vai o período grátis, e se a loja está fora do ar por falta de plano.
  trialEndsAt: z.string().optional(),
  offline: z.boolean().optional(),
  stats: PartnerStatsSchema,
  // Destaques em uso / disponíveis no plano (ou no período grátis).
  highlights: z
    .object({ used: z.number().int(), max: z.number().int(), superUsed: z.number().int(), superMax: z.number().int() })
    .optional(),
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

export const StorefrontHighlightSchema = z.object({
  listingId: z.string(),
  reason: z.string(),
});
export type StorefrontHighlight = z.infer<typeof StorefrontHighlightSchema>;

export const PartnerStorefrontSchema = z.object({
  legalName: z.string(),
  type: PartnerType,
  description: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  verified: z.boolean(),
  listings: z.array(ListingSummarySchema),
  // Escolhidos pela IA (ver AiService.curateStorefrontHighlights) — sempre
  // um subconjunto de "listings", nunca um anúncio que não esteja lá.
  highlights: z.array(StorefrontHighlightSchema),
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

export const LeadStatus = z.enum(["new", "contacted", "visit_scheduled", "negotiating", "won", "lost"]);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadSource = z.enum(["chat", "whatsapp", "phone", "walk_in", "referral", "social", "other"]);
export type LeadSource = z.infer<typeof LeadSource>;

export const LeadSummarySchema = z.object({
  id: z.string(),
  listingId: z.string().optional(),
  listingTitle: z.string().optional(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  // Telefone do comprador (cadastro do site) ou o digitado no lead manual —
  // vira o botão de WhatsApp do card.
  buyerPhone: z.string().optional(),
  source: LeadSource,
  status: LeadStatus,
  notes: z.string().optional(),
  proposalValue: z.number().optional(),
  statusChangedAt: z.string(),
  createdAt: z.string(),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const UpdateLeadStatusInputSchema = z.object({
  status: LeadStatus,
});
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusInputSchema>;

export const UpdateLeadInputSchema = z.object({
  status: LeadStatus.optional(),
  notes: z.string().max(2000).optional(),
  proposalValue: z.number().nonnegative().nullable().optional(),
});
export type UpdateLeadInput = z.infer<typeof UpdateLeadInputSchema>;

export const CreateLeadInputSchema = z.object({
  contactName: z.string().trim().min(2, "Informe o nome do cliente"),
  contactPhone: z.string().trim().max(20).optional(),
  source: z.enum(["phone", "walk_in", "referral", "social", "other"]),
  listingId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadInputSchema>;

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
  "financing_lead_created",
  "partner_trial_ending",
  "partner_offline",
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

export function isValidCnpj(raw: string): boolean {
  const cnpj = raw.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digits = cnpj.split("").map(Number);
  const checkDigit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, i) => acc + weight * digits[i]!, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return checkDigit(12) === digits[12] && checkDigit(13) === digits[13];
}

export const HighlightLevelSchema = z.enum(["none", "highlight", "super"]);
export type HighlightLevel = z.infer<typeof HighlightLevelSchema>;
export const SetHighlightInputSchema = z.object({ level: HighlightLevelSchema });
// Posição na busca (Listing.tierRank) do anúncio de loja: base 1; destaque
// fica junto do Turbo (2) e super destaque junto do Nitro (3), o topo.
export const PARTNER_HIGHLIGHT_RANK: Record<HighlightLevel, number> = { none: 1, highlight: 2, super: 3 };
export function highlightLevelFromRank(rank: number): HighlightLevel {
  return rank >= 3 ? "super" : rank === 2 ? "highlight" : "none";
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

// ---------- Agentes de IA ----------

export const AgentKind = z.enum(["buyer", "partner", "admin"]);
export type AgentKind = z.infer<typeof AgentKind>;

export const AgentMessageInputSchema = z.object({
  // Vazio na primeira mensagem — a API cria a conversa e devolve o id pro
  // site guardar e mandar de volta nas próximas.
  conversationId: z.string().optional(),
  message: z.string().trim().min(1, "Escreva uma mensagem").max(1500, "Mensagem longa demais (máx. 1500 caracteres)"),
});
export type AgentMessageInput = z.infer<typeof AgentMessageInputSchema>;

export const AgentReplySchema = z.object({
  conversationId: z.string(),
  reply: z.string(),
  // Anúncios citados na resposta (linkados no texto), pro site mostrar como
  // card logo abaixo da mensagem — nunca um anúncio que o agente não
  // encontrou de verdade numa ferramenta.
  listings: z.array(ListingSummarySchema),
});
export type AgentReply = z.infer<typeof AgentReplySchema>;

export const AgentChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});
export type AgentChatMessage = z.infer<typeof AgentChatMessageSchema>;

export const AgentConversationViewSchema = z.object({
  conversationId: z.string(),
  messages: z.array(AgentChatMessageSchema),
});
export type AgentConversationView = z.infer<typeof AgentConversationViewSchema>;

export const AgentStatusSchema = z.object({ enabled: z.boolean() });
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// Ordem = ordem das colunas no quadro. "converted" = Concluído (ver schema).
export const FinancingLeadStatus = z.enum([
  "new",
  "contacted",
  "documents",
  "credit_analysis",
  "approved",
  "property_appraisal",
  "contract",
  "converted",
  "lost",
]);
export type FinancingLeadStatus = z.infer<typeof FinancingLeadStatus>;

export const FinancingLeadSummarySchema = z.object({
  id: z.string(),
  channel: z.enum(["web", "whatsapp"]),
  name: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  assetType: z.string(),
  // Valores crus ao lado do texto formatado (mesma lição do SaleSummary):
  // quem for somar/filtrar não precisa reparsear "R$ 1.234,00".
  assetValue: z.number().optional(),
  assetValueLabel: z.string().optional(),
  downPayment: z.number().optional(),
  downPaymentLabel: z.string().optional(),
  monthlyIncome: z.number().optional(),
  monthlyIncomeLabel: z.string().optional(),
  listingId: z.string().optional(),
  listingTitle: z.string().optional(),
  notes: z.string().optional(),
  status: FinancingLeadStatus,
  // Negociação (preenchida pelo admin no quadro). Valor negociado ausente →
  // a comissão estimada usa o valor do bem informado pelo comprador.
  negotiatedValue: z.number().optional(),
  negotiatedValueLabel: z.string().optional(),
  commissionRate: z.number(),
  commissionAmount: z.number().optional(),
  commissionAmountLabel: z.string().optional(),
  commissionIsEstimate: z.boolean(),
  bank: z.string().optional(),
  adminNotes: z.string().optional(),
  // Repasse ao anunciante (programa de recompensa): previsto enquanto o
  // financiamento não fecha; "to_pay"/"paid" vêm do negócio registrado ao
  // concluir. Ausente quando o interesse não é em um anúncio específico.
  partnerShare: z
    .object({
      receiverLabel: z.string(),
      percent: z.number(),
      amount: z.number().optional(),
      amountLabel: z.string().optional(),
      stage: z.enum(["expected", "to_pay", "paid"]),
      paidAt: z.string().optional(),
    })
    .optional(),
  // Comissão menos o repasse — o que fica pro correspondente.
  netCommission: z.number().optional(),
  netCommissionLabel: z.string().optional(),
  statusChangedAt: z.string().optional(),
  createdAt: z.string(),
});
export type FinancingLeadSummary = z.infer<typeof FinancingLeadSummarySchema>;

// ---------- Integração com CRMs ----------

// Um anúncio vindo do CRM: os mesmos campos de "Anunciar" + o código do
// bem no CRM (externalId — é a chave da sincronização) e as fotos como
// links públicos, na ordem (a primeira vira capa).
export const IntegrationListingExtraSchema = z.object({
  externalId: z
    .string()
    .trim()
    .min(1, "externalId obrigatório")
    .max(100, "externalId longo demais (máx. 100)")
    .regex(/^[A-Za-z0-9._\-/]+$/, "externalId só pode ter letras, números, ponto, hífen, barra e sublinhado"),
  photos: z.array(z.string().url("Foto precisa ser um link http(s) válido")).max(40, "Máximo de 40 fotos").optional(),
});

export const IntegrationListingInputSchema = z.intersection(CreateListingInputSchema, IntegrationListingExtraSchema);
export type IntegrationListingInput = z.infer<typeof IntegrationListingInputSchema>;

export const IntegrationFeedFormat = z.enum(["vrsync", "meta_vehicles", "novoseminovo_json"]);
export type IntegrationFeedFormat = z.infer<typeof IntegrationFeedFormat>;

export const IntegrationSyncReportSchema = z.object({
  total: z.number(),
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  paused: z.number(),
  reactivated: z.number(),
  skipped: z.number(),
  errors: z.array(z.object({ externalId: z.string(), message: z.string() })),
  warnings: z.array(z.string()),
  durationMs: z.number().optional(),
});
export type IntegrationSyncReport = z.infer<typeof IntegrationSyncReportSchema>;

export const IntegrationFeedSchema = z.object({
  id: z.string(),
  url: z.string(),
  format: IntegrationFeedFormat,
  active: z.boolean(),
  lastSyncAt: z.string().optional(),
  lastStatus: z.enum(["never", "running", "ok", "error"]),
  lastError: z.string().optional(),
  lastReport: IntegrationSyncReportSchema.optional(),
  listingsCount: z.number(),
});
export type IntegrationFeed = z.infer<typeof IntegrationFeedSchema>;

export const CreateIntegrationFeedInputSchema = z.object({
  url: z.string().trim().url("Cole o link completo do feed (começando com https://)"),
  format: IntegrationFeedFormat,
});
export type CreateIntegrationFeedInput = z.infer<typeof CreateIntegrationFeedInputSchema>;

export const PartnerApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  lastUsedAt: z.string().optional(),
  createdAt: z.string(),
});
export type PartnerApiKey = z.infer<typeof PartnerApiKeySchema>;

export const CreatePartnerApiKeyInputSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome pra chave (ex.: nome do CRM)").max(60),
});
export type CreatePartnerApiKeyInput = z.infer<typeof CreatePartnerApiKeyInputSchema>;

// A chave inteira só existe nesta resposta — depois disso só o prefixo.
export const CreatedPartnerApiKeySchema = PartnerApiKeySchema.extend({ key: z.string() });
export type CreatedPartnerApiKey = z.infer<typeof CreatedPartnerApiKeySchema>;

export const IntegrationOverviewSchema = z.object({
  feeds: z.array(IntegrationFeedSchema),
  apiKeys: z.array(PartnerApiKeySchema),
  importedListings: z.number(),
  syncIntervalMinutes: z.number(),
});
export type IntegrationOverview = z.infer<typeof IntegrationOverviewSchema>;

export const UpdateFinancingLeadInputSchema = z.object({
  status: FinancingLeadStatus.optional(),
  negotiatedValue: z.number().positive("Valor negociado precisa ser maior que zero").nullable().optional(),
  commissionRate: z.number().min(0, "Comissão não pode ser negativa").max(100).optional(),
  bank: z.string().trim().max(80).nullable().optional(),
  adminNotes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateFinancingLeadInput = z.infer<typeof UpdateFinancingLeadInputSchema>;

// ---------- Arquiteto NovoSeminovo (IA de reforma) ----------

// Lojas dos links da lista de compras. Os links passam por
// GET /architect/go (conta o clique e acrescenta o código de afiliado quando
// configurado no servidor).
export const ARCHITECT_STORES = [
  { id: "leroymerlin", name: "Leroy Merlin" },
  { id: "mercadolivre", name: "Mercado Livre" },
  { id: "amazon", name: "Amazon" },
  { id: "magalu", name: "Magalu" },
] as const;
export type ArchitectStoreId = (typeof ARCHITECT_STORES)[number]["id"];

export const ArchitectShoppingItemSchema = z.object({
  category: z.enum(["material", "acabamento", "movel", "decoracao", "iluminacao", "servico"]),
  name: z.string(),
  spec: z.string().optional(),
  quantity: z.number(),
  unit: z.string(),
  priceMin: z.number(),
  priceMax: z.number(),
  searchTerm: z.string(),
  room: z.string().optional(),
});
export type ArchitectShoppingItem = z.infer<typeof ArchitectShoppingItemSchema>;

export const ArchitectShoppingListSchema = z.object({
  items: z.array(ArchitectShoppingItemSchema),
  notes: z.string().optional(),
  updatedAt: z.string(),
});
export type ArchitectShoppingList = z.infer<typeof ArchitectShoppingListSchema>;

export const ArchitectSessionViewSchema = z.object({
  id: z.string(),
  listing: z.object({ id: z.string(), title: z.string(), location: z.string(), priceLabel: z.string() }),
  photos: z.array(z.object({ id: z.string(), url: z.string(), caption: z.string().optional() })),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  images: z.array(
    z.object({ id: z.string(), photoId: z.string().optional(), sourceUrl: z.string(), resultUrl: z.string(), instructions: z.string(), createdAt: z.string() }),
  ),
  shoppingList: ArchitectShoppingListSchema.optional(),
  imagesLeftToday: z.number().int(),
  dailyImageLimit: z.number().int(),
  imageGenerationEnabled: z.boolean(),
});
export type ArchitectSessionView = z.infer<typeof ArchitectSessionViewSchema>;

export const ArchitectMessageInputSchema = z.object({
  text: z.string().trim().min(1, "Escreva sua ideia").max(1500),
  // Foto que a pessoa selecionou na tela (a IA olha essa primeiro).
  photoId: z.string().optional(),
});
