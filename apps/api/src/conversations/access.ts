import type { PrismaService } from "../prisma/prisma.service";

// Quem pode ler e responder uma conversa: o comprador, o vendedor (dono do
// anúncio) e, em anúncio de loja/imobiliária, o dono e a equipe dela — quem
// atende o lead no funil continua a conversa pela plataforma.
export async function canAccessConversation(
  prisma: PrismaService,
  conversation: { buyerId: string; sellerUserId: string | null; listingId: string },
  userId: string,
): Promise<boolean> {
  if (conversation.buyerId === userId || conversation.sellerUserId === userId) return true;
  const listing = await prisma.listing.findUnique({ where: { id: conversation.listingId }, select: { partnerId: true } });
  return listing?.partnerId ? isPartnerTeam(prisma, listing.partnerId, userId) : false;
}

export async function isPartnerTeam(prisma: PrismaService, partnerId: string, userId: string): Promise<boolean> {
  return (await prisma.partner.count({ where: { id: partnerId, OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] } })) > 0;
}

// Conversa do chat de cada lead (mesmo anúncio + mesmo comprador), numa
// consulta só. Chave "listingId:buyerId".
export async function conversationsForLeads(
  prisma: PrismaService,
  leads: Array<{ listingId: string | null; buyerId: string | null }>,
): Promise<Map<string, string>> {
  const pairs = leads.filter((lead) => lead.listingId && lead.buyerId);
  if (pairs.length === 0) return new Map();
  const rows = await prisma.conversation.findMany({
    where: {
      listingId: { in: [...new Set(pairs.map((lead) => lead.listingId!))] },
      buyerId: { in: [...new Set(pairs.map((lead) => lead.buyerId!))] },
    },
    select: { id: true, listingId: true, buyerId: true },
  });
  return new Map(rows.map((row) => [`${row.listingId}:${row.buyerId}`, row.id]));
}
