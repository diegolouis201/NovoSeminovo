"use server";

import type { ArchitectMessageInput, ArchitectSessionView } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { sendArchitectMessage, type ApiResult } from "@/lib/api";

export async function architectMessageAction(sessionId: string, input: ArchitectMessageInput): Promise<ApiResult<ArchitectSessionView>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo para continuar." };
  return sendArchitectMessage(sessionId, input, session.accessToken);
}
