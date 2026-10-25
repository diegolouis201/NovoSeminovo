import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { canonicalJson } from "../operations/policy";

// Endereço público da API (imagens para a Meta, links de clique e de
// descadastro nos e-mails). Em produção: https://api.<domínio>.
export function publicApiUrl(): string {
  return (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, "");
}

export function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
}

// Foto salva em disco vem como "/uploads/x.jpg"; a Meta precisa da URL inteira.
export function absoluteMediaUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${publicApiUrl()}${url}`;
}

// Assinatura do conteúdo aprovado: publicar/enviar confere que nada mudou.
export function contentHash(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

function linkSecret(): string {
  return process.env.MARKETING_LINK_SECRET || process.env.JWT_SECRET || "dev-only-secret-troque-em-producao";
}

export function signLink(value: string): string {
  return createHmac("sha256", linkSecret()).update(value).digest("base64url").slice(0, 22);
}

export function verifyLink(value: string, signature: string): boolean {
  const expected = Buffer.from(signLink(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Só deixa redirecionar para o próprio site, com utm para aparecer nas origens.
export function marketingTarget(raw: string | undefined | null, campaign: string): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw, "https://novoseminovo.com.br");
  } catch {
    return undefined;
  }
  if (!/(^|\.)novoseminovo\.com\.br$/.test(url.hostname)) return undefined;
  url.protocol = "https:";
  if (!url.searchParams.get("utm_source")) url.searchParams.set("utm_source", "email");
  if (!url.searchParams.get("utm_medium")) url.searchParams.set("utm_medium", "email");
  if (!url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Aviso no sino e por e-mail para os admins: algo esperando aprovação.
export async function notifyReview(prisma: PrismaService, notifications: NotificationsService, title: string, body?: string): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
  for (const admin of admins) {
    await notifications.notify(admin.id, "marketing_review", { title, body }).catch(() => undefined);
  }
}
