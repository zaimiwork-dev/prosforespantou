'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCatalogProducts } from '@/actions/get-catalog-products';
import { ProductCard } from './ProductCard';

const PAGE = 24;

// Full-catalog browse: search every Product we hold (offer or not), infinite
// scroll. On-offer products show an honest price + deep-link to the offer; the
// rest are silent info tiles. Follows DealsClient's fetch pattern — setState
// lives in the `load` useCallback, the effect only calls it (skip-ref guards the
// SSR-provided first render) — so it stays clear of the react-compiler
// set-state-in-effect rule.
export default function CatalogClient({ initial }) {
  const [products, setProducts] = useState(initial.products);
  const [total, setTotal] = useState(initial.total);
  const [offset, setOffset] = useState(initial.products.length);
  const [query, setQuery] = useState('');     // live input
  const [search, setSearch] = useState('');   // committed (debounced) term
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef(null);
  const skipNextReloadRef = useRef(true);

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
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 12px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px' }}>Όλα τα προϊόντα</h1>
      <p style={{ color: 'var(--ink-3, #888)', fontSize: 13, margin: '0 0 14px' }}>
        Όλος ο κατάλογος — με τιμή όταν κάτι είναι σε προσφορά τώρα.
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
  );
}
