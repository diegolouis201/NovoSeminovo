"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  FipeModelSuggestion,
  FipePrice,
  FipeVersion,
  CreateListingInput,
  ImportedListing,
  ListingSummary,
  ListingStatus,
  Photo,
  PriceSuggestion,
  PropertyFeature,
  PropertyProfileInput,
  PropertyType,
  ReorderPhotosInput,
  VehicleProfileInput,
} from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  startListingBoost,
  fetchFipeBrands,
  fetchFipeModels,
  fetchFipeReference,
  fetchFipePrice,
  fetchProfile,
  updateProfile,
  fetchFipeVersions,
  fetchListings,
  type SearchParams,
  classifyListingPhotos,
  createListing,
  deleteListingPhoto,
  extractCrlvData,
  fetchPriceSuggestion,
  generateListingDraft,
  importListingFromText,
  importListingFromUrl,
  recommendProperty,
  recommendVehicle,
  type RecommendPropertyResult,
  type RecommendVehicleResult,
  reorderListingPhotos,
  type ReorderPhotosResult,
  updateListingStatus,
  updatePhotoCaption,
  uploadListingPhotos,
} from "@/lib/api";
import { parseListingsCsv } from "@/lib/csv-listings";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// Chamada direta por PriceSuggestionHint (client component) — uma Server
// Action evita o navegador precisar falar com a API (que só libera CORS pra
// WEB_ORIGIN) e mantém o mesmo limite de sempre: o site nunca fala com a API
// de dentro do navegador, só o servidor do Next.
export async function suggestPriceAction(query: {
  assetType: "vehicle" | "property";
  brand?: string;
  model?: string;
  propertyType?: string;
  city?: string;
}): Promise<PriceSuggestion | undefined> {
  return fetchPriceSuggestion(query);
}

export async function fipeBrandsAction(): Promise<string[]> {
  return fetchFipeBrands();
}

// ---------- Cadastro de carro em passo a passo (ver VehicleListingWizard) ----------
// Ações que devolvem resultado (em vez de redirect) porque o passo a passo é
// um componente de cliente que decide sozinho pra onde ir e em qual tela
// mostrar o erro.

export type WizardResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export async function createVehicleFromWizardAction(
  input: CreateListingInput,
  phone?: string,
  cpf?: string,
): Promise<WizardResult<string>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo para publicar." };

  // Conta antiga sem CPF: o passo a passo pede na tela de contato.
  if (cpf) {
    const saved = await updateProfile({ cpf }, session.accessToken);
    if (!saved.ok) return { ok: false, error: saved.error };
  }

  // Telefone digitado no cadastro vira o do perfil (é ele que o botão de
  // WhatsApp do anúncio usa) — só quando a pessoa ainda não tinha um.
  const digits = phone?.replace(/\D/g, "");
  if (digits && digits.length >= 10) {
    const profile = await fetchProfile(session.accessToken);
    if (profile && !profile.phone) await updateProfile({ phone: digits }, session.accessToken);
  }

  const result = await createListing(input, session.accessToken);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/conta/anuncios");
  return { ok: true, value: result.listing.id };
}

export async function uploadWizardPhotosAction(listingId: string, formData: FormData): Promise<WizardResult> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo para enviar as fotos." };
  const result = await uploadListingPhotos(listingId, formData, session.accessToken);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/anuncio/${listingId}`);
  return { ok: true, value: undefined };
}

export async function generateVehicleTextAction(
  summary: string,
  assetType: "vehicle" | "property" = "vehicle",
): Promise<WizardResult<{ title: string; description: string }>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await generateListingDraft({ assetType, freeText: summary }, session.accessToken);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: { title: result.draft.title, description: result.draft.description } };
}

// Busca de imóveis com mapa: refaz a busca com a área visível do mapa.
export async function searchPropertiesInAreaAction(params: SearchParams, bbox: string): Promise<ListingSummary[]> {
  return fetchListings({ ...params, assetType: "property", bbox }).catch(() => []);
}

// "Imóveis parecidos na região" ao lado da tela de valores do cadastro de
// imóvel — mesmo bairro, tipo e finalidade; sem nada no bairro, a cidade.
export async function similarPropertiesAction(filters: {
  city: string;
  neighborhood?: string;
  propertyType?: string;
  purpose: "sale" | "rent";
}): Promise<ListingSummary[]> {
  const base = { assetType: "property" as const, city: filters.city, propertyType: filters.propertyType || undefined, purpose: filters.purpose, limit: 6 };
  const inNeighborhood = filters.neighborhood
    ? await fetchListings({ ...base, neighborhood: filters.neighborhood }).catch(() => [])
    : [];
  if (inNeighborhood.length) return inNeighborhood;
  return fetchListings(base).catch(() => []);
}

// Plano do anúncio (pessoa física): o passo a passo chama isto depois de
// publicar; a página "Turbinar" usa a versão de formulário logo abaixo.
export async function startBoostAction(listingId: string, tier: string): Promise<WizardResult<{ url?: string }>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await startListingBoost(listingId, tier, session.accessToken);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/anuncio/${listingId}`);
  return { ok: true, value: { url: result.value.url } };
}

export async function boostFormAction(listingId: string, tier: string): Promise<void> {
  const result = await startBoostAction(listingId, tier);
  if (!result.ok) redirect(`/anuncio/${listingId}/turbinar?erro=${encodeURIComponent(result.error)}`);
  redirect(result.value.url ?? `/anuncio/${listingId}?pagamento=ok`);
}

export async function fipeVersionsAction(brand: string, model: string, yearModel?: number): Promise<FipeVersion[]> {
  return fetchFipeVersions(brand, model, yearModel);
}

export async function fipeModelsAction(brand: string, yearModel?: number): Promise<FipeModelSuggestion[]> {
  return fetchFipeModels(brand, yearModel);
}

export async function fipeReferenceAction(brand: string, model: string, yearModel: number): Promise<FipePrice | undefined> {
  return fetchFipeReference(brand, model, yearModel);
}

export async function fipePriceAction(brand: string, modelCode: number, yearModel: number): Promise<FipePrice | undefined> {
  return fetchFipePrice(brand, modelCode, yearModel);
}

// Botão "qual carro é ideal pra mim?" — mesma lógica de Server Action que
// suggestPriceAction acima: evita o navegador falar direto com a API.
export async function recommendVehicleAction(input: VehicleProfileInput): Promise<RecommendVehicleResult> {
  return recommendVehicle(input);
}

// Mesma ideia acima, pra imóvel.
export async function recommendPropertyAction(input: PropertyProfileInput): Promise<RecommendPropertyResult> {
  return recommendProperty(input);
}

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Gera o rascunho e manda de volta pro próprio /anunciar via querystring
// (?draftTitle=...), que o formulário lê como defaultValue — evita
// transformar a tela inteira num client component só pra pré-preencher
// título/descrição (mesma técnica do "preset" no Passaporte Digital).
export async function generateListingDraftAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const assetType = formData.get("assetType") === "property" ? "property" : "vehicle";
  const freeText = str(formData, "freeText");

  const result = await generateListingDraft({ assetType, freeText }, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=${assetType}${assetType === "vehicle" ? "&modo=completo" : ""}&error=${encodeURIComponent(result.error)}`);
  }

  // Preserva o que já tinha vindo do CRLV (campos ocultos no formulário, ver
  // /anunciar) — essa ação só soma título/descrição/preço, nunca apaga o
  // que já estava preenchido por outra fonte.
  const params = new URLSearchParams({ tipo: assetType });
  for (const field of [
    "draftBrand",
    "draftModel",
    "draftVersion",
    "draftYearManufacture",
    "draftYearModel",
    "draftFuelType",
    "draftColor",
    "draftPlate",
  ]) {
    const value = str(formData, field);
    if (value) params.set(field, value);
  }
  params.set("draftTitle", result.draft.title);
  params.set("draftDescription", result.draft.description);
  if (result.draft.suggestedPrice) params.set("draftPrice", String(result.draft.suggestedPrice));
  redirect(`/anunciar?${params.toString()}`);
}

// Leitura automática do CRLV (ver AiService.extractCrlvData). O formData já
// chega com o campo "crlv" (File) e "plateStart" — repassa direto pro
// backend, sem reempacotar, e volta pro próprio /anunciar com os dados
// extraídos pré-preenchidos via querystring (mesma técnica do rascunho por
// texto livre acima).
export async function extractCrlvAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await extractCrlvData(formData, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=vehicle&modo=completo&error=${encodeURIComponent(result.error)}`);
  }

  // Preserva o que já tinha vindo do gerador de texto por IA (campos ocultos
  // no formulário) — mesma lógica de generateListingDraftAction acima, só
  // que na direção contrária.
  const params = new URLSearchParams({ tipo: "vehicle" });
  for (const field of ["draftTitle", "draftDescription", "draftPrice"]) {
    const value = str(formData, field);
    if (value) params.set(field, value);
  }

  const data = result.data;
  if (data.brand) params.set("draftBrand", data.brand);
  if (data.model) params.set("draftModel", data.model);
  if (data.version) params.set("draftVersion", data.version);
  if (data.yearManufacture) params.set("draftYearManufacture", String(data.yearManufacture));
  if (data.yearModel) params.set("draftYearModel", String(data.yearModel));
  if (data.fuelType) params.set("draftFuelType", data.fuelType);
  if (data.color) params.set("draftColor", data.color);
  if (data.plate) params.set("draftPlate", data.plate);
  redirect(`/anunciar?${params.toString()}`);
}

export async function createListingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const assetType = formData.get("assetType") === "property" ? "property" : "vehicle";
  const core = {
    title: str(formData, "title"),
    description: str(formData, "description"),
    price: num(formData, "price") ?? 0,
    city: str(formData, "city"),
    state: str(formData, "state").toUpperCase(),
    neighborhood: str(formData, "neighborhood") || undefined,
  };

  const input: CreateListingInput =
    assetType === "vehicle"
      ? {
          assetType: "vehicle",
          ...core,
          brand: str(formData, "brand"),
          model: str(formData, "model"),
          version: str(formData, "version") || undefined,
          yearManufacture: num(formData, "yearManufacture") ?? 0,
          yearModel: num(formData, "yearModel") ?? 0,
          mileage: num(formData, "mileage") ?? 0,
          transmission: str(formData, "transmission") as "manual" | "automatic",
          fuelType: str(formData, "fuelType") as
            | "flex"
            | "gasoline"
            | "ethanol"
            | "diesel"
            | "electric"
            | "hybrid",
          color: str(formData, "color"),
          doors: num(formData, "doors"),
          plate: str(formData, "plate") || undefined,
          fipeModelCode: num(formData, "fipeModelCode"),
          features: formData.getAll("features").map(String),
          conditions: formData.getAll("conditions").map(String),
        }
      : {
          assetType: "property",
          ...core,
          propertyType: str(formData, "propertyType") as PropertyType,
          purpose: str(formData, "purpose") as "sale" | "rent",
          bedrooms: num(formData, "bedrooms"),
          suites: num(formData, "suites"),
          bathrooms: num(formData, "bathrooms"),
          parkingSpots: num(formData, "parkingSpots"),
          floor: num(formData, "floor"),
          areaM2: num(formData, "areaM2") ?? 0,
          totalAreaM2: num(formData, "totalAreaM2"),
          condoFee: num(formData, "condoFee"),
          iptu: num(formData, "iptu"),
          features: formData.getAll("features") as PropertyFeature[],
          streetAddress: str(formData, "streetAddress"),
        };

  const result = await createListing(input, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=${assetType}${assetType === "vehicle" ? "&modo=completo" : ""}&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  redirect(`/anuncio/${result.listing.id}`);
}

export async function updateListingStatusAction(listingId: string, status: ListingStatus): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await updateListingStatus(listingId, status, session.accessToken);
  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  revalidatePath(`/anuncio/${listingId}`);
}

// Variante usada pelo painel do parceiro (ver /parceiro/anuncios): permite
// informar o valor efetivo de venda (pode fechar abaixo/acima do anunciado),
// que alimenta o relatório de vendas em /parceiro/vendas. Campo vazio cai no
// padrão da API (preço anunciado).
export async function markListingSoldAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const number = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? Number(raw) : undefined;
  };

  await updateListingStatus(listingId, "sold", session.accessToken, number("soldPrice"), number("costPrice"));
  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/parceiro");
  revalidatePath("/parceiro/anuncios");
  revalidatePath("/parceiro/vendas");
  revalidatePath(`/anuncio/${listingId}`);
}

export async function uploadPhotosAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await uploadListingPhotos(listingId, formData, session.accessToken);
  if (!result.ok) {
    redirect(`/anuncio/${listingId}/fotos?erro=${encodeURIComponent(result.error)}`);
  }

  // A organização por IA roda depois, já na tela de fotos (ver
  // PhotoGallery.tsx) — chamá-la aqui e esperar o resultado (até ~1min pra
  // várias fotos) deixava esse envio parecendo travado, sem nenhum aviso de
  // carregamento na tela.
  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath(`/anuncio/${listingId}`);
  revalidatePath(`/anuncio/${listingId}/fotos`);
  redirect(`/anuncio/${listingId}/fotos`);
}

// Botões de reorganizar na galeria (ver components/PhotoGallery.tsx) — a
// sugestão automática acima nunca é a palavra final.
export async function reorderPhotosAction(listingId: string, input: ReorderPhotosInput): Promise<ReorderPhotosResult> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await reorderListingPhotos(listingId, input, session.accessToken);
  if (result.ok) {
    revalidatePath(`/anuncio/${listingId}`);
    revalidatePath(`/anuncio/${listingId}/fotos`);
  }
  return result;
}

export async function updatePhotoCaptionAction(listingId: string, photoId: string, caption: string): Promise<boolean> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const ok = await updatePhotoCaption(listingId, photoId, caption, session.accessToken);
  if (ok) revalidatePath(`/anuncio/${listingId}/fotos`);
  return ok;
}

export async function reclassifyPhotosAction(listingId: string): Promise<Photo[] | undefined> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const photos = await classifyListingPhotos(listingId, session.accessToken);
  if (photos) {
    revalidatePath(`/anuncio/${listingId}`);
    revalidatePath(`/anuncio/${listingId}/fotos`);
  }
  return photos;
}

// Chamado direto como função pela galeria (ver components/PhotoGallery.tsx),
// não mais como <form action>: precisa devolver se deu certo pra galeria
// atualizar seu próprio estado local (photos) — um <form action> aqui não
// retorna nada pro client, então a foto excluída no servidor continuava
// aparecendo na tela até recarregar a página.
export async function deletePhotoAction(listingId: string, photoId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const ok = await deleteListingPhoto(listingId, photoId, session.accessToken);
  if (ok) {
    revalidatePath("/");
    revalidatePath("/busca");
    revalidatePath(`/anuncio/${listingId}`);
    revalidatePath(`/anuncio/${listingId}/fotos`);
  }
  return ok;
}

export type ImportListingsRowError = { row: number; ok: false; error?: string; title?: string };
type ImportListingsRowResult = { row: number; ok: true; title?: string } | ImportListingsRowError;
export type ImportListingsSummary = { total: number; success: number; errors: ImportListingsRowError[] };

// Importação em lote: cada linha do CSV vira uma chamada normal a
// createListing (mesma validação, mesmo "nasce pending_review" de sempre) —
// uma linha ruim não derruba as outras, só entra no resumo como erro. Sem
// endpoint novo na API: é a mesma POST /listings de sempre, repetida.
export async function importListingsCsvAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/parceiro/anuncios/importar?error=${encodeURIComponent("Selecione um arquivo CSV.")}`);
  }

  // Excel no Windows salva o CSV em Windows-1252 (acentos viram "�" se
  // lidos como UTF-8) — tenta UTF-8 e, se não for, cai no do Windows.
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  const parsedRows = parseListingsCsv(text);
  if (parsedRows.length === 0) {
    redirect(`/parceiro/anuncios/importar?error=${encodeURIComponent("O CSV está vazio ou não tem linhas de dados.")}`);
  }

  const results: ImportListingsRowResult[] = [];
  for (const { row, result } of parsedRows) {
    if (!result.ok) {
      results.push({ row, ok: false, error: result.error });
      continue;
    }
    const created = await createListing(result.input, session.accessToken);
    results.push(
      created.ok
        ? { row, ok: true, title: created.listing.title }
        : { row, ok: false, error: created.error, title: result.input.title },
    );
  }

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  revalidatePath("/parceiro/anuncios");

  const allErrors = results.filter((r) => !r.ok);
  const summary = { total: results.length, success: results.length - allErrors.length, errors: allErrors.slice(0, 20) };
  redirect(`/parceiro/anuncios/importar?resultado=${encodeURIComponent(JSON.stringify(summary))}`);
}

// "Importar pelo link" (/anunciar/importar).
export async function importListingFromUrlAction(url: string): Promise<WizardResult<ImportedListing>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await importListingFromUrl(url.trim(), session.accessToken);
  return result.ok ? { ok: true, value: result.value } : result;
}

export async function importListingFromTextAction(text: string, sourceUrl?: string): Promise<WizardResult<ImportedListing>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await importListingFromText(text, /^https?:\/\//i.test(sourceUrl ?? "") ? sourceUrl : undefined, session.accessToken);
  return result.ok ? { ok: true, value: result.value } : result;
}
