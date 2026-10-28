"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Car, Check, MagnifyingGlass, Sparkle, Warning } from "@phosphor-icons/react";
import {
  VEHICLE_BODY_TYPE_OPTIONS,
  VEHICLE_COMPLETE_FEATURES,
  VEHICLE_CONDITION_OPTIONS,
  VEHICLE_FEATURE_OPTIONS,
  VEHICLE_STEERING_OPTIONS,
  YOUTUBE_URL_REGEX,
  formatBRL,
  isValidCpf,
  type ListingTierId,
  type CreateListingInput,
  type FipeModelSuggestion,
  type FipeVersion,
} from "@novoseminovo/shared-types";
import {
  createVehicleFromWizardAction,
  fipeBrandsAction,
  fipeModelsAction,
  fipePriceAction,
  fipeReferenceAction,
  fipeVersionsAction,
  generateVehicleTextAction,
  startBoostAction,
  uploadWizardPhotosAction,
} from "@/lib/actions/listings";
import { FUEL_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/vehicle-options";
import {
  Chip,
  Field,
  Intro,
  MAX_PHOTOS,
  PhotoGrid,
  PlanPicker,
  PlanSummary,
  Select,
  Step,
  TermsDialog,
  Toggle,
  clearDraft,
  digits,
  formatCep,
  formatCpf,
  formatPhone,
  formatThousands,
  inputClass,
  preparePhotos,
  takeImportedPhotos,
  importOrigin,
  ImportShortcut,
  publishLabel,
  type WizardPhoto,
} from "@/components/wizard/WizardParts";

// Cadastro de carro em passo a passo (uma pergunta por tela, estilo
// Seminovos/Webmotors). Tudo fica no navegador até "Publicar": aí cria o
// anúncio (createVehicleFromWizardAction) e sobe as fotos em lotes, na
// ordem escolhida (a primeira vira capa). O rascunho, menos as fotos, fica
// salvo no localStorage pra não perder nada se a página recarregar.

const DRAFT_KEY = "ns-anunciar-carro";
const QUICK_SALE_DISCOUNT = 0.03;
const CURRENT_YEAR = new Date().getFullYear();
// Trocar marca, modelo ou ano invalida versão e preço FIPE já achados.
const CLEAR_FIPE = { fipeModelCode: undefined, fipePrice: undefined, fipeApprox: false, version: "" } satisfies Partial<Draft>;

const COLORS = ["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Marrom", "Bege", "Verde", "Amarelo", "Dourado", "Laranja", "Vinho", "Outra"];
const ENGINES = ["1.0", "1.0 Turbo", "1.2", "1.3", "1.4", "1.4 Turbo", "1.5", "1.6", "1.8", "2.0", "2.0 Turbo", "2.4", "2.5", "2.8", "3.0 ou mais", "Elétrico"];
const DOORS = ["2", "3", "4", "5"];
// Condições perguntadas na tela de preço; "aceita troca" fica na de contato.
const PRICE_CONDITIONS = VEHICLE_CONDITION_OPTIONS.filter((option) => option.value !== "accepts_trade");

type Draft = {
  plate: string;
  brand: string;
  model: string;
  yearManufacture: string;
  yearModel: string;
  fipeModelCode?: number;
  fipePrice?: number;
  // FIPE achada pelo nome do modelo, sem versão escolhida (valor aproximado).
  fipeApprox?: boolean;
  version: string;
  mileage: string;
  bodyType: string;
  transmission: string;
  steering: string;
  engine: string;
  doors: string;
  fuelType: string;
  color: string;
  features: string[];
  videoUrl: string;
  title: string;
  description: string;
  price: string;
  conditions: string[];
  financingEnabled: boolean;
  cep: string;
  city: string;
  state: string;
  neighborhood: string;
  showPhone: boolean;
  acceptsTrade: boolean;
  phone: string;
  planTier: ListingTierId;
};

const EMPTY: Draft = {
  plate: "",
  brand: "",
  model: "",
  yearManufacture: "",
  yearModel: "",
  version: "",
  mileage: "",
  bodyType: "",
  transmission: "",
  steering: "",
  engine: "",
  doors: "",
  fuelType: "",
  color: "",
  features: [],
  videoUrl: "",
  title: "",
  description: "",
  price: "",
  conditions: [],
  financingEnabled: true,
  cep: "",
  city: "",
  state: "",
  neighborhood: "",
  showPhone: true,
  acceptsTrade: false,
  phone: "",
  planTier: "free",
};

type StepId =
  | "intro1"
  | "plate"
  | "car"
  | "version"
  | "mileage"
  | "technical"
  | "features"
  | "intro2"
  | "photos"
  | "video"
  | "description"
  | "price"
  | "location"
  | "contact"
  | "plan"
  | "review";

const STEPS: StepId[] = [
  "intro1",
  "plate",
  "car",
  "version",
  "mileage",
  "technical",
  "features",
  "intro2",
  "photos",
  "video",
  "description",
  "price",
  "location",
  "contact",
  "plan",
  "review",
];

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

// O que dá pra deduzir do nome da versão na FIPE ("ARGO DRIVE 1.0 6V Flex",
// "COROLLA XEi 2.0 Flex 16V Aut.") — só preenche campo vazio.
function guessFromVersion(name: string): Partial<Draft> {
  const guess: Partial<Draft> = {};
  const engine = /\b(\d\.\d)\b/.exec(name)?.[1];
  if (engine) guess.engine = /turbo|tsi|tfsi|\bT\b|200 TSI/i.test(name) ? `${engine} Turbo` : engine;
  if (/\b(aut|automático|automatico|cvt|at|dsg|tiptronic)\b/i.test(name)) guess.transmission = "automatic";
  if (/\bflex\b/i.test(name)) guess.fuelType = "flex";
  else if (/\bdiesel\b/i.test(name)) guess.fuelType = "diesel";
  else if (/\b(elétrico|eletrico|ev)\b/i.test(name)) guess.fuelType = "electric";
  else if (/\b(híbrido|hibrido|hybrid)\b/i.test(name)) guess.fuelType = "hybrid";
  const doors = /\b(\d)p\b/i.exec(name)?.[1];
  if (doors) guess.doors = doors;
  return guess;
}

export function VehicleListingWizard({
  aiEnabled,
  profilePhone,
  isPartner,
  needsCpf = false,
  inApp = false,
}: {
  aiEnabled: boolean;
  profilePhone?: string;
  isPartner: boolean;
  // Dentro do app do celular não há escolha de plano pago (lib/app-context.ts).
  inApp?: boolean;
  // Conta de pessoa física sem CPF (antiga ou login social): pede na tela de contato.
  needsCpf?: boolean;
}) {
  const router = useRouter();
  // Loja não escolhe plano por anúncio (o plano mensal dela já cobre).
  const hidePlans = isPartner || inApp;
  const steps = useMemo(() => (hidePlans ? STEPS.filter((id) => id !== "plan") : STEPS), [hidePlans]);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, phone: profilePhone ? formatPhone(profilePhone) : "" });
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [photos, setPhotos] = useState<WizardPhoto[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [brands, setBrands] = useState<string[]>([]);
  const [versions, setVersions] = useState<FipeVersion[] | undefined>();
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [models, setModels] = useState<FipeModelSuggestion[]>([]);
  const [fipeLookup, setFipeLookup] = useState<"idle" | "loading" | "none">("idle");
  const [busy, setBusy] = useState<string | undefined>();
  const [showTerms, setShowTerms] = useState(false);
  const [featureQuery, setFeatureQuery] = useState("");
  const [cpf, setCpf] = useState("");
  const versionsKey = useRef("");

  const current = steps[step]!;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Rascunho salvo (menos as fotos, que não cabem no localStorage).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { draft: Draft; step: number };
        setDraft((d) => ({ ...d, ...parsed.draft, phone: parsed.draft.phone || d.phone }));
        setStep(Math.min(parsed.step, steps.indexOf("photos")));
        setRestored(true);
      }
    } catch {
      // sem localStorage (aba anônima etc.): segue sem rascunho
    }
    setLoaded(true);
    // Veio de "Importar pelo link": baixa as fotos do anúncio original.
    void takeImportedPhotos("vehicle")
      .then((files) => (files.length ? preparePhotos(files, 0) : undefined))
      .then((result) => {
        if (result?.added.length) setPhotos((list) => (list.length ? list : result.added));
      });
    void fipeBrandsAction().then(setBrands).catch(() => setBrands([]));
  }, []);

  // Só grava depois de ler o rascunho salvo — senão o estado inicial (vazio)
  // apagaria o rascunho antes de ele ser lido (ex.: o que vem de
  // "Importar pelo link").
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step }));
    } catch {
      // ignora
    }
  }, [draft, step, loaded]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // Modelos sugeridos assim que marca e ano estão preenchidos (FIPE).
  useEffect(() => {
    if (current !== "car" || !draft.brand.trim()) return setModels([]);
    const year = Number(draft.yearModel || draft.yearManufacture);
    if (!Number.isInteger(year) || year < 1950 || year > CURRENT_YEAR + 1) return setModels([]);
    let stale = false;
    const timer = setTimeout(() => {
      void fipeModelsAction(draft.brand.trim(), year)
        .catch(() => [])
        .then((found) => {
          if (!stale) setModels(found);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [current, draft.brand, draft.yearModel, draft.yearManufacture]);

  // Etapa de preço sem FIPE da versão: busca a referência pelo modelo digitado.
  useEffect(() => {
    if (current !== "price" || draft.fipePrice) return;
    const year = Number(draft.yearModel);
    if (!draft.brand.trim() || !draft.model.trim() || !Number.isInteger(year)) return setFipeLookup("none");
    let stale = false;
    setFipeLookup("loading");
    void fipeReferenceAction(draft.brand.trim(), draft.model.trim(), year)
      .catch(() => undefined)
      .then((found) => {
        if (stale) return;
        if (found) set({ fipePrice: found.price, fipeApprox: true });
        setFipeLookup(found ? "idle" : "none");
      });
    return () => {
      stale = true;
    };
  }, [current, draft.brand, draft.model, draft.yearModel, draft.fipePrice]);

  // Versões da FIPE ao chegar na tela de versão (uma consulta por carro).
  useEffect(() => {
    if (current !== "version") return;
    const key = `${draft.brand}|${draft.model}|${draft.yearModel}`;
    if (versionsKey.current === key) return;
    versionsKey.current = key;
    setLoadingVersions(true);
    setVersions(undefined);
    void fipeVersionsAction(draft.brand, draft.model, Number(draft.yearModel))
      .catch(() => [])
      .then((found) => {
        setVersions(found);
        setLoadingVersions(false);
      });
  }, [current, draft.brand, draft.model, draft.yearModel]);

  async function chooseVersion(version: FipeVersion) {
    const guess = guessFromVersion(version.name);
    setDraft((d) => ({
      ...d,
      fipeModelCode: version.code,
      version: version.name,
      fipeApprox: false,
      engine: d.engine || guess.engine || "",
      transmission: d.transmission || guess.transmission || "",
      fuelType: d.fuelType || guess.fuelType || "",
      doors: d.doors || guess.doors || "",
    }));
    const fipe = await fipePriceAction(draft.brand, version.code, Number(draft.yearModel)).catch(() => undefined);
    setDraft((d) => ({
      ...d,
      fipePrice: fipe?.price,
      price: d.price || (fipe ? String(Math.round(fipe.price)) : ""),
    }));
  }

  const autoTitle = useMemo(() => {
    const versionShort = draft.version
      ? draft.version.replace(new RegExp(`^${draft.model}\\s*`, "i"), "").split(/\s+/).slice(0, 3).join(" ")
      : "";
    return [draft.brand, draft.model, versionShort, draft.yearModel].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }, [draft.brand, draft.model, draft.version, draft.yearModel]);

  function validate(id: StepId): string | undefined {
    const yf = Number(draft.yearManufacture);
    const ym = Number(draft.yearModel);
    switch (id) {
      case "plate":
        if (draft.plate && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(draft.plate)) return "Confira a placa (ex.: ABC1D23 ou ABC1234).";
        return undefined;
      case "car":
        if (!draft.brand.trim()) return "Escolha a marca.";
        if (!draft.model.trim()) return "Informe o modelo.";
        if (!yf || yf < 1950 || yf > CURRENT_YEAR + 1) return "Informe o ano de fabricação.";
        if (!ym || ym < yf || ym > yf + 1) return "O ano do modelo é o de fabricação ou o seguinte.";
        return undefined;
      case "mileage":
        if (draft.mileage === "") return "Informe a quilometragem.";
        return undefined;
      case "technical":
        if (!draft.transmission) return "Escolha o câmbio.";
        if (!draft.fuelType) return "Escolha o combustível.";
        if (!draft.color) return "Escolha a cor.";
        return undefined;
      case "photos":
        if (photos.length === 0) return "Adicione pelo menos uma foto — anúncio sem foto quase não recebe contato.";
        return undefined;
      case "video":
        if (draft.videoUrl.trim() && !YOUTUBE_URL_REGEX.test(draft.videoUrl.trim())) return "Use um link de vídeo do YouTube.";
        return undefined;
      case "description":
        if ((draft.title || autoTitle).trim().length < 5) return "Escreva um título com pelo menos 5 caracteres.";
        if (draft.description.trim().length < 20) return "Escreva uma descrição com pelo menos 20 caracteres (ou gere com a IA).";
        return undefined;
      case "price":
        if (!Number(digits(draft.price))) return "Informe o preço.";
        return undefined;
      case "location":
        if (!draft.city.trim()) return "Informe a cidade.";
        if (draft.state.trim().length !== 2) return "Informe a sigla do estado (ex.: SP).";
        return undefined;
      case "contact":
        if (draft.showPhone && digits(draft.phone).length < 10) return "Informe um telefone com DDD, ou desligue o WhatsApp.";
        if (needsCpf && !isValidCpf(cpf)) return "Informe um CPF válido — é uma conta por pessoa.";
        return undefined;
      default:
        return undefined;
    }
  }

  function next() {
    const problem = validate(current);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    if (current === "review") {
      setShowTerms(true);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function back() {
    setError(undefined);
    // Primeira tela: volta pro painel (/anunciar abriria este mesmo cadastro de novo).
    if (step === 0) router.push(isPartner ? "/parceiro/anuncios" : "/conta/anuncios");
    else setStep((s) => s - 1);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Preparando as fotos…");
    const { added, warning } = await preparePhotos(files, photos.length);
    setPhotos((list) => [...list, ...added]);
    setBusy(undefined);
    if (warning) setError(warning);
  }

  function movePhoto(index: number, to: number) {
    setPhotos((list) => {
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(to, 0, item!);
      return copy;
    });
  }

  function removePhoto(index: number) {
    setPhotos((list) => {
      URL.revokeObjectURL(list[index]!.url);
      return list.filter((_, i) => i !== index);
    });
  }

  async function generateText() {
    const feature = (value: string) => VEHICLE_FEATURE_OPTIONS.find((o) => o.value === value)?.label ?? value;
    const condition = (value: string) => VEHICLE_CONDITION_OPTIONS.find((o) => o.value === value)?.label ?? value;
    const summary = [
      `${draft.brand} ${draft.model} ${draft.version} ${draft.yearManufacture}/${draft.yearModel}`,
      `${formatThousands(draft.mileage)} km, cor ${draft.color.toLowerCase()}, câmbio ${draft.transmission === "automatic" ? "automático" : "manual"}`,
      draft.features.length ? `Opcionais: ${draft.features.map(feature).join(", ")}` : "",
      draft.conditions.length ? `Condições: ${draft.conditions.map(condition).join(", ")}` : "",
      draft.acceptsTrade ? "Aceita troca" : "",
      draft.description.trim() ? `O que o vendedor escreveu: ${draft.description.trim()}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    setBusy("Escrevendo com a IA…");
    const result = await generateVehicleTextAction(summary).catch(() => ({ ok: false as const, error: "Não foi possível gerar agora." }));
    setBusy(undefined);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    set({ title: result.value.title.slice(0, 80), description: result.value.description.slice(0, 2000) });
  }

  async function publish() {
    setShowTerms(false);
    setError(undefined);
    const conditions = [...draft.conditions, ...(draft.acceptsTrade ? ["accepts_trade"] : [])];
    const input: Extract<CreateListingInput, { assetType: "vehicle" }> = {
      importUrl: importOrigin("vehicle"),
      assetType: "vehicle",
      title: (draft.title || autoTitle).trim(),
      description: draft.description.trim(),
      price: Number(digits(draft.price)),
      city: draft.city.trim(),
      state: draft.state.trim().toUpperCase(),
      neighborhood: draft.neighborhood.trim() || undefined,
      brand: draft.brand.trim(),
      model: draft.model.trim(),
      version: draft.version.trim() || undefined,
      yearManufacture: Number(draft.yearManufacture),
      yearModel: Number(draft.yearModel),
      mileage: Number(digits(draft.mileage)) || 0,
      transmission: draft.transmission as "manual" | "automatic",
      fuelType: draft.fuelType as Extract<CreateListingInput, { assetType: "vehicle" }>["fuelType"],
      color: draft.color,
      doors: draft.doors ? Number(draft.doors) : undefined,
      plate: draft.plate || undefined,
      fipeModelCode: draft.fipeModelCode,
      bodyType: draft.bodyType || undefined,
      steering: draft.steering || undefined,
      engine: draft.engine || undefined,
      videoUrl: draft.videoUrl.trim() || undefined,
      financingEnabled: draft.financingEnabled,
      showPhone: draft.showPhone,
      features: draft.features,
      conditions,
    };

    setBusy("Publicando o anúncio…");
    const created = await createVehicleFromWizardAction(input, draft.showPhone ? draft.phone : undefined, needsCpf ? cpf : undefined).catch(() => ({
      ok: false as const,
      error: "Não foi possível falar com o servidor. Tente de novo.",
    }));
    if (!created.ok) {
      setBusy(undefined);
      setError(created.error);
      // Erro de texto (ex.: telefone na descrição) volta pra tela da descrição.
      if (/título|descrição/i.test(created.error)) setStep(steps.indexOf("description"));
      else if (/CPF/i.test(created.error)) setStep(steps.indexOf("contact"));
      return;
    }

    // Fotos em lotes de 5, na ordem (a API dá a capa pra primeira).
    const listingId = created.value;
    for (let i = 0; i < photos.length; i += 5) {
      setBusy(`Enviando fotos ${Math.min(i + 5, photos.length)} de ${photos.length}…`);
      const form = new FormData();
      for (const photo of photos.slice(i, i + 5)) form.append("photos", photo.file);
      const sent = await uploadWizardPhotosAction(listingId, form).catch(() => ({ ok: false as const, error: "" }));
      if (!sent.ok) {
        clearDraft(DRAFT_KEY);
        router.push(`/anuncio/${listingId}/fotos?erro=${encodeURIComponent("O anúncio foi criado, mas algumas fotos não subiram. Envie de novo por aqui.")}`);
        return;
      }
    }
    clearDraft(DRAFT_KEY);
    if (!hidePlans && draft.planTier !== "free") {
      setBusy("Abrindo o pagamento…");
      const boost = await startBoostAction(listingId, draft.planTier).catch(() => ({ ok: false as const, error: "" }));
      if (boost.ok && boost.value.url) {
        window.location.assign(boost.value.url);
        return;
      }
      router.push(
        boost.ok
          ? `/anuncio/${listingId}?publicado=1&pagamento=ok`
          : `/anuncio/${listingId}/turbinar?erro=${encodeURIComponent(boost.error || "O anúncio foi publicado como Grátis — não foi possível abrir o pagamento agora.")}`,
      );
      return;
    }
    router.push(`/anuncio/${listingId}?publicado=1`);
  }

  function restart() {
    clearDraft(DRAFT_KEY);
    setDraft({ ...EMPTY, phone: profilePhone ? formatPhone(profilePhone) : "" });
    setPhotos([]);
    setStep(0);
    setRestored(false);
  }

  const price = Number(digits(draft.price));
  const ratio = draft.fipePrice && price ? price / draft.fipePrice : undefined;
  const quickSale = draft.fipePrice ? Math.round((draft.fipePrice * (1 - QUICK_SALE_DISCOUNT)) / 100) * 100 : undefined;
  const filteredFeatures = VEHICLE_FEATURE_OPTIONS.filter((option) =>
    option.label.toLowerCase().includes(featureQuery.trim().toLowerCase()),
  );
  const modelQuery = draft.model.trim().toLowerCase();
  const suggestedModels = (modelQuery ? models.filter((model) => model.name.toLowerCase().includes(modelQuery)) : models).slice(0, 40);
  const complete = VEHICLE_COMPLETE_FEATURES.every((value) => draft.features.includes(value));
  const progress = Math.round((step / (steps.length - 1)) * 100);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={back} aria-label="Voltar" className="rounded-full p-2 text-ink hover:bg-surface-sober">
          <ArrowLeft size={24} weight="bold" />
        </button>
        {restored && step < steps.indexOf("review") && (
          <button type="button" onClick={restart} className="text-xs font-semibold text-ink-muted hover:underline">
            Começar do zero
          </button>
        )}
      </div>

      <div className="mt-2 flex-1">
        {current === "intro1" && (
          <Intro
            icon={<Car size={72} weight="duotone" className="text-brand-blue" />}
            stage="Etapa 1 de 2"
            title="Primeiro, os dados do seu carro"
          >
            Placa, modelo, quilometragem e o que ele tem. Leva uns 3 minutos — e a placa nunca aparece no anúncio.
            {restored && <span className="mt-2 block font-semibold text-ink">Achamos um rascunho seu — é só continuar.</span>}
          </Intro>
        )}
        {current === "intro1" && <ImportShortcut />}

        {current === "plate" && (
          <Step title="Qual é a placa?" hint="Ela não aparece no anúncio. Serve para ligar o carro ao Passaporte Digital (histórico do veículo) — é opcional.">
            <div className="mx-auto mt-6 w-full max-w-sm overflow-hidden rounded-xl border-4 border-ink/80 bg-white shadow-card">
              <div className="flex items-center justify-between bg-brand-blue px-4 py-1.5 text-[11px] font-bold tracking-widest text-on-blue">
                <span>BRASIL</span>
                <span>MERCOSUL</span>
              </div>
              <input
                value={draft.plate}
                onChange={(event) => set({ plate: normalizePlate(event.target.value) })}
                placeholder="ABC1D23"
                aria-label="Placa"
                autoCapitalize="characters"
                className="w-full bg-white py-4 text-center font-mono text-4xl font-bold tracking-[0.2em] text-black placeholder:text-black/20 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                set({ plate: "" });
                setStep((s) => s + 1);
              }}
              className="mt-6 block w-full text-center text-sm font-semibold text-ink underline"
            >
              Não tenho a placa agora, continuar sem
            </button>
          </Step>
        )}

        {current === "car" && (
          <Step title="Qual é o carro?" hint="Usamos a tabela FIPE para achar a versão certa e sugerir o preço.">
            <Field label="Marca">
              {brands.length > 0 ? (
                <select value={draft.brand} onChange={(event) => set({ brand: event.target.value, ...CLEAR_FIPE })} className={inputClass}>
                  <option value="">Escolha a marca</option>
                  {brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={draft.brand} onChange={(event) => set({ brand: event.target.value, ...CLEAR_FIPE })} placeholder="Ex.: Fiat" className={inputClass} />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ano de fabricação">
                <input
                  inputMode="numeric"
                  value={draft.yearManufacture}
                  onChange={(event) => {
                    const value = digits(event.target.value).slice(0, 4);
                    set({ yearManufacture: value, yearModel: draft.yearModel || value, ...CLEAR_FIPE });
                  }}
                  placeholder="2021"
                  className={inputClass}
                />
              </Field>
              <Field label="Ano do modelo">
                <input
                  inputMode="numeric"
                  value={draft.yearModel}
                  onChange={(event) => set({ yearModel: digits(event.target.value).slice(0, 4), ...CLEAR_FIPE })}
                  placeholder="2022"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Modelo">
              <input
                value={draft.model}
                onChange={(event) => set({ model: event.target.value, ...CLEAR_FIPE })}
                placeholder={models.length > 0 ? "Digite ou escolha abaixo" : "Ex.: Argo, Onix, Corolla"}
                list="fipe-models"
                autoComplete="off"
                className={inputClass}
              />
              <datalist id="fipe-models">
                {models.map((model) => (
                  <option key={model.name} value={model.name} />
                ))}
              </datalist>
            </Field>
            {suggestedModels.length > 0 && (
              <div className="mt-1">
                <p className="text-xs font-semibold text-ink-muted">
                  {draft.model.trim() ? "Modelos parecidos" : `Modelos ${draft.brand} de ${draft.yearModel || draft.yearManufacture} na tabela FIPE`}
                </p>
                <div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {suggestedModels.map((model) => {
                    const selected = model.name.toLowerCase() === draft.model.trim().toLowerCase();
                    return (
                      <button
                        key={model.name}
                        type="button"
                        onClick={() => set({ model: model.name, ...CLEAR_FIPE })}
                        aria-pressed={selected}
                        className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                          selected ? "border-brand-green bg-brand-green text-on-green" : "border-border bg-surface-raised text-ink hover:bg-surface-sober"
                        }`}
                      >
                        {model.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Step>
        )}

        {current === "version" && (
          <Step title="Qual é a versão?" hint={`${draft.brand} ${draft.model} ${draft.yearModel} — escolha a versão da tabela FIPE.`}>
            {loadingVersions && <p className="mt-6 text-center text-sm text-ink-muted">Consultando a tabela FIPE…</p>}
            {versions && versions.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {versions.map((version) => {
                  const selected = draft.fipeModelCode === version.code;
                  return (
                    <li key={version.code}>
                      <button
                        type="button"
                        onClick={() => void chooseVersion(version)}
                        className={`flex w-full items-center justify-between gap-3 rounded-brand border-2 px-4 py-3 text-left ${
                          selected ? "border-brand-green bg-brand-green/10" : "border-border bg-surface-raised hover:bg-surface-sober"
                        }`}
                      >
                        <span>
                          <span className="block font-semibold text-ink">{version.name}</span>
                          <span className="text-xs text-ink-muted">{draft.yearModel}</span>
                        </span>
                        {selected && <Check size={22} weight="bold" className="shrink-0 text-brand-green" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {versions && versions.length === 0 && (
              <p className="mt-4 rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">
                Não encontramos esse modelo na tabela FIPE. Confira o nome do modelo na tela anterior, ou escreva a versão
                abaixo.
              </p>
            )}
            {!loadingVersions && (
              <Field label={versions && versions.length > 0 ? "Não achou? Escreva a versão" : "Versão"}>
                <input
                  value={draft.fipeModelCode ? "" : draft.version}
                  onChange={(event) => set({ version: event.target.value, fipeModelCode: undefined, fipePrice: undefined })}
                  placeholder="Ex.: Drive 1.0"
                  className={inputClass}
                />
              </Field>
            )}
            {draft.fipePrice && (
              <p className="mt-3 text-sm text-brand-green">Preço FIPE desta versão: {formatBRL(draft.fipePrice)}</p>
            )}
          </Step>
        )}

        {current === "mileage" && (
          <Step title="Qual a quilometragem?" hint="O que está no painel hoje. Ajuda o comprador a entender o estado do carro.">
            <div className="mt-10 flex items-baseline justify-center gap-2">
              <input
                inputMode="numeric"
                value={formatThousands(draft.mileage)}
                onChange={(event) => set({ mileage: digits(event.target.value).slice(0, 7) })}
                placeholder="0"
                aria-label="Quilometragem"
                className="w-56 border-b-2 border-brand-green bg-transparent text-center text-5xl font-extrabold text-ink focus:outline-none [font-variant-numeric:tabular-nums]"
              />
              <span className="text-2xl font-bold text-ink">km</span>
            </div>
          </Step>
        )}

        {current === "technical" && (
          <Step title="Últimos detalhes técnicos" hint="Essas informações ajudam o comprador a achar exatamente o que procura.">
            <Field label="Tipo de veículo">
              <Select value={draft.bodyType} onChange={(value) => set({ bodyType: value })} options={VEHICLE_BODY_TYPE_OPTIONS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Câmbio">
                <Select value={draft.transmission} onChange={(value) => set({ transmission: value })} options={TRANSMISSION_OPTIONS} />
              </Field>
              <Field label="Direção">
                <Select value={draft.steering} onChange={(value) => set({ steering: value })} options={VEHICLE_STEERING_OPTIONS} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Motor">
                <Select value={draft.engine} onChange={(value) => set({ engine: value })} options={ENGINES.map((v) => ({ value: v, label: v }))} />
              </Field>
              <Field label="Portas">
                <Select value={draft.doors} onChange={(value) => set({ doors: value })} options={DOORS.map((v) => ({ value: v, label: `${v} portas` }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Combustível">
                <Select value={draft.fuelType} onChange={(value) => set({ fuelType: value })} options={FUEL_OPTIONS} />
              </Field>
              <Field label="Cor">
                <Select value={draft.color} onChange={(value) => set({ color: value })} options={COLORS.map((v) => ({ value: v, label: v }))} />
              </Field>
            </div>
          </Step>
        )}

        {current === "features" && (
          <Step title="O que o carro tem?" hint="Quanto mais itens, mais contatos. Aparecem no anúncio e nos filtros da busca.">
            <button
              type="button"
              onClick={() =>
                set({
                  features: complete
                    ? draft.features.filter((value) => !VEHICLE_COMPLETE_FEATURES.includes(value))
                    : [...new Set([...draft.features, ...VEHICLE_COMPLETE_FEATURES])],
                })
              }
              className={`mt-4 flex w-full items-center gap-3 rounded-brand border-2 px-4 py-3 text-left ${
                complete ? "border-brand-green bg-brand-green/10" : "border-border bg-surface-raised"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${complete ? "border-brand-green bg-brand-green text-on-green" : "border-border"}`}>
                {complete && <Check size={14} weight="bold" />}
              </span>
              <span>
                <span className="block font-semibold text-ink">Veículo completo</span>
                <span className="text-xs text-ink-muted">Marca de uma vez: ar, direção, vidros, travas, airbag e ABS</span>
              </span>
            </button>
            <label className="relative mt-3 block">
              <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input value={featureQuery} onChange={(event) => setFeatureQuery(event.target.value)} placeholder="Buscar item…" className={`${inputClass} pl-9`} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {filteredFeatures.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={draft.features.includes(option.value)}
                  onToggle={() =>
                    set({
                      features: draft.features.includes(option.value)
                        ? draft.features.filter((value) => value !== option.value)
                        : [...draft.features, option.value],
                    })
                  }
                />
              ))}
            </div>
          </Step>
        )}

        {current === "intro2" && (
          <Intro icon={<Camera size={72} weight="duotone" className="text-brand-blue" />} stage="Etapa 2 de 2" title="Agora, deixe o anúncio irresistível">
            Fotos, descrição e preço. Dicas rápidas: fotografe de dia, com o carro limpo, na horizontal; mostre frente,
            traseira, laterais, painel, bancos e porta-malas.
          </Intro>
        )}

        {current === "photos" && (
          <Step
            title={`Adicione até ${MAX_PHOTOS} fotos`}
            hint={`A primeira é a capa. Use as setas para mudar a ordem. A placa é borrada automaticamente antes de publicar.${
              hidePlans ? "" : " O plano Grátis mostra 5 fotos; Flex 10, Turbo 15 e Nitro 20."
            }`}
          >
            <PhotoGrid photos={photos} onAdd={addPhotos} onMove={movePhoto} onRemove={removePhoto} />
          </Step>
        )}

        {current === "video" && (
          <Step
            title="Tem um vídeo do carro?"
            hint={`Cole o link de um vídeo do YouTube — ele aparece junto com as fotos. É opcional.${
              hidePlans ? "" : " O vídeo aparece nos planos Flex, Turbo e Nitro."
            }`}
          >
            <Field label="Link do YouTube">
              <input value={draft.videoUrl} onChange={(event) => set({ videoUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." className={inputClass} />
            </Field>
          </Step>
        )}

        {current === "description" && (
          <Step title="Agora, título e descrição" hint="Fale do estado do carro e dos diferenciais. Não coloque telefone, e-mail ou link — o anúncio é recusado.">
            <Field label="Título do anúncio">
              <input value={draft.title || autoTitle} maxLength={80} onChange={(event) => set({ title: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Descrição">
              <textarea
                value={draft.description}
                maxLength={2000}
                rows={7}
                onChange={(event) => set({ description: event.target.value })}
                placeholder="Ex.: Único dono, revisões em dia na concessionária, pneus novos, nunca bateu…"
                className={inputClass}
              />
            </Field>
            <p className="text-right text-xs text-ink-muted">{draft.description.length}/2000</p>
            {aiEnabled && (
              <button
                type="button"
                onClick={() => void generateText()}
                disabled={Boolean(busy)}
                className="mt-2 flex items-center gap-2 rounded-full border-2 border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-60"
              >
                <Sparkle size={18} weight="fill" />
                {draft.description.trim() ? "Melhorar com IA" : "Gerar descrição com IA"}
              </button>
            )}
          </Step>
        )}

        {current === "price" && (
          <Step title="Por quanto você quer vender?" hint="Anúncio com preço justo recebe muito mais contato.">
            <div className="mt-6 flex items-baseline justify-center gap-2">
              <span className="text-2xl font-bold text-ink">R$</span>
              <input
                inputMode="numeric"
                value={formatThousands(draft.price)}
                onChange={(event) => set({ price: digits(event.target.value).slice(0, 9) })}
                placeholder="0"
                aria-label="Preço"
                className="w-60 border-b-2 border-brand-green bg-transparent text-center text-5xl font-extrabold text-ink focus:outline-none [font-variant-numeric:tabular-nums]"
              />
            </div>
            {draft.fipePrice && quickSale && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="rounded-brand-lg border-2 border-brand-green bg-surface-raised px-4 py-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Preço de referência · Tabela FIPE</p>
                  <p className="font-display text-3xl font-bold text-ink [font-variant-numeric:tabular-nums]">{formatBRL(draft.fipePrice)}</p>
                  <p className="text-xs text-ink-muted">
                    {draft.brand} {draft.fipeApprox ? draft.model : draft.version || draft.model} {draft.yearModel}
                    {draft.fipeApprox && " — valor aproximado (sem a versão exata)"}. É só uma orientação: o preço final é você quem decide.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => set({ price: String(quickSale) })} className="rounded-brand border border-border px-3 py-2 text-left text-sm hover:bg-surface-sober">
                    <strong className="block text-ink">{formatBRL(quickSale)}</strong>
                    <span className="text-xs text-ink-muted">Venda mais rápida</span>
                  </button>
                  <button type="button" onClick={() => set({ price: String(Math.round(draft.fipePrice!)) })} className="rounded-brand border border-border px-3 py-2 text-left text-sm hover:bg-surface-sober">
                    <strong className="block text-ink">{formatBRL(draft.fipePrice)}</strong>
                    <span className="text-xs text-ink-muted">Igual à FIPE</span>
                  </button>
                </div>
              </div>
            )}
            {!draft.fipePrice && fipeLookup === "loading" && <p className="mt-4 text-center text-sm text-ink-muted">Consultando a Tabela FIPE…</p>}
            {!draft.fipePrice && fipeLookup === "none" && (
              <p className="mt-4 rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">
                Não encontramos a Tabela FIPE deste carro automaticamente. Você pode conferir em{" "}
                <a href="https://veiculos.fipe.org.br" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline">
                  veiculos.fipe.org.br
                </a>{" "}
                ou voltar e escolher a versão.
              </p>
            )}
            {ratio !== undefined && ratio < 0.8 && (
              <p className="mt-3 flex gap-2 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
                {Math.round((1 - ratio) * 100)}% abaixo da FIPE. Confira o valor — preço muito abaixo faz o comprador desconfiar de golpe.
              </p>
            )}
            {ratio !== undefined && ratio > 1.3 && (
              <p className="mt-3 flex gap-2 rounded-brand bg-brand-orange/10 px-3 py-2 text-sm text-ink">
                <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-orange" />
                {Math.round((ratio - 1) * 100)}% acima da FIPE — costuma demorar mais a vender.
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Toggle
                label="Permitir financiamento"
                description="Mostra a simulação de parcelas no anúncio e o comprador pode pedir financiamento — você vende à vista."
                checked={draft.financingEnabled}
                onChange={(value) => set({ financingEnabled: value })}
              />
              {PRICE_CONDITIONS.map((option) => (
                <Toggle
                  key={option.value}
                  label={option.label}
                  checked={draft.conditions.includes(option.value)}
                  onChange={(value) =>
                    set({
                      conditions: value ? [...draft.conditions, option.value] : draft.conditions.filter((c) => c !== option.value),
                    })
                  }
                />
              ))}
            </div>
          </Step>
        )}

        {current === "location" && (
          <Step title="Onde o carro está?" hint="Pelo CEP a gente preenche o resto. O CEP e a rua não aparecem no anúncio.">
            <Field label="CEP">
              <input
                inputMode="numeric"
                value={draft.cep}
                onChange={(event) => {
                  const cep = digits(event.target.value).slice(0, 8);
                  set({ cep: formatCep(cep) });
                  if (cep.length === 8) {
                    void fetch(`https://viacep.com.br/ws/${cep}/json/`)
                      .then((res) => res.json())
                      .then((data: { localidade?: string; uf?: string; bairro?: string; erro?: unknown }) => {
                        if (data.erro) throw new Error();
                        set({ city: data.localidade ?? draft.city, state: data.uf ?? draft.state, neighborhood: data.bairro ?? "" });
                      })
                      .catch(() => setError("CEP não encontrado. Preencha cidade e bairro abaixo."));
                  }
                }}
                placeholder="00000-000"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Field label="Cidade">
                <input value={draft.city} onChange={(event) => set({ city: event.target.value })} className={inputClass} />
              </Field>
              <Field label="UF">
                <input value={draft.state} maxLength={2} onChange={(event) => set({ state: event.target.value.toUpperCase() })} className={inputClass} />
              </Field>
            </div>
            <Field label="Bairro (opcional)">
              <input value={draft.neighborhood} onChange={(event) => set({ neighborhood: event.target.value })} className={inputClass} />
            </Field>
          </Step>
        )}

        {current === "contact" && (
          <Step title="Como quer ser contatado?" hint="O chat do site fica sempre ligado — e você é avisado de cada mensagem.">
            <div className="mt-4 flex flex-col gap-2">
              <Toggle
                label="Mostrar meu WhatsApp"
                description="Botão de WhatsApp no anúncio para os interessados."
                checked={draft.showPhone}
                onChange={(value) => set({ showPhone: value })}
              />
              <Toggle label="Aceito troca" description="Tenho interesse em propostas de troca." checked={draft.acceptsTrade} onChange={(value) => set({ acceptsTrade: value })} />
            </div>
            {draft.showPhone && (
              <Field label="Telefone/WhatsApp">
                <input
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(event) => set({ phone: formatPhone(event.target.value) })}
                  placeholder="(31) 99999-9999"
                  className={inputClass}
                  disabled={Boolean(profilePhone)}
                />
                {profilePhone && <span className="text-xs text-ink-muted">É o telefone do seu cadastro — para trocar, vá em Minha conta.</span>}
              </Field>
            )}
            {needsCpf && (
              <Field label="Seu CPF">
                <input
                  inputMode="numeric"
                  value={cpf}
                  onChange={(event) => setCpf(formatCpf(event.target.value))}
                  placeholder="000.000.000-00"
                  className={inputClass}
                />
                <span className="text-xs text-ink-muted">Uma conta por pessoa, para a segurança de todos. O CPF nunca aparece no anúncio.</span>
              </Field>
            )}
          </Step>
        )}

        {current === "plan" && (
          <Step title="Escolha seu plano" hint="Pagamento único, sem mensalidade. Em todos o anúncio fica no ar até vender.">
            <PlanPicker value={draft.planTier} onChange={(tier) => set({ planTier: tier })} photoCount={photos.length} videoLabel="Vídeo do veículo" />
          </Step>
        )}

        {current === "review" && (
          <Step title="Tudo pronto!" hint="Confira o resumo antes de publicar. Depois da aprovação, o anúncio aparece na busca.">
            <div className="mt-4 overflow-hidden rounded-brand border border-border bg-surface-raised">
              {photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0].url} alt="Capa" className="aspect-[16/9] w-full object-cover" />
              )}
              <div className="p-4">
                <p className="font-display text-lg font-semibold text-ink">{draft.title || autoTitle}</p>
                <p className="text-2xl font-extrabold text-ink">{price ? formatBRL(price) : "—"}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatThousands(draft.mileage)} km · {draft.city}/{draft.state} · {photos.length} foto(s)
                  {draft.videoUrl ? " · vídeo" : ""}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {[...draft.conditions.map((c) => VEHICLE_CONDITION_OPTIONS.find((o) => o.value === c)?.label ?? c), ...(draft.acceptsTrade ? ["Aceita troca"] : [])].map((label) => (
                    <li key={label} className="rounded-full bg-surface-sober px-2 py-0.5 text-ink">
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {!hidePlans && <PlanSummary tier={draft.planTier} />}
          </Step>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 mt-4 bg-surface-page pb-2 pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sober">
          <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          {busy && <span className="text-sm text-ink-muted">{busy}</span>}
          <button
            type="button"
            onClick={next}
            disabled={Boolean(busy)}
            className="flex items-center gap-2 rounded-full bg-brand-green px-6 py-3 text-base font-bold text-on-green hover:opacity-90 disabled:opacity-60"
          >
            {current === "intro1"
              ? "Vamos começar"
              : current === "intro2"
                ? "Combinado, continuar"
                : current === "review"
                  ? publishLabel(isPartner, hidePlans ? "free" : draft.planTier)
                  : "Continuar"}
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </div>

      {showTerms && <TermsDialog onCancel={() => setShowTerms(false)} onAccept={() => void publish()} />}
    </div>
  );
}

