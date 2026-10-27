"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, House, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import {
  YOUTUBE_URL_REGEX,
  formatBRL,
  isValidCpf,
  type CreateListingInput,
  type ListingSummary,
  type ListingTierId,
  type PropertyFeature,
  type PropertyType,
} from "@novoseminovo/shared-types";
import {
  createVehicleFromWizardAction,
  generateVehicleTextAction,
  similarPropertiesAction,
  startBoostAction,
  uploadWizardPhotosAction,
} from "@/lib/actions/listings";
import {
  PROPERTY_FEATURE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_TYPES_WITHOUT_CONDO,
  PROPERTY_TYPES_WITHOUT_ROOMS,
  PROPERTY_TYPES_WITH_FLOOR,
  PROPERTY_TYPES_WITH_TOTAL_AREA,
} from "@/lib/vehicle-options";
import {
  Chip,
  CountPicker,
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
  publishLabel,
  type WizardPhoto,
} from "@/components/wizard/WizardParts";

// Cadastro de imóvel em passo a passo (no molde da Netimóveis): finalidade e
// CEP, endereço, o imóvel, diferenciais, fotos, descrição, valores (com
// imóveis parecidos da região de referência), contato, plano e revisão.
// Mesmo esquema do VehicleListingWizard: rascunho no localStorage (menos
// as fotos), cria o anúncio e sobe as fotos em lotes ao publicar.

const DRAFT_KEY = "ns-anunciar-imovel";

type Draft = {
  purpose: "sale" | "rent";
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  propertyType: string;
  bedrooms: string;
  suites: string;
  bathrooms: string;
  parkingSpots: string;
  areaM2: string;
  totalAreaM2: string;
  floor: string;
  features: string[];
  videoUrl: string;
  title: string;
  description: string;
  price: string;
  iptu: string;
  condoFee: string;
  financingEnabled: boolean;
  showPhone: boolean;
  phone: string;
  planTier: ListingTierId;
};

const EMPTY: Draft = {
  purpose: "sale",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  propertyType: "",
  bedrooms: "",
  suites: "",
  bathrooms: "",
  parkingSpots: "",
  areaM2: "",
  totalAreaM2: "",
  floor: "",
  features: [],
  videoUrl: "",
  title: "",
  description: "",
  price: "",
  iptu: "",
  condoFee: "",
  financingEnabled: true,
  showPhone: true,
  phone: "",
  planTier: "free",
};

type StepId =
  | "intro1"
  | "intent"
  | "address"
  | "property"
  | "features"
  | "intro2"
  | "photos"
  | "video"
  | "description"
  | "values"
  | "contact"
  | "plan"
  | "review";

const STEPS: StepId[] = ["intro1", "intent", "address", "property", "features", "intro2", "photos", "video", "description", "values", "contact", "plan", "review"];

const PURPOSES = [
  { value: "sale", label: "Vender" },
  { value: "rent", label: "Alugar" },
] as const;

function typeLabel(value: string): string {
  return PROPERTY_TYPE_OPTIONS.find((option) => option.value === value)?.label.replace(/\s*\(.*\)$/, "") ?? "Imóvel";
}

function optionalInt(value: string): number | undefined {
  return value === "" ? undefined : Number(digits(value));
}

export function PropertyListingWizard({
  aiEnabled,
  profilePhone,
  isPartner,
  needsCpf = false,
}: {
  aiEnabled: boolean;
  profilePhone?: string;
  isPartner: boolean;
  needsCpf?: boolean;
}) {
  const router = useRouter();
  const steps = useMemo(() => (isPartner ? STEPS.filter((id) => id !== "plan") : STEPS), [isPartner]);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, phone: profilePhone ? formatPhone(profilePhone) : "" });
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [photos, setPhotos] = useState<WizardPhoto[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [showTerms, setShowTerms] = useState(false);
  const [cpf, setCpf] = useState("");
  const [similar, setSimilar] = useState<ListingSummary[] | undefined>();

  const current = steps[step]!;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const hasRooms = draft.propertyType ? !PROPERTY_TYPES_WITHOUT_ROOMS.has(draft.propertyType) : true;
  const hasFloor = PROPERTY_TYPES_WITH_FLOOR.has(draft.propertyType);
  const hasTotalArea = PROPERTY_TYPES_WITH_TOTAL_AREA.has(draft.propertyType);
  const hasCondo = !PROPERTY_TYPES_WITHOUT_CONDO.has(draft.propertyType);
  const isRent = draft.purpose === "rent";

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
    void takeImportedPhotos("property")
      .then((files) => (files.length ? preparePhotos(files, 0) : undefined))
      .then((result) => {
        if (result?.added.length) setPhotos((list) => (list.length ? list : result.added));
      });
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

  // Imóveis parecidos (referência de preço) ao chegar na tela de valores.
  useEffect(() => {
    if (current !== "values" || !draft.city) return;
    setSimilar(undefined);
    void similarPropertiesAction({
      city: draft.city,
      neighborhood: draft.neighborhood || undefined,
      propertyType: draft.propertyType || undefined,
      purpose: draft.purpose,
    })
      .catch(() => [])
      .then(setSimilar);
  }, [current, draft.city, draft.neighborhood, draft.propertyType, draft.purpose]);

  async function lookupCep(cep: string) {
    if (digits(cep).length !== 8) {
      setError("Informe os 8 números do CEP.");
      return false;
    }
    setBusy("Buscando o CEP…");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits(cep)}/json/`);
      const data = (await res.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: unknown };
      if (data.erro) throw new Error();
      setDraft((d) => ({
        ...d,
        street: data.logradouro || d.street,
        neighborhood: data.bairro || d.neighborhood,
        city: data.localidade || d.city,
        state: data.uf || d.state,
      }));
      return true;
    } catch {
      setError("CEP não encontrado. Confira o número ou preencha o endereço na próxima tela.");
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  const autoTitle = useMemo(() => {
    if (!draft.propertyType) return "";
    const rooms = hasRooms && Number(draft.bedrooms) ? `${draft.bedrooms} ${draft.bedrooms === "1" ? "quarto" : "quartos"}` : "";
    const area = draft.areaM2 ? `${draft.areaM2} m²` : "";
    const where = draft.neighborhood ? `no ${draft.neighborhood}` : draft.city ? `em ${draft.city}` : "";
    return [typeLabel(draft.propertyType), [rooms, area].filter(Boolean).join(", "), isRent ? "para alugar" : "à venda", where]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }, [draft.propertyType, draft.bedrooms, draft.areaM2, draft.neighborhood, draft.city, hasRooms, isRent]);

  function validate(id: StepId): string | undefined {
    switch (id) {
      case "address":
        if (draft.street.trim().length < 3) return "Informe a rua.";
        if (!draft.number.trim()) return "Informe o número (ou S/N).";
        if (!draft.neighborhood.trim()) return "Informe o bairro.";
        if (!draft.city.trim()) return "Informe a cidade.";
        if (draft.state.trim().length !== 2) return "Informe a sigla do estado (ex.: MG).";
        return undefined;
      case "property":
        if (!draft.propertyType) return "Escolha o tipo de imóvel.";
        if (!Number(digits(draft.areaM2))) return "Informe a área em m².";
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
      case "values":
        if (!Number(digits(draft.price))) return isRent ? "Informe o valor do aluguel." : "Informe o valor de venda.";
        return undefined;
      case "contact":
        if (draft.showPhone && digits(draft.phone).length < 10) return "Informe um telefone com DDD, ou desligue o WhatsApp.";
        if (needsCpf && !isValidCpf(cpf)) return "Informe um CPF válido — é uma conta por pessoa.";
        return undefined;
      default:
        return undefined;
    }
  }

  async function next() {
    const problem = validate(current);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    // CEP digitado e endereço ainda vazio: busca antes de seguir.
    if (current === "intent" && draft.cep && !draft.street) await lookupCep(draft.cep);
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
    const feature = (value: string) => PROPERTY_FEATURE_OPTIONS.find((o) => o.value === value)?.label ?? value;
    const summary = [
      `${typeLabel(draft.propertyType)} ${isRent ? "para alugar" : "à venda"} no bairro ${draft.neighborhood}, ${draft.city}`,
      `${draft.areaM2} m²`,
      hasRooms && draft.bedrooms ? `${draft.bedrooms} quartos${draft.suites ? ` (${draft.suites} suítes)` : ""}` : "",
      hasRooms && draft.bathrooms ? `${draft.bathrooms} banheiros` : "",
      draft.parkingSpots ? `${draft.parkingSpots} vagas` : "",
      hasFloor && draft.floor ? `${draft.floor}º andar` : "",
      draft.features.length ? `Diferenciais: ${draft.features.map(feature).join(", ")}` : "",
      draft.description.trim() ? `O que o anunciante escreveu: ${draft.description.trim()}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    setBusy("Escrevendo com a IA…");
    const result = await generateVehicleTextAction(summary, "property").catch(() => ({ ok: false as const, error: "Não foi possível gerar agora." }));
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
    const streetAddress = [draft.street.trim(), draft.number.trim(), draft.complement.trim()].filter(Boolean).join(", ");
    const input: Extract<CreateListingInput, { assetType: "property" }> = {
      assetType: "property",
      title: (draft.title || autoTitle).trim(),
      description: draft.description.trim(),
      price: Number(digits(draft.price)),
      city: draft.city.trim(),
      state: draft.state.trim().toUpperCase(),
      neighborhood: draft.neighborhood.trim() || undefined,
      propertyType: draft.propertyType as PropertyType,
      purpose: draft.purpose,
      bedrooms: hasRooms ? optionalInt(draft.bedrooms) : undefined,
      suites: hasRooms ? optionalInt(draft.suites) : undefined,
      bathrooms: hasRooms ? optionalInt(draft.bathrooms) : undefined,
      parkingSpots: optionalInt(draft.parkingSpots),
      floor: hasFloor ? optionalInt(draft.floor) : undefined,
      areaM2: Number(digits(draft.areaM2)),
      totalAreaM2: hasTotalArea && Number(digits(draft.totalAreaM2)) ? Number(digits(draft.totalAreaM2)) : undefined,
      condoFee: hasCondo && draft.condoFee ? Number(digits(draft.condoFee)) : undefined,
      iptu: draft.iptu ? Number(digits(draft.iptu)) : undefined,
      features: draft.features as PropertyFeature[],
      streetAddress: streetAddress.length >= 5 ? streetAddress : `${streetAddress}, ${draft.neighborhood}`,
      videoUrl: draft.videoUrl.trim() || undefined,
      financingEnabled: isRent ? false : draft.financingEnabled,
      showPhone: draft.showPhone,
    };

    setBusy("Publicando o anúncio…");
    const created = await createVehicleFromWizardAction(input, draft.showPhone ? draft.phone : undefined, needsCpf ? cpf : undefined).catch(() => ({
      ok: false as const,
      error: "Não foi possível falar com o servidor. Tente de novo.",
    }));
    if (!created.ok) {
      setBusy(undefined);
      setError(created.error);
      if (/título|descrição/i.test(created.error)) setStep(steps.indexOf("description"));
      else if (/CPF/i.test(created.error)) setStep(steps.indexOf("contact"));
      return;
    }

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
    if (!isPartner && draft.planTier !== "free") {
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
  const progress = Math.round((step / (steps.length - 1)) * 100);
  const moneyInput = (key: "price" | "iptu" | "condoFee", label: string, hint?: string) => (
    <Field label={label}>
      <span className="relative block">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">R$</span>
        <input
          inputMode="numeric"
          value={formatThousands(draft[key])}
          onChange={(event) => set({ [key]: digits(event.target.value).slice(0, key === "price" ? 10 : 7) })}
          placeholder="0"
          className={`${inputClass} pl-10 [font-variant-numeric:tabular-nums]`}
        />
      </span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </Field>
  );

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
          <Intro icon={<House size={72} weight="duotone" className="text-brand-blue" />} stage="Etapa 1 de 2" title="Primeiro, os dados do seu imóvel">
            Endereço, tipo, cômodos e diferenciais. Leva uns 3 minutos — o endereço completo nunca aparece no anúncio, só o bairro e a cidade.
            {restored && <span className="mt-2 block font-semibold text-ink">Achamos um rascunho seu — é só continuar.</span>}
          </Intro>
        )}

        {current === "intent" && (
          <Step title="O que você quer fazer?" hint="Pelo CEP a gente preenche o endereço.">
            <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Finalidade">
              {PURPOSES.map((option) => {
                const selected = draft.purpose === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set({ purpose: option.value })}
                    className={`rounded-brand border-2 py-3 text-base font-bold ${
                      selected ? "border-brand-blue bg-brand-blue text-on-blue" : "border-border bg-surface-raised text-ink hover:bg-surface-sober"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <Field label="CEP do imóvel">
              <span className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={draft.cep}
                  onChange={(event) => set({ cep: formatCep(event.target.value) })}
                  placeholder="00000-000"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void lookupCep(draft.cep).then((ok) => ok && setError(undefined))}
                  disabled={Boolean(busy)}
                  className="flex shrink-0 items-center gap-1.5 rounded-brand bg-brand-blue/10 px-4 text-sm font-bold text-brand-blue hover:bg-brand-blue/20 disabled:opacity-60"
                >
                  <MagnifyingGlass size={16} weight="bold" /> Buscar
                </button>
              </span>
            </Field>
            {draft.street && (
              <p className="text-sm text-brand-green">
                {draft.street} — {draft.neighborhood}, {draft.city}/{draft.state}
              </p>
            )}
            <a
              href="https://buscacepinter.correios.com.br/app/endereco/index.php"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-ink-muted underline"
            >
              Não sei o CEP
            </a>
          </Step>
        )}

        {current === "address" && (
          <Step
            title="Confira o endereço"
            hint={draft.street ? "Endereço obtido pelo CEP. Confira os dados e informe número e complemento." : "Preencha o endereço do imóvel."}
          >
            <Field label="Rua">
              <input value={draft.street} onChange={(event) => set({ street: event.target.value })} className={inputClass} />
            </Field>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="Número">
                <input value={draft.number} onChange={(event) => set({ number: event.target.value.slice(0, 10) })} placeholder="346" className={inputClass} />
              </Field>
              <Field label="Complemento (opcional)">
                <input value={draft.complement} onChange={(event) => set({ complement: event.target.value.slice(0, 40) })} placeholder="Ap 101, bloco B" className={inputClass} />
              </Field>
            </div>
            <Field label="Bairro">
              <input value={draft.neighborhood} onChange={(event) => set({ neighborhood: event.target.value })} className={inputClass} />
            </Field>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Field label="Cidade">
                <input value={draft.city} onChange={(event) => set({ city: event.target.value })} className={inputClass} />
              </Field>
              <Field label="UF">
                <input value={draft.state} maxLength={2} onChange={(event) => set({ state: event.target.value.toUpperCase() })} className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-ink-muted">Rua, número e complemento não aparecem no anúncio — só o bairro e a cidade.</p>
          </Step>
        )}

        {current === "property" && (
          <Step title="Sobre o imóvel" hint="Essas informações aparecem no anúncio e nos filtros da busca.">
            <Field label="Tipo de imóvel">
              <Select value={draft.propertyType} onChange={(value) => set({ propertyType: value })} options={PROPERTY_TYPE_OPTIONS} />
            </Field>
            {hasRooms && (
              <>
                <CountPicker label="Quartos" value={draft.bedrooms} onChange={(value) => set({ bedrooms: value })} />
                <CountPicker label="Suítes" value={draft.suites} onChange={(value) => set({ suites: value })} />
                <CountPicker label="Banheiros" value={draft.bathrooms} onChange={(value) => set({ bathrooms: value })} />
              </>
            )}
            <CountPicker label="Vagas" value={draft.parkingSpots} onChange={(value) => set({ parkingSpots: value })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={hasRooms ? "Área útil (m²)" : "Área (m²)"}>
                <input inputMode="numeric" value={formatThousands(draft.areaM2)} onChange={(event) => set({ areaM2: digits(event.target.value).slice(0, 7) })} placeholder="85" className={inputClass} />
              </Field>
              {hasFloor && (
                <Field label="Andar (opcional)">
                  <input inputMode="numeric" value={draft.floor} onChange={(event) => set({ floor: digits(event.target.value).slice(0, 3) })} placeholder="4" className={inputClass} />
                </Field>
              )}
              {hasTotalArea && (
                <Field label="Área do terreno (opcional)">
                  <input inputMode="numeric" value={formatThousands(draft.totalAreaM2)} onChange={(event) => set({ totalAreaM2: digits(event.target.value).slice(0, 8) })} placeholder="360" className={inputClass} />
                </Field>
              )}
            </div>
          </Step>
        )}

        {current === "features" && (
          <Step title="O que o imóvel tem?" hint="Marque os diferenciais — aparecem no anúncio e ajudam o interessado a decidir.">
            <div className="mt-4 flex flex-wrap gap-2">
              {PROPERTY_FEATURE_OPTIONS.map((option) => (
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
            Fotos, descrição e valores. Dicas rápidas: fotografe de dia, com as janelas abertas e os cômodos arrumados, na horizontal; mostre sala,
            quartos, cozinha, banheiros, área externa e a vista.
          </Intro>
        )}

        {current === "photos" && (
          <Step
            title={`Adicione até ${MAX_PHOTOS} fotos`}
            hint={`A primeira é a capa. Use as setas para mudar a ordem.${isPartner ? "" : " O plano Grátis mostra 5 fotos; Flex 10, Turbo 15 e Nitro 20."}`}
          >
            <PhotoGrid photos={photos} onAdd={addPhotos} onMove={movePhoto} onRemove={removePhoto} />
          </Step>
        )}

        {current === "video" && (
          <Step
            title="Tem um vídeo ou tour do imóvel?"
            hint={`Cole o link de um vídeo do YouTube — ele aparece junto com as fotos. É opcional.${isPartner ? "" : " O vídeo aparece nos planos Flex, Turbo e Nitro."}`}
          >
            <Field label="Link do YouTube">
              <input value={draft.videoUrl} onChange={(event) => set({ videoUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." className={inputClass} />
            </Field>
          </Step>
        )}

        {current === "description" && (
          <Step title="Agora, título e descrição" hint="Fale do estado do imóvel, da vizinhança e dos diferenciais. Não coloque telefone, e-mail ou link — o anúncio é recusado.">
            <Field label="Título do anúncio">
              <input value={draft.title || autoTitle} maxLength={80} onChange={(event) => set({ title: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Descrição">
              <textarea
                value={draft.description}
                maxLength={2000}
                rows={7}
                onChange={(event) => set({ description: event.target.value })}
                placeholder="Ex.: Apartamento reformado, nascente, perto de padaria e escola, portaria 24h…"
                className={inputClass}
              />
            </Field>
            <p className="text-right text-xs text-ink-muted">{draft.description.length}/2000</p>
            {aiEnabled && (
              <button
                type="button"
                onClick={() => void generateText()}
                disabled={Boolean(busy)}
                className="mt-2 flex items-center gap-2 self-start rounded-full border-2 border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-60"
              >
                <Sparkle size={18} weight="fill" />
                {draft.description.trim() ? "Melhorar com IA" : "Gerar descrição com IA"}
              </button>
            )}
          </Step>
        )}

        {current === "values" && (
          <Step title="Valores do imóvel" hint="Os anúncios abaixo são só referência de mercado — não constituem avaliação oficial.">
            {moneyInput("price", isRent ? "Aluguel por mês" : "Valor de venda", "Valor inteiro, sem centavos.")}
            <div className="grid grid-cols-2 gap-3">
              {moneyInput("iptu", "IPTU por mês", "Deixe em branco se não houver.")}
              {hasCondo && moneyInput("condoFee", "Condomínio por mês", "Deixe em branco se não houver.")}
            </div>
            {!isRent && (
              <Toggle
                label="Permitir financiamento"
                description="Mostra a simulação de parcelas no anúncio e o comprador pode pedir financiamento — você recebe o valor à vista."
                checked={draft.financingEnabled}
                onChange={(value) => set({ financingEnabled: value })}
              />
            )}
            <section className="mt-4">
              <h2 className="font-display text-lg font-semibold text-ink">Imóveis parecidos na região</h2>
              <p className="text-xs text-ink-muted">
                {typeLabel(draft.propertyType)} {isRent ? "para alugar" : "à venda"} {draft.neighborhood ? `no ${draft.neighborhood} ou em ${draft.city}` : `em ${draft.city}`}
              </p>
              {!similar && <p className="mt-3 text-sm text-ink-muted">Procurando…</p>}
              {similar && similar.length === 0 && (
                <p className="mt-3 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">Ainda não temos anúncios parecidos por aqui — o seu pode ser o primeiro.</p>
              )}
              {similar && similar.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {similar.map((listing) => (
                    <li key={listing.id}>
                      <a href={`/anuncio/${listing.id}`} target="_blank" rel="noreferrer" className="flex gap-3 rounded-brand border border-border bg-surface-raised p-2 hover:bg-surface-sober">
                        {listing.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={listing.image} alt="" className="h-16 w-20 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded bg-surface-sober">
                            <House size={24} className="text-ink-muted" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{listing.title}</span>
                          {listing.subtitle && <span className="block truncate text-xs text-ink-muted">{listing.subtitle}</span>}
                          <span className="block text-sm font-bold text-ink">{listing.priceLabel}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Step>
        )}

        {current === "contact" && (
          <Step title="Como quer ser contatado?" hint="O chat do site fica sempre ligado — e você é avisado de cada mensagem.">
            <div className="mt-4 flex flex-col gap-2">
              <Toggle label="Mostrar meu WhatsApp" description="Botão de WhatsApp no anúncio para os interessados." checked={draft.showPhone} onChange={(value) => set({ showPhone: value })} />
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
                <input inputMode="numeric" value={cpf} onChange={(event) => setCpf(formatCpf(event.target.value))} placeholder="000.000.000-00" className={inputClass} />
                <span className="text-xs text-ink-muted">Uma conta por pessoa, para a segurança de todos. O CPF nunca aparece no anúncio.</span>
              </Field>
            )}
          </Step>
        )}

        {current === "plan" && (
          <Step title="Escolha seu plano" hint="Pagamento único, sem mensalidade. Em todos o anúncio fica no ar até vender ou alugar.">
            <PlanPicker value={draft.planTier} onChange={(tier) => set({ planTier: tier })} photoCount={photos.length} videoLabel="Vídeo do imóvel" />
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
                <p className="text-2xl font-extrabold text-ink">
                  {price ? formatBRL(price) : "—"}
                  {isRent && <span className="text-base font-semibold text-ink-muted">/mês</span>}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {[
                    `${draft.areaM2} m²`,
                    hasRooms && draft.bedrooms ? `${draft.bedrooms} quartos` : "",
                    hasRooms && draft.bathrooms ? `${draft.bathrooms} banheiros` : "",
                    draft.parkingSpots ? `${draft.parkingSpots} vagas` : "",
                    `${draft.neighborhood}, ${draft.city}/${draft.state}`,
                    `${photos.length} foto(s)${draft.videoUrl ? " · vídeo" : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {(draft.condoFee || draft.iptu) && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {[draft.condoFee && hasCondo ? `Condomínio ${formatBRL(Number(draft.condoFee))}` : "", draft.iptu ? `IPTU ${formatBRL(Number(draft.iptu))}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
            {!isPartner && <PlanSummary tier={draft.planTier} />}
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
            onClick={() => void next()}
            disabled={Boolean(busy)}
            className="flex items-center gap-2 rounded-full bg-brand-green px-6 py-3 text-base font-bold text-on-green hover:opacity-90 disabled:opacity-60"
          >
            {current === "intro1"
              ? "Vamos começar"
              : current === "intro2"
                ? "Combinado, continuar"
                : current === "review"
                  ? publishLabel(isPartner, draft.planTier)
                  : "Continuar"}
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </div>

      {showTerms && <TermsDialog onCancel={() => setShowTerms(false)} onAccept={() => void publish()} />}
    </div>
  );
}
