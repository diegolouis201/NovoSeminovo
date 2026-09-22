import { auth } from "@/auth";
import { fetchMyFavoriteIds } from "@/lib/api";

// Usado pelas páginas que renderizam ListingCard em lista (home, busca) para
// saber, de uma vez só, quais anúncios a pessoa logada já favoritou.
export async function getFavoriteContext(): Promise<{ isAuthenticated: boolean; favoriteIds: Set<string> }> {
  const session = await auth();
  if (!session?.accessToken) return { isAuthenticated: false, favoriteIds: new Set() };

  const favoriteIds = await fetchMyFavoriteIds(session.accessToken);
  return { isAuthenticated: true, favoriteIds };
}
