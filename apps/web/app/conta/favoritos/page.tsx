import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ListingCard } from "@/components/ListingCard";
import { fetchMyFavorites } from "@/lib/api";

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const favorites = await fetchMyFavorites(session.accessToken);

  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Meus favoritos</h1>
        <Link href="/conta" className="text-sm font-semibold text-brand-blue">
          Voltar para a conta
        </Link>
      </div>

      {favorites.length === 0 ? (
        <p className="mt-6 text-ink-muted">
          Você ainda não favoritou nenhum anúncio.{" "}
          <Link href="/busca" className="font-semibold text-brand-blue">
            Buscar carros e imóveis
          </Link>
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-5">
          {favorites.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isFavorited isAuthenticated />
          ))}
        </div>
      )}
    </main>
  );
}
