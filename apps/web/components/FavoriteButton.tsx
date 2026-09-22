"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/lib/actions/favorites";

export function FavoriteButton({
  listingId,
  initialFavorited,
  isAuthenticated,
  className = "",
}: {
  listingId: string;
  initialFavorited: boolean;
  isAuthenticated: boolean;
  className?: string;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  const baseClass = `relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink ${className}`;

  if (!isAuthenticated) {
    return (
      <Link href="/entrar" aria-label="Entrar para favoritar" className={baseClass}>
        ♡
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
      aria-pressed={favorited}
      disabled={isPending}
      className={baseClass}
      onClick={() => {
        const next = !favorited;
        setFavorited(next);
        startTransition(async () => {
          const ok = await toggleFavoriteAction(listingId, next);
          if (!ok) setFavorited(!next);
        });
      }}
    >
      <span className={favorited ? "text-status-danger" : undefined}>{favorited ? "♥" : "♡"}</span>
    </button>
  );
}
