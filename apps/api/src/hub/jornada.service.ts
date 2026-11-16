import { Injectable } from "@nestjs/common";
import { JORNADA_PREMISSAS_PADRAO, JornadaPremissasSchema, type HubJornada, type JornadaPremissas, type JornadaRede, type JornadaRedeAtual } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { montarJornada } from "./jornada-regras";
import { SeguidoresService } from "./jornada-seguidores.service";

const DAY_MS = 86_400_000;
// As premissas ficam na tabela de configurações do Hub (mkt_settings), chave
// "jornada" — sem tabela nova, sem prisma db push.
const CHAVE = "jornada";

@Injectable()
export class JornadaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seguidores: SeguidoresService,
  ) {}

  async ler(): Promise<HubJornada> {
    const [salvo, reais, redes] = await Promise.all([this.premissasSalvas(), this.numerosReais(), this.seguidores.redes()]);
    return { ...montarJornada({ ...reais, redes }, salvo ?? JORNADA_PREMISSAS_PADRAO, new Date()), premissasPadrao: !salvo };
  }

  async salvarPremissas(p: JornadaPremissas) {
    const valor = JornadaPremissasSchema.parse(p);
    await this.prisma.mktSetting.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor }, update: { valor } });
  }

  salvarSeguidoresManual(rede: JornadaRede, valor: number): Promise<JornadaRedeAtual> {
    return this.seguidores.registrarManual(rede, valor);
  }

  // Valor estragado ou antigo no banco não derruba a tela: volta ao padrão.
  private async premissasSalvas(): Promise<JornadaPremissas | null> {
    const row = await this.prisma.mktSetting.findUnique({ where: { chave: CHAVE } });
    const parsed = row ? JornadaPremissasSchema.safeParse(row.valor) : null;
    return parsed?.success ? parsed.data : null;
  }

  // Mesma definição do painel geral do admin (admin/overview.service.ts):
  // - assinaturas: soma do preço mensal das assinaturas "active" pagas pelo
  //   Stripe (com paymentProviderRef; ativada sem cobrança não conta) = MRR;
  // - planos de anúncio PF: soma dos planos pagos (status "paid") nos
  //   últimos 30 dias.
  // Clientes pagantes seguem a mesma regra: empresas com assinatura paga
  // ativa + particulares (pessoas diferentes) que pagaram plano em 30 dias.
  // Seguidores vêm do SeguidoresService (Graph da Meta, YouTube, Windsor como
  // reserva do Instagram, ou digitados pelo dono); rede
  // sem número fica vazia (a tela mostra "—"), nunca inventada.
  private async numerosReais() {
    const since30 = new Date(Date.now() - 30 * DAY_MS);
    const [subs, planos] = await Promise.all([
      this.prisma.subscription.findMany({ where: { status: "active", paymentProviderRef: { not: null } }, select: { partnerId: true, plan: { select: { priceMonth: true } } } }),
      this.prisma.listingBoostPurchase.findMany({ where: { status: "paid", paidAt: { gte: since30 } }, select: { userId: true, amount: true } }),
    ]);
    return {
      assinaturas: subs.reduce((acc, s) => acc + Number(s.plan.priceMonth), 0),
      planosAnuncio30d: planos.reduce((acc, p) => acc + Number(p.amount), 0),
      empresas: new Set(subs.map((s) => s.partnerId)).size,
      particulares: new Set(planos.map((p) => p.userId)).size,
    };
  }
}
