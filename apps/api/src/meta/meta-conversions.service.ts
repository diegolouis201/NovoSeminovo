import { Injectable, Logger } from "@nestjs/common";
import type { MetaContentCategory, MetaEventName } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { buildMetaEvent, metaConfig, sendMetaEvent, type MetaEventContext } from "./meta-conversions";

export type MetaPerson = { email?: string | null; phone?: string | null; userId?: string | null };

// Lead e CompleteRegistration para a Meta (ver meta-conversions.ts). Nunca
// atrasa nem derruba a ação da pessoa: quem chama não espera (`void track`),
// e qualquer falha vira só um aviso no log, sem token e sem dado pessoal.
@Injectable()
export class MetaConversionsService {
  private readonly logger = new Logger(MetaConversionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return metaConfig() !== undefined;
  }

  // Categoria pelo tipo do anúncio (veículo ou imóvel).
  async listingCategory(listingId: string | null | undefined): Promise<MetaContentCategory | undefined> {
    if (!listingId) return undefined;
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { type: true } }).catch(() => null);
    return listing?.type === "property" ? "imovel" : listing?.type === "vehicle" ? "veiculo" : undefined;
  }

  async track(name: MetaEventName, context: MetaEventContext | undefined, person: MetaPerson, category?: MetaContentCategory): Promise<void> {
    if (!context) return;
    const config = metaConfig();
    if (!config) return;
    try {
      let { email, phone } = person;
      if (person.userId && (!email || !phone)) {
        const user = await this.prisma.user.findUnique({ where: { id: person.userId }, select: { email: true, phone: true } });
        email ||= user?.email;
        phone ||= user?.phone;
      }
      const result = await sendMetaEvent(config, buildMetaEvent(name, context, { email, phone }, category));
      if (!result.ok) this.logger.warn(`API de Conversões da Meta recusou/falhou o evento ${name}: ${result.reason}`);
    } catch (error) {
      this.logger.warn(`API de Conversões da Meta: falha ao montar o evento ${name} (${(error as Error).name}).`);
    }
  }
}
