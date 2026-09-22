import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
import { createListingAction } from "@/lib/actions/listings";

const TRANSMISSION_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automático" },
];

const FUEL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "gasoline", label: "Gasolina" },
  { value: "ethanol", label: "Etanol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Elétrico" },
  { value: "hybrid", label: "Híbrido" },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: "house", label: "Casa" },
  { value: "apartment", label: "Apartamento" },
  { value: "land", label: "Terreno" },
  { value: "commercial", label: "Comercial" },
];

const PURPOSE_OPTIONS = [
  { value: "sale", label: "Venda" },
  { value: "rent", label: "Aluguel" },
];

export default async function CreateListingPage({
  searchParams,
}: {
  searchParams: { tipo?: string; error?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const assetType = searchParams.tipo === "property" ? "property" : "vehicle";

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Anunciar</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Preencha os dados abaixo — sem enrolação, mas capriche na descrição: anúncio completo vende
        mais rápido.
      </p>

      <nav className="mt-6 inline-flex gap-1 rounded-full bg-surface-sober p-1">
        <Link
          href="/anunciar?tipo=vehicle"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            assetType === "vehicle" ? "bg-brand-green text-on-green" : "text-ink"
          }`}
        >
          🚗 Carro
        </Link>
        <Link
          href="/anunciar?tipo=property"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            assetType === "property" ? "bg-brand-green text-on-green" : "text-ink"
          }`}
        >
          🏠 Imóvel
        </Link>
      </nav>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      <form action={createListingAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="assetType" value={assetType} />

        <FormField label="Título do anúncio" name="title" placeholder="Ex.: Corolla XEi 2020, único dono" />
        <TextAreaField label="Descrição" name="description" minLength={20} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Preço (R$)" name="price" type="number" min={0} step={100} />
          {assetType === "vehicle" ? (
            <FormField label="Cor" name="color" />
          ) : (
            <FormField label="Área (m²)" name="areaM2" type="number" min={1} step={1} />
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Cidade" name="city" defaultValue="Belo Horizonte" />
          <FormField label="Estado (UF)" name="state" defaultValue="MG" />
          <FormField label="Bairro" name="neighborhood" required={false} />
        </div>

        {assetType === "vehicle" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Marca" name="brand" placeholder="Toyota" />
              <FormField label="Modelo" name="model" placeholder="Corolla" />
            </div>
            <FormField label="Versão" name="version" required={false} placeholder="XEi 2.0" />
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Ano de fabricação" name="yearManufacture" type="number" min={1950} />
              <FormField label="Ano do modelo" name="yearModel" type="number" min={1950} />
              <FormField label="Km rodados" name="mileage" type="number" min={0} step={1000} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SelectField label="Câmbio" name="transmission" options={TRANSMISSION_OPTIONS} />
              <SelectField label="Combustível" name="fuelType" options={FUEL_OPTIONS} />
              <FormField label="Portas" name="doors" type="number" min={2} required={false} />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Tipo de imóvel" name="propertyType" options={PROPERTY_TYPE_OPTIONS} />
              <SelectField label="Finalidade" name="purpose" options={PURPOSE_OPTIONS} />
            </div>
            <FormField label="Endereço" name="streetAddress" placeholder="Rua, número, complemento" />
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Quartos" name="bedrooms" type="number" min={0} required={false} />
              <FormField label="Banheiros" name="bathrooms" type="number" min={0} required={false} />
              <FormField label="Vagas" name="parkingSpots" type="number" min={0} required={false} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Condomínio (R$/mês)" name="condoFee" type="number" min={0} required={false} />
              <FormField label="IPTU (R$/mês)" name="iptu" type="number" min={0} required={false} />
            </div>
          </>
        )}

        <Button type="submit" className="mt-2 self-start">
          Publicar anúncio
        </Button>
      </form>
    </main>
  );
}
