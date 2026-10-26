import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { SendToCredihomeInput } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { trackRoutine } from "../operations/routine-health";
import { CredihomeError, createCredihomeLead, credihomeEnabled, fetchCredihomePhase } from "./credihome";

const SYNC_MS = 6 * 60 * 60 * 1000;
// Leads que ainda andam na Credihome: fase diferente de "finalizado" e
// enviados há menos de 6 meses (depois disso a fase não muda mais).
const SYNC_WINDOW_DAYS = 180;

// Telefone no formato que a Credihome pede: DDD + número, sem o 55.
export function credihomePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
}

@Injectable()
export class CredihomeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CredihomeService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.CREDIHOME_SYNC_DISABLED === "1") return;
    const run = () =>
      void trackRoutine("credihome", SYNC_MS, () =>
        this.syncAll().catch((error) => {
          this.logger.error(`Falha ao atualizar as fases da Credihome: ${error}`);
          throw error;
        }),
      );
    setTimeout(run, 5 * 60 * 1000).unref();
    this.timer = setInterval(run, SYNC_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Envio feito pelo admin no quadro de financiamentos, depois de conversar
  // com o cliente e ele autorizar. CPF e nascimento só passam por aqui.
  async send(leadId: string, input: SendToCredihomeInput): Promise<{ credihomeLeadId: string; alreadyExisted: boolean }> {
    const lead = await this.prisma.financingLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    if (lead.assetType !== "property") throw new BadRequestException("A Credihome só faz financiamento de imóvel.");
    if (lead.credihomeLeadId) throw new BadRequestException("Este lead já foi enviado à Credihome.");
    if (!credihomeEnabled()) throw new BadRequestException("A Credihome ainda não está configurada no servidor.");

    const siteUrl = process.env.WEB_ORIGIN ?? "https://novoseminovo.com.br";
    let result;
    try {
      result = await createCredihomeLead({
        name: lead.name,
        cpf: input.cpf,
        dateOfBirth: input.dateOfBirth,
        phone: credihomePhone(lead.phone),
        email: input.email,
        useFgts: input.useFgts,
        realtyPrice: input.realtyPrice,
        mortgageValue: input.mortgageValue,
        sourceUrl: lead.listingId ? `${siteUrl}/anuncio/${lead.listingId}` : siteUrl,
      });
    } catch (error) {
      if (error instanceof CredihomeError) throw new BadRequestException(`Credihome: ${error.message}`);
      throw error;
    }

    const now = new Date();
    await this.prisma.financingLead.update({
      where: { id: leadId },
      data: {
        credihomeLeadId: result.leadId,
        credihomePhase: "lead",
        credihomeSentAt: now,
        credihomeConsentAt: now,
        // Valor a financiar vira o valor negociado, se o admin ainda não tinha
        // preenchido — é a base da comissão no quadro.
        ...(lead.negotiatedValue === null ? { negotiatedValue: input.mortgageValue } : {}),
        ...(lead.email ? {} : { email: input.email }),
        ...(lead.bank ? {} : { bank: "Credihome" }),
      },
    });
    // Fase real (o lead pode já existir lá e estar mais adiante).
    await this.refresh(leadId).catch(() => undefined);
    return { credihomeLeadId: result.leadId, alreadyExisted: result.alreadyExisted };
  }

  async refresh(leadId: string): Promise<{ phase: string }> {
    const lead = await this.prisma.financingLead.findUnique({ where: { id: leadId }, select: { credihomeLeadId: true } });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    if (!lead.credihomeLeadId) throw new BadRequestException("Este lead ainda não foi enviado à Credihome.");
    try {
      const { phase } = await fetchCredihomePhase(lead.credihomeLeadId);
      await this.prisma.financingLead.update({ where: { id: leadId }, data: { credihomePhase: phase, credihomeSyncedAt: new Date() } });
      return { phase };
    } catch (error) {
      if (error instanceof CredihomeError) throw new BadRequestException(`Credihome: ${error.message}`);
      throw error;
    }
  }

  async syncAll(): Promise<{ updated: number; failed: number }> {
    if (!credihomeEnabled()) return { updated: 0, failed: 0 };
    const leads = await this.prisma.financingLead.findMany({
      where: {
        credihomeLeadId: { not: null },
        OR: [{ credihomePhase: null }, { credihomePhase: { not: "finalizado" } }],
        credihomeSentAt: { gte: new Date(Date.now() - SYNC_WINDOW_DAYS * 86_400_000) },
      },
      select: { id: true },
      take: 200,
    });
    let updated = 0;
    let failed = 0;
    for (const lead of leads) {
      try {
        await this.refresh(lead.id);
        updated++;
      } catch {
        failed++;
      }
    }
    if (failed) this.logger.warn(`Credihome: ${failed} lead(s) não atualizaram`);
    return { updated, failed };
  }
}
