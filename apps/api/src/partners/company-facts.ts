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
    // Se a empresa foi apagada enquanto a Receita respondia, não há o que
    // gravar: segue para a próxima (sem derrubar a rodada inteira).
    const gravou = await prisma.$transaction(async (tx) => {
      const { count } = await tx.partner.updateMany({
        where: { id: partner.id },
        data: { foundedAt: opened, mainActivity: facts.activity, companySize: facts.size, shareCapital: facts.shareCapital, receitaCheckedAt: new Date() },
      });
      if (!count) return false;
      await tx.partnerSocio.createMany({
        data: facts.partners.map((socio) => ({ partnerId: partner.id, name: socio.name, role: socio.role, source: "receita" })),
        skipDuplicates: true,
      });
      return true;
    });
    if (gravou) filled++;
  }
  return filled;
}
