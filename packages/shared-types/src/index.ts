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
  // Código do afiliado que indicou (link ?ref= guardado em cookie, ou digitado).
  referralCode: z.string().trim().max(40).optional(),
  // Caixa "quero receber novidades por e-mail" (desmarcada por padrão).
  marketingOptIn: z.boolean().optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const ForgotPasswordInputSchema = z.object({ email: EmailSchema });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Mínimo de 8 caracteres").max(200),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

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
  // opcional) E quem está vendo entrou na conta — o contato do vendedor só
  // sai para comprador identificado (cada clique vira lead com nome).
  sellerPhone: z.string().optional(),
  // O vendedor atende por WhatsApp (mesmo sem login, pra mostrar "Entrar
  // para chamar no WhatsApp" sem revelar o número).
  sellerHasWhatsapp: z.boolean(),
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
// Modelo sugerido no /anunciar (nome base + quantas versões FIPE ele tem).
export const FipeModelSuggestionSchema = z.object({ name: z.string(), versions: z.number().int() });
export type FipeModelSuggestion = z.infer<typeof FipeModelSuggestionSchema>;

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

// "Importar pelo link": a pessoa cola o link do anúncio dela em outro site
// (OLX, Webmotors, ZAP…), o NovoSeminovo lê a página e devolve um rascunho no
// nosso padrão — ela revisa tudo no passo a passo antes de publicar.
export const ImportFromUrlInputSchema = z.object({
  url: z.string().trim().url("Cole o link completo do anúncio (começando com https://)").max(2000),
  confirmOwner: z.literal(true, { errorMap: () => ({ message: "Confirme que o anúncio é seu" }) }),
});
export type ImportFromUrlInput = z.infer<typeof ImportFromUrlInputSchema>;

export const ImportedListingSchema = z.object({
  assetType: z.enum(["vehicle", "property"]),
  sourceHost: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.number().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  neighborhood: z.string().optional(),
  vehicle: z
    .object({
      brand: z.string().optional(),
      model: z.string().optional(),
      version: z.string().optional(),
      yearManufacture: z.number().optional(),
      yearModel: z.number().optional(),
      mileage: z.number().optional(),
      transmission: z.enum(["manual", "automatic"]).optional(),
      fuelType: z.enum(["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"]).optional(),
      color: z.string().optional(),
      doors: z.number().optional(),
      bodyType: z.string().optional(),
    })
    .optional(),
  property: z
    .object({
      purpose: z.enum(["sale", "rent"]).optional(),
      propertyType: z.string().optional(),
      bedrooms: z.number().optional(),
      suites: z.number().optional(),
      bathrooms: z.number().optional(),
      parkingSpots: z.number().optional(),
      areaM2: z.number().optional(),
      totalAreaM2: z.number().optional(),
      floor: z.number().optional(),
      condoFee: z.number().optional(),
      iptu: z.number().optional(),
      features: z.array(z.string()).optional(),
    })
    .optional(),
  // Fotos da página de origem (links); o site baixa e passa pelo mesmo
  // tratamento das fotos enviadas à mão (compressão, placa borrada).
  photos: z.array(z.string()),
  // O que não deu para achar na página — a pessoa completa no passo a passo.
  missing: z.array(z.string()),
});
export type ImportedListing = z.infer<typeof ImportedListingSchema>;

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

// Admin corrige o tipo de um parceiro classificado errado pelo CNPJ.
export const SetPartnerTypeInputSchema = z.object({ type: PartnerType });

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
  // Situação do anúncio do lead — "sold" quando o lead virou venda.
  listingStatus: z.string().optional(),
  listingSoldPrice: z.number().optional(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  // Telefone do comprador (cadastro do site) ou o digitado no lead manual —
  // vira o botão de WhatsApp do card.
  buyerPhone: z.string().optional(),
  // Comprador com conta no site: dá pra continuar pelo chat da plataforma.
  // conversationId presente = já existe conversa com ele sobre o anúncio.
  canChat: z.boolean(),
  conversationId: z.string().optional(),
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
  // Por que a moderação automática deixou este pra uma pessoa decidir.
  autoReviewNote: z.string().optional(),
});
export type PendingListing = z.infer<typeof PendingListingSchema>;

// Painel /admin/anuncios: todos os anúncios de todos os usuários.
export const ADMIN_LISTING_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_review: "Em análise",
  active: "No ar",
  paused: "Pausado",
  sold: "Vendido",
  rejected: "Recusado",
  expired: "Expirado",
};
export type AdminListingRow = {
  id: string;
  assetType: "vehicle" | "property";
  title: string;
  priceLabel: string;
  location: string;
  status: string;
  photoUrl?: string;
  photos: number;
  views: number;
  leads: number;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  sellerType: "pf" | "pj";
  partnerName?: string;
  highlighted: boolean;
  createdAt: string;
  publishedAt?: string;
};
export type AdminListingsPage = {
  items: AdminListingRow[];
  total: number;
  page: number;
  pageSize: number;
  // Contagem por tipo de bem, vendedor (PF/PJ) e situação, para as abas e filtros.
  counts: { assetType: "vehicle" | "property"; sellerType: "pf" | "pj"; status: string; count: number }[];
};
// Painel de leads do admin (/admin/leads): todo contato gerado no site, para
// qual loja/imobiliária foi e em que etapa do funil está.
export const LEAD_STATUS_LABELS: Record<z.infer<typeof LeadStatus>, string> = {
  new: "Novo",
  contacted: "Em contato",
  visit_scheduled: "Visita",
  negotiating: "Proposta",
  won: "Vendido",
  lost: "Perdido",
};
export const LEAD_SOURCE_LABELS: Record<z.infer<typeof LeadSource>, string> = {
  chat: "Chat do site",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  walk_in: "Foi à loja",
  referral: "Indicação",
  social: "Redes sociais",
  other: "Outro",
};
export type AdminLeadRow = {
  id: string;
  createdAt: string;
  statusChangedAt: string;
  daysInStage: number;
  status: z.infer<typeof LeadStatus>;
  source: z.infer<typeof LeadSource>;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerUserId?: string;
  listingId?: string;
  listingTitle?: string;
  assetType?: "vehicle" | "property";
  partnerName: string;
  partnerOwnerUserId: string;
  proposalValue?: number;
  // Já existe conversa no chat do site entre o comprador e a loja.
  hasConversation: boolean;
  acqSource?: string;
};
export type AdminLeadsPage = {
  items: AdminLeadRow[];
  total: number;
  page: number;
  pageSize: number;
  // Funil no período/filtros escolhidos (sem o filtro de etapa).
  funnel: Record<z.infer<typeof LeadStatus>, number>;
  // Leads em "Novo" há mais de 24h — ninguém atendeu ainda.
  waitingOver24h: number;
};

export const AdminListingActionInputSchema = z.object({
  action: z.enum(["suspend", "reactivate"]),
  reason: z.string().trim().max(500).optional(),
});
export type AdminListingActionInput = z.infer<typeof AdminListingActionInputSchema>;

// Exclusões pelo admin: sempre com a senha do próprio admin e um motivo.
export const AdminDeleteInputSchema = z.object({
  password: z.string().min(1, "Digite a sua senha").max(200),
  reason: z.string().trim().min(5, "Explique o motivo (mínimo 5 letras)").max(500),
});
export type AdminDeleteInput = z.infer<typeof AdminDeleteInputSchema>;

// Página de uma pessoa ou loja no admin (/admin/usuarios/[id]).
export type AdminUserProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  cpfMasked?: string;
  role: string;
  status: string;
  createdAt: string;
  emailVerified: boolean;
  acqSource?: string;
  deleted: boolean;
  partner?: {
    id: string;
    legalName: string;
    type: string;
    document: string;
    slug: string;
    verified: boolean;
    createdAt: string;
    subscription?: { plan: string; status: string; currentPeriodEnd: string };
  };
  stats: {
    listingsByStatus: { assetType: "vehicle" | "property"; status: string; count: number }[];
    views: number;
    conversations: number;
    partnerLeads: number;
    favoritesGiven: number;
  };
  marketingConsent?: string;
  affiliateStatus?: string;
  canDelete: boolean;
  deleteBlockedReason?: string;
};

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
export const ModerationActionType = z.enum(["approved", "rejected", "suspended", "reactivated"]);
export type ModerationActionType = z.infer<typeof ModerationActionType>;

export const ModerationLogEntrySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  adminName: z.string(),
  automated: z.boolean().optional(),
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
  "affiliate_approved",
  "affiliate_commission",
  "listing_suspended",
  "ops_approval_requested",
  "ops_alert",
  "listing_tip",
  "partner_tip",
  "ops_daily_summary",
  "marketing_review",
  "ops_finance_report",
  "listing_removed",
  "reply_reminder",
  "cashback_registered",
  "cashback_released",
  "cashback_paid",
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

// ---------- Cashback no financiamento ----------
// Quem contrata o financiamento (carro ou imóvel) pelo NovoSeminovo recebe
// de volta CASHBACK_PERCENT da comissão BRUTA que o NovoSeminovo recebe do
// banco/Credihome. Só é pago depois que essa comissão cai na conta — nunca
// adiantado — e o valor recebido é o líquido (descontos e tributos). O
// negócio nasce quando o lead do quadro de financiamentos vai para
// "Concluído" (ver RebatesService na API). O antigo repasse ao anunciante
// acabou em 26/10/2026.
export const CASHBACK_PERCENT = 20;
export const CASHBACK_DISCLAIMER =
  "O cashback é de 20% sobre a comissão bruta que o NovoSeminovo recebe do banco ou da Credihome pelo seu financiamento. Você recebe o valor líquido, depois dos descontos e tributos aplicáveis, e só depois que essa comissão for paga ao NovoSeminovo.";

export const FinancingDealStatus = z.enum(["registered", "paid"]);
export type FinancingDealStatus = z.infer<typeof FinancingDealStatus>;

// awaiting_commission: financiamento fechado, banco ainda não pagou a
// comissão. to_pay: comissão recebida, cashback liberado. paid: Pix feito.
export const CashbackStage = z.enum(["awaiting_commission", "to_pay", "paid"]);
export type CashbackStage = z.infer<typeof CashbackStage>;
export const CASHBACK_STAGE_LABELS: Record<CashbackStage, string> = {
  awaiting_commission: "Aguardando o banco pagar a comissão",
  to_pay: "Liberado — pagamento em andamento",
  paid: "Pago",
};

export const FinancingDealSchema = z.object({
  id: z.string(),
  listingId: z.string().optional(),
  listingTitle: z.string().optional(),
  buyerName: z.string(),
  buyerEmail: z.string().optional(),
  buyerPhone: z.string().optional(),
  // Comprador com conta no site (vê o cashback em "Meu cashback").
  buyerLinked: z.boolean(),
  // CPF do comprador (chave Pix) — só para o admin; ausente se não cadastrou.
  buyerCpf: z.string().optional(),
  financingProvider: z.string(),
  assetValueLabel: z.string(),
  financedAmountLabel: z.string(),
  commissionRateLabel: z.string(),
  commissionAmountLabel: z.string(),
  cashbackPercentLabel: z.string(),
  cashbackAmount: z.number(),
  cashbackAmountLabel: z.string(),
  status: FinancingDealStatus,
  stage: CashbackStage,
  commissionReceivedAt: z.string().optional(),
  paidAt: z.string().optional(),
  paidNote: z.string().optional(),
  createdAt: z.string(),
});
export type FinancingDeal = z.infer<typeof FinancingDealSchema>;

export const MarkFinancingDealPaidInputSchema = z.object({
  note: z.string().optional(),
});
export type MarkFinancingDealPaidInput = z.infer<typeof MarkFinancingDealPaidInputSchema>;

export const MyCashbackSummarySchema = z.object({
  percentLabel: z.string(),
  totalAwaitingLabel: z.string(),
  totalToPayLabel: z.string(),
  totalPaidLabel: z.string(),
  // Sem CPF no perfil não dá pra fazer o Pix.
  cpfMissing: z.boolean(),
  deals: z.array(FinancingDealSchema),
});
export type MyCashbackSummary = z.infer<typeof MyCashbackSummarySchema>;

// ---------- Perfil completo e verificação de e-mail ----------
// Cadastro inicial (/cadastro) continua mínimo (nome/e-mail/senha) — esses
// dados entram depois, na tela "Minha conta", principalmente pra viabilizar
// o pagamento do cashback do financiamento via Pix (precisa de CPF) e deixar o endereço
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
  // De onde veio o pedido: chat do assistente no site, WhatsApp ou o
  // simulador de crédito do anúncio (que não tem conversa).
  origin: z.enum(["chat", "whatsapp", "simulator"]),
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
  // Cashback de quem contratou (20% da comissão bruta): previsto enquanto o
  // financiamento não fecha; depois segue as etapas do negócio registrado.
  cashback: z.object({
    percent: z.number(),
    amount: z.number().optional(),
    amountLabel: z.string().optional(),
    stage: z.enum(["expected", "awaiting_commission", "to_pay", "paid"]),
    paidAt: z.string().optional(),
  }),
  // Comissão menos o cashback — o que fica pro NovoSeminovo.
  netCommission: z.number().optional(),
  netCommissionLabel: z.string().optional(),
  statusChangedAt: z.string().optional(),
  // Lead enviado à Credihome: fase da jornada lá (atualizada a cada 6 horas
  // ou pelo botão "Atualizar").
  credihome: z
    .object({
      leadId: z.string(),
      phase: z.string().optional(),
      phaseLabel: z.string(),
      sentAt: z.string(),
      syncedAt: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});
export type FinancingLeadSummary = z.infer<typeof FinancingLeadSummarySchema>;

// Fases da jornada na Credihome (GET /leads/{id}/journey), na ordem.
export const CREDIHOME_PHASE_LABELS: Record<string, string> = {
  lead: "Recebido pela Credihome",
  documentos: "Documentos",
  analise_credito: "Análise de crédito",
  analise_juridica: "Análise jurídica",
  confirmacao_valores: "Confirmação de valores",
  emissao: "Emissão do contrato",
  assinatura: "Assinatura",
  registro: "Registro em cartório",
  liberacao_valores: "Liberação dos valores",
  finalizado: "Finalizado",
};

const BirthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida")
  .refine((value) => {
    const age = (Date.now() - new Date(`${value}T12:00:00Z`).getTime()) / (365.25 * 86_400_000);
    return age >= 18 && age <= 100;
  }, "O comprador precisa ter 18 anos ou mais");

// Envio de um lead de imóvel à Credihome pelo admin. CPF e nascimento são
// pedidos ao cliente na conversa e não ficam guardados no NovoSeminovo.
export const SendToCredihomeInputSchema = z
  .object({
    cpf: z.string().refine((value) => isValidCpf(value), "CPF inválido"),
    dateOfBirth: BirthDateSchema,
    email: z.string().trim().email("E-mail inválido"),
    realtyPrice: z.number().positive("Informe o valor do imóvel"),
    mortgageValue: z.number().positive("Informe o valor a financiar"),
    useFgts: z.boolean(),
    consent: z.literal(true, { errorMap: () => ({ message: "Confirme que o cliente autorizou o envio dos dados" }) }),
  })
  .refine((input) => input.mortgageValue <= input.realtyPrice, {
    message: "O valor a financiar não pode passar do valor do imóvel",
    path: ["mortgageValue"],
  });
export type SendToCredihomeInput = z.infer<typeof SendToCredihomeInputSchema>;

// Simulador na página do imóvel (mesmas perguntas do simulador da
// Credihome). 1º passo: parcelas por banco, sem dado pessoal além do
// nascimento (a idade muda o seguro). 2º passo: pedido de proposta.
export const CREDIHOME_PURCHASE_WINDOWS = {
  ate_3_meses: "Em até 3 meses",
  "3_a_6_meses": "De 3 a 6 meses",
  "6_a_12_meses": "De 6 a 12 meses",
  mais_de_12_meses: "Daqui a mais de 1 ano",
  pesquisando: "Só estou pesquisando",
} as const;
export const CredihomePurchaseWindow = z.enum(
  Object.keys(CREDIHOME_PURCHASE_WINDOWS) as [keyof typeof CREDIHOME_PURCHASE_WINDOWS, ...Array<keyof typeof CREDIHOME_PURCHASE_WINDOWS>],
);

const CredihomeSimulationFields = z.object({
  realtyPrice: z.number().positive("Informe o valor do imóvel").max(100_000_000),
  mortgageValue: z.number().positive("Informe o valor do financiamento"),
  dateOfBirth: BirthDateSchema,
  months: z.number().int().min(60, "Prazo mínimo de 60 meses").max(420, "Prazo máximo de 420 meses"),
  purchaseWindow: CredihomePurchaseWindow,
});
const financingNotAboveRealty = <T extends { realtyPrice: number; mortgageValue: number }>(input: T) =>
  input.mortgageValue <= input.realtyPrice;

export const CredihomeSimulateInputSchema = CredihomeSimulationFields.refine(financingNotAboveRealty, {
  message: "O valor do financiamento não pode passar do valor do imóvel",
  path: ["mortgageValue"],
});
export type CredihomeSimulateInput = z.infer<typeof CredihomeSimulateInputSchema>;

export const CredihomeSimulationViewSchema = z.object({
  results: z.array(
    z.object({
      bank: z.string(),
      firstPayment: z.number(),
      annualRate: z.number().optional(),
      minimumIncome: z.number().optional(),
      table: z.string().optional(),
    }),
  ),
  maxFinancing: z.number().optional(),
  warnings: z.array(z.string()),
});
export type CredihomeSimulationView = z.infer<typeof CredihomeSimulationViewSchema>;

export const CredihomeProposalInputSchema = CredihomeSimulationFields.extend({
  name: z.string().trim().min(3, "Informe seu nome completo").max(120),
  cpf: z.string().refine((value) => isValidCpf(value), "CPF inválido"),
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 10 || value.length === 11, "Celular com DDD"),
  email: z.string().trim().email("E-mail inválido"),
  useFgts: z.boolean(),
  consent: z.literal(true, { errorMap: () => ({ message: "Autorize o envio dos dados para receber a proposta" }) }),
}).refine(financingNotAboveRealty, {
  message: "O valor do financiamento não pode passar do valor do imóvel",
  path: ["mortgageValue"],
});
export type CredihomeProposalInput = z.input<typeof CredihomeProposalInputSchema>;

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

export const ARCHITECT_MAX_PHOTOS = 5;

export const ArchitectMessageInputSchema = z.object({
  text: z.string().trim().min(1, "Escreva sua ideia").max(1500),
  // Fotos que a pessoa selecionou na tela (até 5 cômodos; a IA olha essas).
  photoIds: z.array(z.string()).max(ARCHITECT_MAX_PHOTOS, `Escolha até ${ARCHITECT_MAX_PHOTOS} fotos`).optional(),
  // Com mais de uma foto: "todos" reforma todos de uma vez; "separado" trata
  // um cômodo por vez (activePhotoId) e a lista de compras vai juntando.
  mode: z.enum(["todos", "separado"]).optional(),
  activePhotoId: z.string().optional(),
  // Compatibilidade com a tela antiga (uma foto só).
  photoId: z.string().optional(),
});
export type ArchitectMessageInput = z.infer<typeof ArchitectMessageInputSchema>;

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

export const AffiliateApplyInputSchema = z.object({
  channels: z.string().trim().min(3, "Conte onde você divulga (ex.: @perfil no Instagram)").max(600),
  audience: z.string().trim().max(200).optional(),
  pixKey: z.string().trim().min(5, "Informe a chave Pix para receber").max(140),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Aceite as regras do programa" }) }),
});
export type AffiliateApplyInput = z.infer<typeof AffiliateApplyInputSchema>;

export const AffiliateCommissionViewSchema = z.object({
  id: z.string(),
  source: z.enum(["partner_subscription", "listing_plan"]),
  description: z.string(),
  baseAmount: z.number(),
  rate: z.number(),
  amount: z.number(),
  status: z.enum(["pending", "available", "paid", "canceled"]),
  availableAt: z.string(),
  paidAt: z.string().optional(),
  createdAt: z.string(),
});
export type AffiliateCommissionView = z.infer<typeof AffiliateCommissionViewSchema>;

export const AffiliateTotalsSchema = z.object({
  pending: z.number(),
  available: z.number(),
  paid: z.number(),
});
export type AffiliateTotals = z.infer<typeof AffiliateTotalsSchema>;

export const AffiliateDashboardSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  code: z.string(),
  channels: z.string(),
  audience: z.string().optional(),
  pixKey: z.string(),
  adminNote: z.string().optional(),
  stats: z.object({
    clicks30d: z.number(),
    signups: z.number(),
    payingCustomers: z.number(),
  }),
  totals: AffiliateTotalsSchema,
  commissions: z.array(AffiliateCommissionViewSchema),
});
export type AffiliateDashboard = z.infer<typeof AffiliateDashboardSchema>;

export const AdminAffiliateRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  code: z.string(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  channels: z.string(),
  audience: z.string().optional(),
  pixKey: z.string(),
  createdAt: z.string(),
  signups: z.number(),
  clicks30d: z.number(),
  // Quanto os indicados pagaram (base das comissões não canceladas).
  revenue: z.number(),
  totals: AffiliateTotalsSchema,
});
export type AdminAffiliateRow = z.infer<typeof AdminAffiliateRowSchema>;

// Gestão de um afiliado no /admin: quem entrou pelo código dele, quanto cada
// indicado pagou, cliques por dia, comissões e histórico de pagamentos (Pix).
export const AdminAffiliateDetailSchema = z.object({
  affiliate: AdminAffiliateRowSchema.extend({
    approvedAt: z.string().optional(),
    adminNote: z.string().optional(),
    clicksTotal: z.number(),
  }),
  clicksByDay: z.array(z.object({ day: z.string(), count: z.number() })),
  referrals: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      referredAt: z.string().optional(),
      account: z.string(),
      revenue: z.number(),
      commission: z.number(),
    }),
  ),
  commissions: z.array(
    AffiliateCommissionViewSchema.extend({ referredName: z.string(), paidNote: z.string().optional() }),
  ),
  payouts: z.array(z.object({ paidAt: z.string(), note: z.string(), amount: z.number(), count: z.number() })),
});
export type AdminAffiliateDetail = z.infer<typeof AdminAffiliateDetailSchema>;

export const AdminAffiliateActionInputSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reactivate"]),
  note: z.string().trim().max(500).optional(),
});
export type AdminAffiliateActionInput = z.infer<typeof AdminAffiliateActionInputSchema>;

export const AdminAffiliatePayoutInputSchema = z.object({
  note: z.string().trim().min(3, "Anote o comprovante do Pix (ex.: id da transação)").max(300),
});
export type AdminAffiliatePayoutInput = z.infer<typeof AdminAffiliatePayoutInputSchema>;

// Mesma marca escrita de jeitos diferentes (a FIPE usa "GM - Chevrolet",
// "VW - VolksWagen"...; a faixa de logos e quem digita usam "Chevrolet").
// A busca por marca aceita qualquer grafia do grupo.
const VEHICLE_BRAND_GROUPS: string[][] = [
  ["Chevrolet", "GM - Chevrolet", "GM"],
  ["Volkswagen", "VW - VolksWagen", "VW"],
  ["Citroën", "Citroen"],
  ["Caoa Chery", "Chery", "CAOA Chery/Chery"],
  ["Kia", "Kia Motors"],
  ["Mercedes-Benz", "Mercedes", "Mercedes Benz", "M.Benz"],
  ["Land Rover", "LandRover", "LR"],
];

export function vehicleBrandVariants(name: string): string[] {
  const wanted = name.trim().toLowerCase();
  const group = VEHICLE_BRAND_GROUPS.find((names) => names.some((item) => item.toLowerCase() === wanted));
  return group ?? [name.trim()];
}

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
  outros_buscadores: "Outros buscadores",
  outros_sites: "Outros sites",
  direto: "Direto (digitou o endereço)",
} as const;
export type AcquisitionSource = keyof typeof ACQUISITION_SOURCES;
export type Acquisition = { source: AcquisitionSource; medium?: string; campaign?: string };

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsocial|paid_social|ads?|display|cpm)$/i;

function cleanPart(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim().toLowerCase().replace(/[|\s]+/g, "_").slice(0, 60);
  return text || undefined;
}

// Classifica a chegada: utm_source tem prioridade, depois ?ref= de afiliado,
// depois o site de onde veio (document.referrer). Sem nada disso = direto.
export function classifyAcquisition(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  ref?: string | null;
  referrer?: string | null;
  ownHost?: string;
}): Acquisition {
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
  if (!host || (input.ownHost && host.endsWith(input.ownHost.replace(/^www\./, "")))) return { source: "direto" };
  if (/(^|\.)google\./.test(host)) return { source: "google", medium: "organic" };
  if (/instagram\.com$/.test(host)) return { source: "instagram", medium: "social" };
  if (/(facebook\.com|fb\.me|fb\.com)$/.test(host)) return { source: "facebook", medium: "social" };
  if (/tiktok\.com$/.test(host)) return { source: "tiktok", medium: "social" };
  if (/(youtube\.com|youtu\.be)$/.test(host)) return { source: "youtube", medium: "social" };
  if (/(whatsapp\.com|wa\.me)$/.test(host)) return { source: "whatsapp", medium: "social" };
  if (/(bing\.com|yahoo\.|duckduckgo\.com|ecosia\.org)/.test(host)) return { source: "outros_buscadores", medium: "organic" };
  return { source: "outros_sites", medium: "referral", campaign: cleanPart(host) };
}

export function serializeAcquisition(value: Acquisition): string {
  return [value.source, value.medium ?? "", value.campaign ?? ""].join("|");
}

export function parseAcquisition(raw: string | null | undefined): Acquisition | undefined {
  if (!raw) return undefined;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // já veio decodificado
  }
  const [source, medium, campaign] = text.split("|");
  if (!source || !(source in ACQUISITION_SOURCES)) return undefined;
  return { source: source as AcquisitionSource, medium: cleanPart(medium), campaign: cleanPart(campaign) };
}

// Receita das lojas parceiras (Amazon, Mercado Livre…): o valor vem do painel
// de cada programa e o admin lança por mês no /admin/painel.
export const STORE_EARNING_STORES = { amazon: "Amazon", mercadolivre: "Mercado Livre", magalu: "Magalu", leroy: "Leroy Merlin", outra: "Outra loja" } as const;
export type StoreEarningStore = keyof typeof STORE_EARNING_STORES;
export const StoreEarningInputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM"),
  store: z.enum(Object.keys(STORE_EARNING_STORES) as [StoreEarningStore, ...StoreEarningStore[]]),
  amount: z.number().min(0).max(10_000_000),
  note: z.string().trim().max(200).optional(),
});
export type StoreEarningInput = z.infer<typeof StoreEarningInputSchema>;

// Painel de big numbers do admin (/admin/painel): tudo do site num lugar só.
// "30d" = últimos 30 dias; "prev30d" = os 30 dias antes disso (pra tendência).
// scope "vehicle"/"property" recorta o que é de carro ou de imóvel; o que não
// tem tipo (usuários, cadastros) continua sendo do site todo.
export type AdminOverviewScope = "all" | "vehicle" | "property";
export type AdminOverviewTrend = { last30d: number; prev30d: number };
export type AdminOverviewDay = { day: string; users: number; listings: number; leads: number; messages: number };
export type AdminOverviewRevenueMonth = {
  month: string;
  listingPlans: number;
  subscriptions: number;
  financing: number;
  stores: number;
};
export type AdminOverviewOriginRow = { key: string; label: string; signups: number; leads: number; financingLeads: number };
export type AdminOverviewCampaignRow = { source: string; campaign: string; signups: number; leads: number };
export type AdminOverview = {
  scope: AdminOverviewScope;
  generatedAt: string;
  users: { total: number; newUsers: AdminOverviewTrend; sellers: number; referred: number };
  listings: {
    active: number;
    pendingReview: number;
    paused: number;
    rejected: number;
    expired: number;
    sold: AdminOverviewTrend;
    soldValue30d: number;
    created: AdminOverviewTrend;
    views: number;
    avgActivePrice: number;
    activeVehicles: number;
    activeProperties: number;
  };
  partners: { total: number; verified: number; byType: { type: string; count: number }[] };
  revenue: {
    mrr: number;
    payingSubscriptions: number;
    pastDue: number;
    listingPlans: AdminOverviewTrend;
    listingPlansCount30d: number;
    subscriptions: AdminOverviewTrend;
    financing: AdminOverviewTrend;
    financingDeals30d: number;
    financingRebates30d: number;
    financingOpenLeads: number;
    stores: AdminOverviewTrend;
    storeClicks30d: number;
    total: AdminOverviewTrend;
    months: AdminOverviewRevenueMonth[];
    storeEntries: { id: string; month: string; store: string; amount: number; note?: string }[];
  };
  engagement: {
    conversations: AdminOverviewTrend;
    messages: AdminOverviewTrend;
    favorites: number;
    leads: AdminOverviewTrend;
    leadsWon30d: number;
    simulations: AdminOverviewTrend;
    openReports: number;
  };
  ai: {
    agentConversations: AdminOverviewTrend;
    financingLeads: AdminOverviewTrend;
    financingLeadsConverted: number;
    architectSessions: AdminOverviewTrend;
    architectImages30d: number;
    autoModerated30d: number;
  };
  affiliates: { active: number; pending: number; commissionsOpen: number; commissionsPaid: number };
  origins: AdminOverviewOriginRow[];
  campaigns: AdminOverviewCampaignRow[];
  daily: AdminOverviewDay[];
};

// Operação com agentes de IA (Fase 1): tela /admin/operacao.
export const OPS_AGENT_LABELS: Record<string, string> = {
  diretor: "Diretor",
  operacoes: "Operações de anúncios",
  comercial: "Comercial",
  marketing: "Marketing",
  financeiro: "Financeiro",
  atendimento: "Atendimento",
  "sistema:kpi": "Rotina: foto diária dos KPIs",
};
export const OPS_TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Na fila",
  running: "Rodando",
  awaiting_approval: "Esperando aprovação",
  blocked: "Bloqueada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
export const OPS_ROUTINE_LABELS: Record<string, string> = {
  moderacao: "Moderação automática",
  geocodificacao: "Localização no mapa",
  integracoes: "Importação de estoque de parceiros",
  "periodo-gratis": "Aviso de fim do período grátis",
  "fila-agentes": "Fila de tarefas dos agentes",
  marketing: "Marketing (Instagram e e-mails)",
};
export const OPS_FEATURE_LABELS: Record<string, string> = {
  assistentes: "Assistentes (chat e WhatsApp)",
  moderacao: "Moderação automática",
  arquiteto: "Arquiteto",
  "cadastro-ia": "Cadastro com IA",
};
// Indicadores que podem virar meta (calculados pelo painel geral).
export const OPS_GOAL_METRICS: Record<string, string> = {
  receita_total: "Receita do mês (R$)",
  leads: "Leads no mês",
  cadastros: "Novos cadastros no mês",
  anuncios_ativos: "Anúncios ativos",
  anuncios_vendidos: "Anúncios vendidos no mês",
  financiamentos: "Pedidos de financiamento no mês",
};

export type OpsApprovalView = {
  id: string;
  agent: string;
  tool: string;
  summary: string;
  impact?: string;
  reason?: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  taskId?: string;
};
export type OpsTaskView = {
  id: string;
  agent: string;
  objective: string;
  segment: string;
  status: string;
  attempts: number;
  error?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  lastEvent?: string;
};
export type OpsRoutineView = {
  name: string;
  intervalMs: number;
  lastRunAt: string;
  lastOkAt?: string;
  lastError?: string;
  failures: number;
  healthy: boolean;
};
export type OpsReportView = { id: string; agent: string; kind: string; body: string; createdAt: string };
export type MarketingSuggestionView = { id: string; title: string; channel: string; audience?: string; body: string; link?: string; status: string; createdAt: string };
// Agentes que o admin pode mandar rodar na hora (botão "Rodar agora").
export const OPS_RUNNABLE_AGENTS = ["diretor", "operacoes", "comercial", "marketing", "financeiro", "atendimento"] as const;
export const MarketingSuggestionStatusInputSchema = z.object({ status: z.enum(["nova", "usada", "descartada"]) });
export type OpsGoalView = { id: string; metric: string; segment: string; period: string; target: number; agent: string; note?: string; current?: number };
export type OpsSummary = {
  generatedAt: string;
  budget: { dailyBrl: number; spentTodayBrl: number; usdToBrl: number };
  cost: { todayBrl: number; last30dBrl: number; byFeature: { feature: string; calls: number; brl: number }[] };
  approvals: OpsApprovalView[];
  recentApprovals: OpsApprovalView[];
  tasks: OpsTaskView[];
  routines: OpsRoutineView[];
  goals: OpsGoalView[];
  latestSummary?: OpsReportView;
  latestFinanceReport?: OpsReportView;
  suggestions: MarketingSuggestionView[];
  windsorEnabled: boolean;
  agentsEnabled: boolean;
};

export const OpsDecisionInputSchema = z.object({ note: z.string().trim().max(500).optional() });
export const OpsGoalInputSchema = z.object({
  metric: z.string().refine((value) => value in OPS_GOAL_METRICS, "Indicador inválido"),
  segment: z.enum(["all", "vehicle", "property"]),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM"),
  target: z.number().min(0).max(1_000_000_000),
  agent: z.string().refine((value) => value in OPS_AGENT_LABELS, "Agente inválido"),
  note: z.string().trim().max(200).optional(),
});
export type OpsGoalInput = z.infer<typeof OpsGoalInputSchema>;


// ---------------- Marketing operacional ----------------
export const MARKETING_INTERESTS = {
  geral: "Novidades em geral",
  comprar_carro: "Quer comprar carro",
  comprar_imovel: "Quer comprar ou alugar imóvel",
  vender: "Quer vender (pessoa física)",
  loja: "Loja, imobiliária ou corretor",
} as const;
export type MarketingInterest = keyof typeof MARKETING_INTERESTS;
export const MARKETING_CONSENT_LABELS: Record<string, string> = {
  opt_in: "Pediu para receber",
  legitimate_interest: "Cliente/pediu contato",
  none: "Sem permissão de marketing",
};
export const MARKETING_POST_STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Esperando sua aprovação",
  changes_requested: "Alteração pedida ao agente",
  approved: "Aprovado — publica em instantes",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  rejected: "Rejeitado",
};
export const EMAIL_CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Esperando sua aprovação",
  changes_requested: "Alteração pedida ao agente",
  approved: "Aprovada",
  scheduled: "Agendada",
  sending: "Enviando",
  sent: "Enviada",
  rejected: "Rejeitada",
};
export const EMAIL_SEQUENCE_STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Esperando sua aprovação",
  changes_requested: "Alteração pedida ao agente",
  active: "Ativa",
  paused: "Pausada",
};

export const MarketingDecisionInputSchema = z.object({
  action: z.enum(["approve", "schedule", "changes", "reject", "pause"]),
  note: z.string().trim().max(1000).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
});
export type MarketingDecisionInput = z.infer<typeof MarketingDecisionInputSchema>;

export const NewsletterSubscribeInputSchema = z.object({
  email: EmailSchema,
  name: z.string().trim().max(120).optional(),
  interest: z.enum(["geral", "comprar_carro", "comprar_imovel", "vender", "loja"]),
  consent: z.literal(true, { errorMap: () => ({ message: "Marque a caixa para autorizar o envio." }) }),
});
export type NewsletterSubscribeInput = z.infer<typeof NewsletterSubscribeInputSchema>;

// Edição feita pelo admin na prévia (volta para "esperando aprovação").
export const MarketingPostInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  caption: z.string().trim().min(10).max(2000),
  hashtags: z.array(z.string().trim().regex(/^#?[\p{L}\p{N}_]{2,40}$/u, "Hashtag inválida")).max(15),
  extraText: z.string().trim().max(1000).optional(),
  artSource: z.enum(["listing", "ai", "brand"]),
  artHeadline: z.string().trim().min(3).max(90),
  artSubline: z.string().trim().max(120).optional(),
  listingId: z.string().trim().max(40).optional(),
  artPrompt: z.string().trim().max(600).optional(),
});
export type MarketingPostInput = z.infer<typeof MarketingPostInputSchema>;

export const EmailCampaignInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  subject: z.string().trim().min(3).max(120),
  preheader: z.string().trim().max(150).optional(),
  body: z.string().trim().min(20).max(5000),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaUrl: z.string().trim().max(300).optional(),
  interests: z.array(z.enum(["geral", "comprar_carro", "comprar_imovel", "vender", "loja"])).max(5),
});
export type EmailCampaignInput = z.infer<typeof EmailCampaignInputSchema>;

export type MarketingPostView = {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  extraText?: string;
  artSource: string;
  artHeadline: string;
  artSubline?: string;
  imageUrl?: string;
  status: string;
  feedback?: string;
  revision: number;
  scheduledFor?: string;
  publishedAt?: string;
  igPermalink?: string;
  error?: string;
  metrics?: Record<string, number>;
  metricsAt?: string;
  createdAt: string;
};
export type EmailCampaignView = {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  segment: { interests: string[] };
  audienceSize: number;
  status: string;
  feedback?: string;
  scheduledFor?: string;
  sentAt?: string;
  stats: { queued: number; sent: number; delivered: number; bounced: number; failed: number; clicked: number; clicks: number; unsubscribed: number };
  createdAt: string;
};
// condition: sempre | sem_conta (só quem ainda não criou conta) | com_conta.
export const EMAIL_STEP_CONDITIONS = { sempre: "Sempre", sem_conta: "Só quem ainda não tem conta", com_conta: "Só quem já tem conta" } as const;
export type EmailSequenceStep = {
  delayDays: number;
  subject: string;
  preheader?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  condition?: keyof typeof EMAIL_STEP_CONDITIONS;
};
export type EmailSequenceView = {
  id: string;
  key: string;
  name: string;
  interests: string[];
  steps: EmailSequenceStep[];
  status: string;
  feedback?: string;
  enrolled: { active: number; completed: number; stopped: number };
  createdAt: string;
};
export type MarketingContactView = {
  id: string;
  email?: string;
  name?: string;
  interest: string;
  source: string;
  consent: string;
  status: string;
  stage: string;
  createdAt: string;
};
export type MarketingSummary = {
  generatedAt: string;
  integrations: { instagram: boolean; email: boolean; emailWebhook: boolean; images: boolean };
  emailDailyLimit: number;
  emailSentToday: number;
  posts: MarketingPostView[];
  campaigns: EmailCampaignView[];
  sequences: EmailSequenceView[];
  contacts: { total: number; reachable: number; new30d: number; unsubscribed: number; bySource: { source: string; count: number }[]; byInterest: { interest: string; count: number }[]; latest: MarketingContactView[] };
  results: {
    postsPublished30d: number;
    reach: number;
    likes: number;
    comments: number;
    saves: number;
    emailsSent30d: number;
    delivered30d: number;
    bounced30d: number;
    clicked30d: number;
    unsubscribed30d: number;
    leadsFromEmail30d: number;
    signupsFromEmail30d: number;
    contactsConverted: number;
  };
};
