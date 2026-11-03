import { BadRequestException, Injectable } from "@nestjs/common";
import { NpsInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;
export const NPS_FIRST_AFTER_DAYS = 30;
export const NPS_EVERY_DAYS = 90;

// NPS no painel do parceiro: "De 0 a 10, quanto você recomendaria o
// NovoSeminovo?" — só para o dono da empresa, após 30 dias e a cada 90.
@Injectable()
export class NpsService {
  constructor(private readonly prisma: PrismaService) {}

  private async partnerOf(userId: string) {
    return this.prisma.partner.findFirst({ where: { ownerUserId: userId }, orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true } });
  }

  async status(userId: string): Promise<{ ask: boolean }> {
    const partner = await this.partnerOf(userId);
    if (!partner || Date.now() - partner.createdAt.getTime() < NPS_FIRST_AFTER_DAYS * DAY_MS) return { ask: false };
    const recent = await this.prisma.npsResponse.count({ where: { partnerId: partner.id, createdAt: { gte: new Date(Date.now() - NPS_EVERY_DAYS * DAY_MS) } } });
    return { ask: recent === 0 };
  }

  async answer(userId: string, raw: { score: number; comment?: string }): Promise<void> {
    const parsed = NpsInputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException("Escolha uma nota de 0 a 10.");
    const partner = await this.partnerOf(userId);
    if (!partner) throw new BadRequestException("Só empresas parceiras respondem a pesquisa.");
    if (!(await this.status(userId)).ask) throw new BadRequestException("Você já respondeu a pesquisa recentemente. Obrigado!");
    await this.prisma.npsResponse.create({ data: { partnerId: partner.id, userId, score: parsed.data.score, comment: parsed.data.comment || null } });
  }
}
