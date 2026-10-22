import Link from "next/link";
import { redirect } from "next/navigation";
import { Car, FileText, House, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
import { CepLookup } from "@/components/CepLookup";
import { FipePriceHelper } from "@/components/FipePriceHelper";
import { PriceSuggestionHint } from "@/components/PriceSuggestionHint";
import { PropertyTypeFields } from "@/components/PropertyTypeFields";
import { VehicleOptionsFields } from "@/components/VehicleOptionsFields";
import { SubmitButton } from "@/components/SubmitButton";
import { createListingAction, extractCrlvAction, generateListingDraftAction } from "@/lib/actions/listings";
import { VehicleListingWizard } from "@/components/VehicleListingWizard";
import { PropertyListingWizard } from "@/components/PropertyListingWizard";
import { allowedAssetTypes } from "@novoseminovo/shared-types";
import { fetchAiStatus, fetchMyPartner, fetchProfile } from "@/lib/api";
import { FUEL_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/vehicle-options";

const PURPOSE_OPTIONS = [
  { value: "sale", label: "Venda" },
  { value: "rent", label: "Aluguel" },
];

export default async function CreateListingPage({
  searchParams,
}: {
  searchParams: {
    tipo?: string;
    error?: string;
    draftTitle?: string;
    draftDescription?: string;
    draftPrice?: string;
    draftBrand?: string;
    draftModel?: string;
    draftVersion?: string;
    draftYearManufacture?: string;
    draftYearModel?: string;
    draftFuelType?: string;
    draftColor?: string;
    draftPlate?: string;
    modo?: string;
  };
}) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const [{ aiEnabled }, partner] = await Promise.all([fetchAiStatus(), fetchMyPartner(session.accessToken)]);
  // Loja de veículos só anuncia carro; imobiliária e corretor só imóvel.
  const allowed = allowedAssetTypes(partner?.type);
  const requested = searchParams.tipo === "property" ? "property" : searchParams.tipo === "vehicle" ? "vehicle" : allowed[0]!;
  if (!allowed.includes(requested)) redirect(`/anunciar?tipo=${allowed[0]}`);
  const assetType = requested;

  // Carro e imóvel: cadastro em passo a passo (VehicleListingWizard /
  // PropertyListingWizard). O formulário completo de uma tela só continua em
  // ?modo=completo (lojista que prefere, ou volta do leitor de CRLV/gerador
  // de texto com campos preenchidos).
  const usingDraftParams = Object.keys(searchParams).some((key) => key.startsWith("draft"));
  if (searchParams.modo !== "completo" && !usingDraftParams) {
    const profile = await fetchProfile(session.accessToken);
    const wizardProps = {
      aiEnabled,
      profilePhone: profile?.phone,
      isPartner: Boolean(partner),
      needsCpf: !partner && Boolean(profile) && !profile?.cpf,
    };
    const tabs = [
      { type: "vehicle" as const, label: "Carro", icon: <Car size={18} weight="bold" /> },
      { type: "property" as const, label: "Imóvel", icon: <House size={18} weight="bold" /> },
    ].filter((tab) => allowed.includes(tab.type));
    return (
      <main>
        <nav className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 pt-6 text-sm">
          {tabs.length > 1 ? (
            <span className="inline-flex gap-1 rounded-full bg-surface-sober p-1">
              {tabs.map((tab) =>
                tab.type === assetType ? (
                  <span key={tab.type} className="flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 font-semibold text-on-green">
                    {tab.icon} {tab.label}
                  </span>
                ) : (
                  <Link key={tab.type} href={`/anunciar?tipo=${tab.type}`} className="flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold text-ink">
                    {tab.icon} {tab.label}
                  </Link>
                ),
              )}
            </span>
          ) : (
            <span />
          )}
          <Link href={`/anunciar?tipo=${assetType}&modo=completo`} className="text-xs font-semibold text-ink-muted hover:underline">
            Formulário completo
          </Link>
        </nav>
        {assetType === "vehicle" ? <VehicleListingWizard {...wizardProps} /> : <PropertyListingWizard {...wizardProps} />}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Anunciar</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Preencha os dados abaixo — sem enrolação, mas capriche na descrição: anúncio completo vende
        mais rápido.
      </p>

      <nav className="mt-6 inline-flex gap-1 rounded-full bg-surface-sober p-1">
        {allowed.includes("vehicle") && (
          <Link
            href="/anunciar?tipo=vehicle&modo=completo"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
              assetType === "vehicle" ? "bg-brand-green text-on-green" : "text-ink"
            }`}
          >
            <Car size={18} weight="bold" /> Carro
          </Link>
        )}
        {allowed.includes("property") && (
          <Link
            href="/anunciar?tipo=property&modo=completo"
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
              assetType === "property" ? "bg-brand-green text-on-green" : "text-ink"
            }`}
          >
            <House size={18} weight="bold" /> Imóvel
          </Link>
        )}
      </nav>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      {aiEnabled && (
        <form
          action={generateListingDraftAction}
          className="mt-6 flex flex-col gap-3 rounded-brand border border-brand-blue/30 bg-brand-blue/5 p-4"
        >
          <input type="hidden" name="assetType" value={assetType} />
          {/* Preserva o que já veio do CRLV (se a pessoa leu o documento
              antes de gerar o texto) — sem isso, essa ação reconstruía a
              URL do zero e apagava os dados do CRLV. */}
          <input type="hidden" name="draftBrand" value={searchParams.draftBrand ?? ""} />
          <input type="hidden" name="draftModel" value={searchParams.draftModel ?? ""} />
          <input type="hidden" name="draftVersion" value={searchParams.draftVersion ?? ""} />
          <input type="hidden" name="draftYearManufacture" value={searchParams.draftYearManufacture ?? ""} />
          <input type="hidden" name="draftYearModel" value={searchParams.draftYearModel ?? ""} />
          <input type="hidden" name="draftFuelType" value={searchParams.draftFuelType ?? ""} />
          <input type="hidden" name="draftColor" value={searchParams.draftColor ?? ""} />
          <input type="hidden" name="draftPlate" value={searchParams.draftPlate ?? ""} />
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand-blue">
            <Sparkle size={16} weight="fill" />
            Gerar anúncio com IA
          </p>
          <p className="text-xs text-ink-muted">
            Escreve como se tivesse contando pra um amigo — a IA transforma isso num título e descrição
            prontos, que você ainda pode ajustar antes de publicar.
          </p>
          <textarea
            name="freeText"
            required
            minLength={10}
            rows={3}
            placeholder={
              assetType === "vehicle"
                ? "Ex.: meu Corolla 2020, prata, bem conservado, revisões em dia, vendo porque comprei outro carro"
                : "Ex.: apartamento de 2 quartos na Savassi, reformado, 1 vaga, vendo porque vou me mudar"
            }
            className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          />
          <SubmitButton variant="secondary" className="self-start" pendingLabel="Gerando...">
            Gerar
          </SubmitButton>
        </form>
      )}

      {aiEnabled && assetType === "vehicle" && (
        <form
          action={extractCrlvAction}
          encType="multipart/form-data"
          className="mt-4 flex flex-col gap-3 rounded-brand border border-brand-blue/30 bg-brand-blue/5 p-4"
        >
          {/* Preserva o que já veio do gerador de texto acima — mesmo
              motivo do comentário no form de cima, só que na direção
              contrária. */}
          <input type="hidden" name="draftTitle" value={searchParams.draftTitle ?? ""} />
          <input type="hidden" name="draftDescription" value={searchParams.draftDescription ?? ""} />
          <input type="hidden" name="draftPrice" value={searchParams.draftPrice ?? ""} />
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand-blue">
            <FileText size={16} weight="fill" />
            Preencher com o CRLV
          </p>
          <p className="text-xs text-ink-muted">
            Envie uma foto ou PDF do documento do veículo (CRLV) — a IA lê os dados e preenche marca,
            modelo, ano e combustível abaixo, pra você só conferir antes de publicar.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="file"
              name="crlv"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
              className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
            />
            <input
              type="text"
              name="plateStart"
              maxLength={3}
              placeholder="Início da placa"
              className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted sm:w-40"
            />
          </div>
          <SubmitButton variant="secondary" className="self-start" pendingLabel="Lendo documento...">
            Ler CRLV automaticamente
          </SubmitButton>
        </form>
      )}

      <form action={createListingAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="assetType" value={assetType} />

        <FormField
          label="Título do anúncio"
          name="title"
          placeholder="Ex.: Corolla XEi 2020, único dono"
          defaultValue={searchParams.draftTitle}
        />
        <div className="flex flex-col gap-1">
          <TextAreaField label="Descrição" name="description" minLength={20} defaultValue={searchParams.draftDescription} />
          <p className="text-xs text-ink-muted">
            Não coloque telefone, e-mail, link ou @ de rede social — o anúncio é recusado. Os interessados falam com você
            pelo chat e pelo botão de WhatsApp do site.
          </p>
        </div>
        {assetType === "property" && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Preço (R$)" name="price" type="number" min={0} defaultValue={searchParams.draftPrice} />
              <FormField label="Área (m²)" name="areaM2" type="number" min={1} step={0.01} />
            </div>
            <PriceSuggestionHint assetType={assetType} />
          </>
        )}

        <CepLookup />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Cidade" name="city" defaultValue="Belo Horizonte" />
          <FormField label="Estado (UF)" name="state" defaultValue="MG" />
          <FormField label="Bairro" name="neighborhood" required={false} />
        </div>

        {assetType === "vehicle" ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Marca" name="brand" placeholder="Toyota" defaultValue={searchParams.draftBrand} />
              <FormField label="Modelo" name="model" placeholder="Corolla" defaultValue={searchParams.draftModel} />
            </div>
            <FormField
              label="Versão"
              name="version"
              required={false}
              placeholder="XEi 2.0"
              defaultValue={searchParams.draftVersion}
            />
            <div className="flex flex-col gap-1">
              <FormField
                label="Placa"
                name="plate"
                required={false}
                placeholder="ABC1D23"
                defaultValue={searchParams.draftPlate}
              />
              <p className="text-xs text-ink-muted">
                Ajuda a começar o histórico verificado deste carro (revisões, donos, anúncios anteriores) —
                a placa nunca é exibida publicamente, só usada para reconhecer o veículo.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                label="Ano de fabricação"
                name="yearManufacture"
                type="number"
                min={1950}
                defaultValue={searchParams.draftYearManufacture}
              />
              <FormField
                label="Ano do modelo"
                name="yearModel"
                type="number"
                min={1950}
                defaultValue={searchParams.draftYearModel}
              />
              <FormField label="Km rodados" name="mileage" type="number" min={0} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SelectField label="Câmbio" name="transmission" options={TRANSMISSION_OPTIONS} />
              <SelectField
                label="Combustível"
                name="fuelType"
                options={FUEL_OPTIONS}
                defaultValue={searchParams.draftFuelType}
              />
              <FormField label="Portas" name="doors" type="number" min={2} required={false} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Preço (R$)" name="price" type="number" min={0} defaultValue={searchParams.draftPrice} />
              <FormField label="Cor" name="color" defaultValue={searchParams.draftColor} />
            </div>
            <FipePriceHelper />
            <PriceSuggestionHint assetType={assetType} />
            <VehicleOptionsFields />
          </>
        ) : (
          <>
            <SelectField label="Finalidade" name="purpose" options={PURPOSE_OPTIONS} />
            <FormField label="Endereço" name="streetAddress" placeholder="Rua, número, complemento" />
            <PropertyTypeFields />
          </>
        )}

        <SubmitButton className="mt-2 self-start" pendingLabel="Publicando...">
          Publicar anúncio
        </SubmitButton>
      </form>
    </main>
  );
}
