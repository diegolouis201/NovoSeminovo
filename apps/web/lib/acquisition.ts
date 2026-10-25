import { cookies } from "next/headers";
import { ACQUISITION_COOKIE, ACQUISITION_HEADER, parseAcquisition, serializeAcquisition } from "@novoseminovo/shared-types";

// Só no servidor (server actions): repassa à API a origem do visitante
// gravada pelo AttributionCapture, pra cadastro e leads saírem com "veio do
// Instagram / Google / afiliado…".
export function acquisitionHeaders(): Record<string, string> {
  const value = parseAcquisition(cookies().get(ACQUISITION_COOKIE)?.value);
  return value ? { [ACQUISITION_HEADER]: encodeURIComponent(serializeAcquisition(value)) } : {};
}
