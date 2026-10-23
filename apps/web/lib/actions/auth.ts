"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import type { PartnerType } from "@novoseminovo/shared-types";
import { signIn } from "@/auth";
import { signupCompany } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type RegisterState = { error?: string };

// Volta pra onde a pessoa estava (ex.: Arquiteto NovoSeminovo) — só caminho interno.
function returnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/conta";
}

// /cadastro: pessoa física cria a conta; empresa cria a conta do responsável
// e a loja/imobiliária juntas (o tipo sai do CNPJ — ver CnpjService na API).
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const account = { name: field("name"), email: field("email"), password: String(formData.get("password") ?? ""), phone: field("phone") || undefined, cpf: field("cpf") };
  const isCompany = field("accountType") === "pj";

  if (isCompany) {
    const result = await signupCompany({ ...account, cnpj: field("cnpj"), partnerType: (field("partnerType") || undefined) as PartnerType | undefined, legalName: field("legalName") || undefined });
    if (!result.ok) return { error: result.error };
  } else {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    }).catch(() => undefined);
    if (!res) return { error: "Não foi possível falar com o servidor. Tente novamente." };
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: body.message ?? "Não foi possível criar a conta." };
    }
  }

  try {
    await signIn("credentials", { email: account.email, password: account.password, redirectTo: isCompany ? "/parceiro" : returnPath(field("voltar")) });
  } catch (error) {
    if (error instanceof AuthError) redirect("/entrar");
    throw error;
  }
  return {};
}
