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
export const RegisterInputSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email("E-mail inválido"),
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
  downPayment: z.string(),
  installments: z.string(),
  rate: z.string(),
});
export type ListingFinancingSummary = z.infer<typeof ListingFinancingSummarySchema>;

export const ListingDetailSchema = ListingSummarySchema.extend({
  description: z.string(),
  specs: z.array(SpecItemSchema),
  financing: ListingFinancingSummarySchema,
});
export type ListingDetail = z.infer<typeof ListingDetailSchema>;

// Calculadora do MVP — sem integração bancária real (ver Etapa 3).
export const FinancingSimulationInputSchema = z.object({
  listingId: z.string(),
  assetPrice: z.number().positive(),
  downPaymentPct: z.number().min(0).max(0.9),
  installments: z.number().int().min(1).max(84),
});
export type FinancingSimulationInput = z.infer<typeof FinancingSimulationInputSchema>;

export const FinancingSimulationResultSchema = z.object({
  downPaymentLabel: z.string(),
  installmentLabel: z.string(),
  rateLabel: z.string(),
});
export type FinancingSimulationResult = z.infer<typeof FinancingSimulationResultSchema>;

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
