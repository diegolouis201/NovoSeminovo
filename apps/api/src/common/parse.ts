import { BadRequestException } from "@nestjs/common";
import { z, type ZodType } from "zod";

type ZodLikeError = { name: "ZodError"; issues: Array<{ message: string }> };

// `error instanceof ZodError` não é confiável aqui: apps/api e
// @novoseminovo/shared-types podem resolver cópias distintas do módulo zod
// (mesma versão, classes diferentes) dependendo de como o pnpm as vincula.
// Duck-typing evita depender dessa identidade de classe.
function isZodError(error: unknown): error is ZodLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ZodError" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function parseOrBadRequest<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (isZodError(error)) {
      throw new BadRequestException(error.issues.map((issue) => issue.message).join("; "));
    }
    throw error;
  }
}

// Id da sessão de pagamento que o Stripe devolve na volta (?session_id=).
export const StripeSessionIdSchema = z
  .string({ required_error: "session_id é obrigatório", invalid_type_error: "session_id inválido" })
  .trim()
  .min(1, "session_id é obrigatório")
  .max(300);
