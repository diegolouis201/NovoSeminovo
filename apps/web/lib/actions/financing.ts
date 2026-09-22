"use server";

import type { FinancingSimulationResult } from "@novoseminovo/shared-types";
import { simulateFinancing } from "@/lib/api";

export async function simulateFinancingAction(
  listingId: string,
  input: { assetPrice: number; downPaymentPct: number; installments: number },
): Promise<FinancingSimulationResult | undefined> {
  return simulateFinancing(listingId, input);
}
