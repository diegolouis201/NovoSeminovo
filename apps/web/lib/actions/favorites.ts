"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setFavorite } from "@/lib/api";

export async function toggleFavoriteAction(listingId: string, nextFavorited: boolean): Promise<boolean> {
  const session = await auth();
  if (!session?.accessToken) return false;

  const ok = await setFavorite(listingId, nextFavorited, session.accessToken);
  if (ok) {
    revalidatePath("/");
    revalidatePath("/busca");
    revalidatePath("/conta/favoritos");
  }
  return ok;
}
