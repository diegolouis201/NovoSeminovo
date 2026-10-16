import { createHash } from "node:crypto";

// Nunca guardamos a placa em texto puro (ver comentário em Vehicle no
// schema.prisma) — hash pra comparar "é o mesmo carro?" e uma versão
// mascarada só pra exibição. Normaliza formato antigo (ABC-1234) e Mercosul
// (ABC1D23) pro mesmo valor, senão "ABC-1234" e "abc1234" virariam dois
// carros diferentes.
function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashPlate(plate: string): string {
  return createHash("sha256").update(normalizePlate(plate)).digest("hex");
}

// "ABC1D23" -> "ABC**23" — confirma visualmente sem expor a placa inteira.
export function maskPlate(plate: string): string {
  const normalized = normalizePlate(plate);
  if (normalized.length < 4) return "*".repeat(normalized.length);
  const visibleStart = normalized.slice(0, 3);
  const visibleEnd = normalized.slice(-2);
  const masked = "*".repeat(normalized.length - 5);
  return `${visibleStart}${masked}${visibleEnd}`;
}
