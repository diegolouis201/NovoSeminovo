import { BadRequestException } from "@nestjs/common";
import { consentimentoCreditoDaVersao, type ModalidadeCredito } from "@novoseminovo/shared-types";
import type { PrismaService } from "../prisma/prisma.service";

// Trilha de auditoria do consentimento do crédito (parecer jurídico LGPD de
// 17/11/2026, item 2.1.4 ii). Cada aceite vira uma linha em credit_consents
// com: pedido (financingLeadId), data/hora em UTC + o fuso usado + a hora
// local com deslocamento, modalidade e produto, versão e cópia do texto
// integral aceito, manifestação positiva (accepted = true), IP e navegador.

export const CONSENT_TIMEZONE = "America/Sao_Paulo";
const MAX_USER_AGENT = 500;
const MAX_IP = 100;

// De onde veio o aceite: IP do visitante (repassado pelo site) e navegador.
export type ConsentContext = { ip: string; userAgent: string };

// Quem registrou: o próprio cliente no site, ou o admin confirmando no quadro.
export type ConsentOrigin = { origin: "site" } | { origin: "admin"; adminUserId: string };

// Texto que vem de fora (cabeçalho): sem caracteres de controle e com tamanho máximo.
export function cleanHeaderText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

// "2026-11-17T15:05:09.123-03:00": hora local do fuso com o deslocamento
// explícito, para quem lê o registro não precisar converter.
export function localIsoWithOffset(date: Date, timeZone: string = CONSENT_TIMEZONE): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  // "GMT-03:00" / "GMT+01:00" / "GMT" (UTC).
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : (parts.timeZoneName ?? "GMT+00:00").replace("GMT", "");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}${offset}`;
}

export type CreditConsentInput = {
  financingLeadId: string;
  modality: ModalidadeCredito;
  version: string;
  origin: "site" | "admin";
  adminUserId?: string;
  ip: string;
  userAgent: string;
  bacenTermVersion?: string;
  now?: Date;
};

export async function recordCreditConsent(prisma: PrismaService, input: CreditConsentInput): Promise<{ id: string }> {
  // Versão conferida contra o histórico do código: o texto guardado é o que
  // o site mostrou naquela versão, nunca algo vindo do pedido.
  const version = consentimentoCreditoDaVersao(input.version, input.modality);
  if (!version) throw new BadRequestException("Versão do texto de autorização desconhecida.");
  const now = input.now ?? new Date();
  return prisma.creditConsent.create({
    data: {
      financingLeadId: input.financingLeadId,
      modality: version.modalidade,
      product: version.produto,
      origin: input.origin,
      adminUserId: input.origin === "admin" ? input.adminUserId : undefined,
      consentVersion: version.versao,
      consentText: version.texto,
      accepted: true,
      acceptedAt: now,
      timezone: CONSENT_TIMEZONE,
      acceptedAtLocal: localIsoWithOffset(now),
      ip: cleanHeaderText(input.ip, MAX_IP) || null,
      userAgent: cleanHeaderText(input.userAgent, MAX_USER_AGENT) || null,
      bacenTermVersion: input.bacenTermVersion,
    },
    select: { id: true },
  });
}
