import type { PrismaService } from "../prisma/prisma.service";
import type { CnpjService } from "./cnpj.service";

// Preenche data de abertura e sócios (Receita) das empresas ainda não
// conferidas, aos poucos (20 por vez) para não abusar das APIs públicas.
// Sócio preenchido à mão (aniversário) nunca é apagado.
export async function fillCompanyFacts(prisma: PrismaService, cnpj: CnpjService, onlyIds?: string[]): Promise<number> {
  const pending = await prisma.partner.findMany({
    where: { receitaCheckedAt: null, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    select: { id: true, document: true },
    take: 20,
  });
  let filled = 0;
  for (const partner of pending) {
    const facts = await cnpj.companyFacts(partner.document).catch(() => undefined);
    if (!facts) continue; // Receita fora do ar: tenta na próxima rodada
    const opened = facts.openedAt ? new Date(`${facts.openedAt}T12:00:00Z`) : undefined;
    await prisma.$transaction([
      prisma.partner.update({
        where: { id: partner.id },
        data: { foundedAt: opened, mainActivity: facts.activity, companySize: facts.size, shareCapital: facts.shareCapital, receitaCheckedAt: new Date() },
      }),
      prisma.partnerSocio.createMany({
        data: facts.partners.map((socio) => ({ partnerId: partner.id, name: socio.name, role: socio.role, source: "receita" })),
        skipDuplicates: true,
      }),
    ]);
    filled++;
  }
  return filled;
}
