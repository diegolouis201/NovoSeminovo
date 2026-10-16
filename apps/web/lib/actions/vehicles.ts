"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreateVehicleEventInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { addVehicleEvent } from "@/lib/api";

const EVENT_TYPES = new Set(["revision", "repair", "inspection", "other"]);

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
