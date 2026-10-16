"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RegisterVehicleInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { addVehicleEvent, confirmVehicleService, registerVehicle } from "@/lib/api";

function numOrUndefined(value: FormDataEntryValue | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function registerVehicleAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const input: RegisterVehicleInput = {
    plate: String(formData.get("plate") ?? "").trim(),
    brand: String(formData.get("brand") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim(),
    yearManufacture: numOrUndefined(formData.get("yearManufacture")),
    yearModel: numOrUndefined(formData.get("yearModel")),
    color: String(formData.get("color") ?? "").trim() || undefined,
  };

  const result = await registerVehicle(input, session.accessToken);
  if (!result.ok) {
    redirect(`/conta/veiculos/novo?erro=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/conta/veiculos");
  redirect(`/veiculo/${result.vehicle.id}`);
}

// formData vai direto pra API como multipart (campos + foto do comprovante
// juntos) — mesmo padrão de uploadPhotosAction em lib/actions/listings.ts.
export async function addVehicleEventAction(vehicleId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const photo = formData.get("photos");
  if (!(photo instanceof File) || photo.size === 0) {
    redirect(
      `/veiculo/${vehicleId}?erro=${encodeURIComponent(
        "Envie uma foto do comprovante (nota fiscal, ordem de serviço, etc.) pra registrar o evento.",
      )}`,
    );
  }

  const result = await addVehicleEvent(vehicleId, formData, session.accessToken);
  if (!result.ok) {
    redirect(`/veiculo/${vehicleId}?erro=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(`/veiculo/${vehicleId}`);
  redirect(`/veiculo/${vehicleId}`);
}

export async function confirmServiceAction(eventId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await confirmVehicleService(eventId, session.accessToken);
  revalidatePath("/parceiro/servicos");
}
