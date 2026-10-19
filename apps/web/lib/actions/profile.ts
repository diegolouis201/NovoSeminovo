"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sendEmailVerification, updateProfile, verifyEmailCode } from "@/lib/api";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await updateProfile(
    {
      name: str(formData, "name") || undefined,
      phone: str(formData, "phone") || undefined,
      cpf: str(formData, "cpf") || undefined,
      gender: (str(formData, "gender") || undefined) as "male" | "female" | "other" | "undisclosed" | undefined,
      birthDate: str(formData, "birthDate") || undefined,
      zipCode: str(formData, "zipCode") || undefined,
      state: str(formData, "state") || undefined,
      city: str(formData, "city") || undefined,
    },
    session.accessToken,
  );

  if (!result.ok) {
    redirect(`/conta/perfil?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/conta/perfil");
  redirect("/conta/perfil?sucesso=Dados salvos.");
}

// Chamada direta pelo client component (ver EmailVerificationCard), não como
// <form action> — precisa devolver se o e-mail foi mesmo enviado pra
// controlar a UI (mostrar o campo de código ou um aviso de indisponível).
export async function sendEmailVerificationAction(): Promise<boolean> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return sendEmailVerification(session.accessToken);
}

export async function verifyEmailCodeAction(code: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await verifyEmailCode(code, session.accessToken);
  if (result.ok) revalidatePath("/conta/perfil");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
