'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCatalogProducts } from '@/actions/get-catalog-products';
import { ProductCard } from './ProductCard';
import { SiteHeader } from './SiteHeader';
import { ShoppingList } from './ShoppingList';
import { PreferredStoresSheet } from './PreferredStoresSheet';
import { useShoppingListStore } from '@/lib/store';

const PAGE = 24;

// Full-catalog browse: offers first, then the wider Product catalog for search /
// deeper browsing. On-offer products show an honest price + deep-link to the
// offer; the rest are silent info tiles.
export default function CatalogClient({ initial }) {
  const [products, setProducts] = useState(initial.products);
  const [total, setTotal] = useState(initial.total);
  const [offset, setOffset] = useState(initial.products.length);
  const [query, setQuery] = useState('');     // live input
  const [search, setSearch] = useState('');   // committed (debounced) term
  const [loading, setLoading] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const sentinelRef = useRef(null);
  const skipNextReloadRef = useRef(true);
  const cartCount = useShoppingListStore((s) => s.items.length);

  const hasMore = products.length < total;

  // Debounce the typed query into the committed search term (setState here runs
  // in a timer callback, not synchronously in the effect body).
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (reset) => {
      setLoading(true);
      try {
        const currentOffset = reset ? 0 : offset;
        const res = await getCatalogProducts({ search, limit: PAGE, offset: currentOffset });
        setTotal(res.total);
        setOffset(currentOffset + res.products.length);
        setProducts(reset ? res.products : (prev) => [...prev, ...res.products]);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    },
    [search, offset]
  );

  // Refetch page 0 on a new committed search (skip the SSR-provided initial '').
  useEffect(() => {
    if (skipNextReloadRef.current) { skipNextReloadRef.current = false; return; }
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) load(false);
  }, [hasMore, loading, load]);

  // Infinite-scroll sentinel.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleLoadMore(); },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleLoadMore]);

  return (
    <>
      <SiteHeader
        cartCount={cartCount}
        onCartOpen={() => setIsCartOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 12px 80px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px' }}>Όλα τα προϊόντα</h1>
        <p style={{ color: 'var(--ink-3, #888)', fontSize: 13, margin: '0 0 14px' }}>
          Πρώτα όσα είναι σε προσφορά τώρα — και μετά όλος ο κατάλογος για αναζήτηση.
        </p>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση προϊόντος ή μάρκας…"
          aria-label="Αναζήτηση στον κατάλογο"
          style={{
            width: '100%', padding: '12px 14px', fontSize: 15,
            border: '1px solid var(--line, #e3e3e3)', borderRadius: 12,
            marginBottom: 14, background: 'var(--surface, #fff)',
          }}
        />

        <div style={{ color: 'var(--ink-3, #888)', fontSize: 12, marginBottom: 10 }}>
          {total.toLocaleString('el-GR')} προϊόντα{search ? ` για «${search}»` : ''}
        </div>

        {products.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3, #888)', padding: '40px 0' }}>
            Δεν βρέθηκαν προϊόντα.
          </div>
        ) : (
          <div className="products-grid">
            {products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--ink-3, #888)', padding: '20px 0' }}>Φόρτωση…</div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <PreferredStoresSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
