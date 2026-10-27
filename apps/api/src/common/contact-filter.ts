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
