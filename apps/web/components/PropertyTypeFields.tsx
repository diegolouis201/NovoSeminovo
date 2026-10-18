"use client";

import { useState } from "react";
import { FormField, SelectField } from "@/components/FormField";
import {
  PROPERTY_FEATURE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_TYPES_WITHOUT_CONDO,
  PROPERTY_TYPES_WITHOUT_ROOMS,
  PROPERTY_TYPES_WITH_FLOOR,
  PROPERTY_TYPES_WITH_TOTAL_AREA,
} from "@/lib/vehicle-options";

// Campos que mudam de acordo com o tipo de imóvel (ver pedido original: um
// terreno não precisa de quartos/banheiros, só apartamento/cobertura tem
// andar relevante, etc.) — client component só pra reagir à troca do select
// na hora, sem recarregar a página; os <input>/<select> continuam fazendo
// parte do <form> nativo de sempre (ver /anunciar), só muda quem decide
// mostrar ou não cada um.
export function PropertyTypeFields({ defaultPropertyType }: { defaultPropertyType?: string }) {
  const [propertyType, setPropertyType] = useState(defaultPropertyType ?? "house");

  const hasRooms = !PROPERTY_TYPES_WITHOUT_ROOMS.has(propertyType);
  const hasFloor = PROPERTY_TYPES_WITH_FLOOR.has(propertyType);
  const hasTotalArea = PROPERTY_TYPES_WITH_TOTAL_AREA.has(propertyType);
  const hasCondo = !PROPERTY_TYPES_WITHOUT_CONDO.has(propertyType);

  return (
    <>
      <SelectField
        label="Tipo de imóvel"
        name="propertyType"
        options={PROPERTY_TYPE_OPTIONS}
        defaultValue={propertyType}
        onChange={(event) => setPropertyType(event.target.value)}
      />

      {hasTotalArea && (
        <FormField
          label="Área total do terreno (m²)"
          name="totalAreaM2"
          type="number"
          min={1}
          step={0.01}
          required={false}
        />
      )}

      {hasRooms && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label="Quartos" name="bedrooms" type="number" min={0} required={false} />
          <FormField label="Suítes" name="suites" type="number" min={0} required={false} />
          <FormField label="Banheiros" name="bathrooms" type="number" min={0} required={false} />
          <FormField label="Vagas" name="parkingSpots" type="number" min={0} required={false} />
        </div>
      )}

      {hasFloor && <FormField label="Andar" name="floor" type="number" min={0} required={false} />}

      {hasCondo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Condomínio (R$/mês)" name="condoFee" type="number" min={0} required={false} />
          <FormField label="IPTU (R$/mês)" name="iptu" type="number" min={0} required={false} />
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">
          Diferenciais <span className="font-normal text-ink-muted">(opcional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROPERTY_FEATURE_OPTIONS.map((feature) => (
            <label key={feature.value} className="flex items-center gap-1.5 text-sm text-ink">
              <input type="checkbox" name="features" value={feature.value} />
              {feature.label}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
