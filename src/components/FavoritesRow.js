'use client';

import { useEffect, useState } from 'react';
import { useShoppingListStore } from '@/lib/store';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { getFavoriteDeals } from '@/actions/get-favorite-deals';
import { dedupeDeals } from '@/lib/dedupe-deals';

// "Τα αγαπημένα σου" — current offers for the user's ⭐ watchlist. Renders
// nothing until the user has favourites AND at least one of them is on offer,
// so the homepage carries no empty state for non-users of the feature.
export function FavoritesRow({ onAdd, onSelect }) {
  const favorites = useShoppingListStore((s) => s.favorites);
  const [deals, setDeals] = useState([]);

  useEffect(() => {
    // Empty watchlist is handled at render (no sync setState in the effect —
    // react-compiler rule); stale deals can't show because render gates on
    // favorites.length too.
    if (!favorites || favorites.length === 0) return;
    let cancelled = false;
    const productIds = favorites.map((f) => f.productId).filter(Boolean);
    const names = favorites.filter((f) => !f.productId).map((f) => f.productName).filter(Boolean);
    getFavoriteDeals({ productIds, names })
      .then((res) => { if (!cancelled && res.success) setDeals(res.deals || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [favorites]);

  if (!favorites || favorites.length === 0 || deals.length === 0) return null;

  return (
    <FeaturedCarousel
      title="Τα αγαπημένα σου"
      sub="Προϊόντα που παρακολουθείς, σε προσφορά τώρα"
      deals={dedupeDeals(deals)}
      onAdd={onAdd}
      onSelect={onSelect}
    />
  );
}
