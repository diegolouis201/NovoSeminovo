import { Injectable } from "@nestjs/common";
import {
  APRESENTACAO_LINK_PATH,
  APRESENTACAO_PDF_PATH,
  APRESENTACAO_TARGET,
  CampaignVisitInputSchema,
  type ApresentacaoAberturas,
  type CampaignVisitInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;

// Dia no horário de Brasília (UTC-3, sem horário de verão desde 2019).
export function diaBrasilia(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// Mesmo visitante + mesma campanha em 30 min = uma abertura só (o leitor de
// e-mail e o clique duplo não inflam a conta). Só em memória: o IP nunca vai
// para o banco.
const JANELA_MS = 30 * 60 * 1000;
const vistos = new Map<string, number>();
export function visitaRepetida(chave: string, now = Date.now()): boolean {
  const antes = vistos.get(chave);
  if (antes !== undefined && now - antes < JANELA_MS) return true;
  if (vistos.size > 20_000) vistos.clear();
  vistos.set(chave, now);
  return false;
}

@Injectable()
export class ApresentacaoVisitasService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(raw: CampaignVisitInput, now = new Date()): Promise<void> {
    const input = CampaignVisitInputSchema.parse(raw);
    const key = { day: diaBrasilia(now), target: input.target, source: input.source ?? "", medium: input.medium ?? "", campaign: input.campaign ?? "", content: input.content ?? "" };
    await this.prisma.campaignVisitDay.upsert({
      where: { day_target_source_medium_campaign_content: key },
      create: { ...key, count: 1, lastAt: now },
      update: { count: { increment: 1 }, lastAt: now },
    });
  }

  // Hub (/prospeccao): aberturas da apresentação nos últimos 30 dias, por utm.
  async resumo(now = new Date()): Promise<ApresentacaoAberturas> {
    const desde30 = diaBrasilia(new Date(now.getTime() - 29 * DAY_MS));
    const desde7 = diaBrasilia(new Date(now.getTime() - 6 * DAY_MS));
    const rows = await this.prisma.campaignVisitDay.findMany({ where: { target: APRESENTACAO_TARGET, day: { gte: desde30 } }, take: 5000 });
    const grupos = new Map<string, ApresentacaoAberturas["linhas"][number]>();
    for (const r of rows) {
      const k = [r.source, r.medium, r.campaign, r.content].join("|");
      const g = grupos.get(k) ?? { origem: r.source || undefined, meio: r.medium || undefined, campanha: r.campaign || undefined, conteudo: r.content || undefined, aberturas7d: 0, aberturas30d: 0, ultimaEm: r.lastAt.toISOString() };
      g.aberturas30d += r.count;
      if (r.day >= desde7) g.aberturas7d += r.count;
      if (r.lastAt.toISOString() > g.ultimaEm) g.ultimaEm = r.lastAt.toISOString();
      grupos.set(k, g);
    }
    const linhas = [...grupos.values()].sort((a, b) => b.aberturas30d - a.aberturas30d || b.ultimaEm.localeCompare(a.ultimaEm)).slice(0, 100);
    return {
      link: APRESENTACAO_PDF_PATH,
      linkCampanha: APRESENTACAO_LINK_PATH,
      total7d: linhas.reduce((s, l) => s + l.aberturas7d, 0),
      total30d: linhas.reduce((s, l) => s + l.aberturas30d, 0),
      linhas,
    };
  }
}
