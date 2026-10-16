"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreateVehicleEventInput, RegisterVehicleInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { addVehicleEvent, registerVehicle } from "@/lib/api";

const EVENT_TYPES = new Set(["revision", "repair", "inspection", "other"]);

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

export async function addVehicleEventAction(vehicleId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const type = String(formData.get("type") ?? "");
  const input: CreateVehicleEventInput = {
    type: EVENT_TYPES.has(type) ? (type as CreateVehicleEventInput["type"]) : "other",
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    mileageAtEvent: formData.get("mileageAtEvent") ? Number(formData.get("mileageAtEvent")) : undefined,
  };

  const result = await addVehicleEvent(vehicleId, input, session.accessToken);
  if (!result.ok) {
    redirect(`/veiculo/${vehicleId}?erro=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(`/veiculo/${vehicleId}`);
  redirect(`/veiculo/${vehicleId}`);
}
