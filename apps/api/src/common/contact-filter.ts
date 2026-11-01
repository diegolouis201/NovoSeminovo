import { BadRequestException } from "@nestjs/common";
// Título e descrição de anúncio não podem levar contato (telefone, e-mail,
// link, @ de rede social) — o contato acontece pelo chat e pelo botão de
// WhatsApp do site, que geram lead e protegem contra golpe. Mesma regra da
// Webmotors/OLX. Pensado pra não pegar falso positivo comum em anúncio:
// preço ("R$ 59.000"), km ("110.000 km"), ano ("2020/2021"), área ("120 m²").

const PATTERNS: { kind: string; regex: RegExp }[] = [
  { kind: "e-mail", regex: /[\w.+-]+@[\w-]+\.[\w.]+/i },
  { kind: "link", regex: /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org)(?:\.br)?\b/i },
  // Celular: 9 + 8 dígitos, com ou sem DDD e separadores ("31 99999-9999",
  // "(31)999999999", "99999 9999").
  { kind: "telefone", regex: /(?:\(?\b\d{2}\)?[\s.-]?)?\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/ },
  // Fixo só com DDD, pra não confundir com dois anos seguidos ("2020 2021").
  { kind: "telefone", regex: /\(?\b\d{2}\)?[\s.-]?[2-5]\d{3}[\s.-]?\d{4}\b/ },
  { kind: "telefone", regex: /\b(?:whats(?:app)?|zap|wpp|fone|tel(?:efone)?|ligue)\s*[:\-]?\s*\(?\d/i },
  { kind: "perfil de rede social", regex: /(?:^|\s)@[a-z0-9_.]{3,}/i },
];

export function findContactInfo(text: string): string | undefined {
  return PATTERNS.find(({ regex }) => regex.test(text))?.kind;
}

export function contactInfoMessage(kind: string, field: string): string {
  return `Não é permitido colocar ${kind} ${field} do anúncio — por segurança, o contato acontece pelo chat e pelo botão de WhatsApp do site. Remova e tente de novo.`;
}

// Texto vindo de fora (importação pelo link de outro site): em vez de
// recusar, tira as linhas que tenham contato — o resto do texto fica.
export function stripContactInfo(text: string): string {
  return text
    .split(/\n/)
    .filter((line) => !findContactInfo(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Título vindo de fora (CRM): tira só o trecho com contato e o separador que
// sobrar ("Casa 3 quartos - WhatsApp 31 9…" → "Casa 3 quartos").
export function scrubContactInline(text: string): string {
  let result = text;
  for (const { regex } of PATTERNS) result = result.replace(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`), " ");
  return result
    .replace(/\b(?:whats(?:app)?|zap|wpp|fone|tel(?:efone)?|ligue|contato|e-?mail)\s*[:\-]?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s|\-–—:,;/]+$/g, "")
    .trim();
}

// Campo digitado pela pessoa (ex.: legenda da foto): com contato, recusa.
export function assertNoContactInfo(text: string, field: string): void {
  const kind = findContactInfo(text);
  if (kind) throw new BadRequestException(contactInfoMessage(kind, field));
}
