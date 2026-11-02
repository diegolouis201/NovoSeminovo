import { timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PARTNER_TRIAL_DAYS, PARTNER_TYPE_LABELS } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Feed de conversões para o CRM de marketing (repositório do Diego no
// Claude): empresas que se cadastraram e em que etapa estão. Só o que o CRM
// precisa para casar o contato e trocar a comunicação — nada de telefone,
// CPF ou dado de pagamento.

export type ConversionStage = "cadastrou" | "publicou_anuncio" | "assinante";
export type ConversionCompany = {
  id: string;
  nome: string;
  tipo: string;
  cnpj: string;
  email: string;
  cidade?: string;
  cadastradoEm: string;
  verificada: boolean;
  etapa: ConversionStage;
  anunciosAtivos: number;
  emTeste: boolean;
  plano?: string;
};
export type ConversionsFeed = { geradoEm: string; desde: string; empresas: ConversionCompany[] };

const DAY_MS = 86_400_000;

// Confere a chave do cabeçalho "Authorization: Bearer <chave>" em tempo
// constante. Servidor sem chave configurada não libera ninguém.
export function feedKeyCheck(header: string | undefined, key: string | undefined): "ok" | "denied" | "not_configured" {
  if (!key || key.length < 32) return "not_configured";
  if (!header?.startsWith("Bearer ")) return "denied";
  const received = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(key);
  return received.length === expected.length && timingSafeEqual(received, expected) ? "ok" : "denied";
}

@Injectable()
export class ConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(since: Date): Promise<ConversionsFeed> {
    const now = new Date();
    const partners = await this.prisma.partner.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        legalName: true,
        type: true,
        document: true,
        verifiedAt: true,
        createdAt: true,
        owner: { select: { email: true, city: true, state: true } },
        subscriptions: { where: { status: { in: ["active", "past_due"] } }, select: { plan: { select: { name: true } } }, take: 1 },
        listings: { select: { city: true, state: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { listings: { where: { status: "active" } } } },
      },
    });
    const empresas = partners.map((partner): ConversionCompany => {
      const subscription = partner.subscriptions[0];
      const active = partner._count.listings;
      const place = partner.owner.city ? partner.owner : partner.listings[0];
      const city = [place?.city, place?.state].filter(Boolean).join(" - ");
      return {
        id: partner.id,
        nome: partner.legalName,
        tipo: PARTNER_TYPE_LABELS[partner.type] ?? partner.type,
        cnpj: partner.document,
        email: partner.owner.email,
        cidade: city || undefined,
        cadastradoEm: partner.createdAt.toISOString(),
        verificada: Boolean(partner.verifiedAt),
        etapa: subscription ? "assinante" : active > 0 ? "publicou_anuncio" : "cadastrou",
        anunciosAtivos: active,
        emTeste: !subscription && partner.createdAt.getTime() + PARTNER_TRIAL_DAYS * DAY_MS > now.getTime(),
        plano: subscription?.plan.name,
      };
    });
    return { geradoEm: now.toISOString(), desde: since.toISOString(), empresas };
  }
}
