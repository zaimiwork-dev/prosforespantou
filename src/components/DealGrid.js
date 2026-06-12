'use client';

import { useMemo, useRef, useCallback, useEffect } from 'react';
import { DiscountCard } from './DiscountCard';
import { Icon } from './Icons';
import { useShoppingListStore } from '@/lib/store';
import { groupDealsByProduct } from '@/lib/group-deals';

function Skeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="card-img skeleton-shimmer" />
      <div className="card-body" style={{ gap: 8 }}>
        <div className="skeleton-shimmer" style={{ height: 12, width: "45%", borderRadius: 4 }} />
        <div className="skeleton-shimmer" style={{ height: 14, width: "90%", borderRadius: 4 }} />
        <div className="skeleton-shimmer" style={{ height: 18, width: "40%", borderRadius: 4, marginTop: 4 }} />
      </div>
    </div>
  );
}

export function DealGrid({
  deals,
  loading,
  loadingMore,
  hasMore,
  totalCount,
  onLoadMore,
  onAdd,
  onSelect,
  emptyTitle,
  emptyText,
  onClearFilters,
}) {
  const cartItems = useShoppingListStore((s) => s.items);
  const cartIds = useMemo(() => new Set(cartItems.map((i) => i.id)), [cartItems]);
  const grouped = useMemo(() => groupDealsByProduct(deals), [deals]);

  // Auto-load the next page when the user nears the bottom — no button press
  // per page. The button stays as a fallback (old browsers, a11y, and as the
  // visible "there is more" affordance). The latest callback lives in a ref so
  // the observer never re-subscribes; a callback ref (not an effect) attaches
  // it, because the sentinel mounts/unmounts with the empty-state swap while
  // DealGrid itself stays mounted.
  const loadMoreRef = useRef(null);
  useEffect(() => {
    loadMoreRef.current = !loading && !loadingMore && hasMore && onLoadMore ? onLoadMore : null;
  });
  const observerRef = useRef(null);
  const sentinelRef = useCallback((el) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMoreRef.current?.(); },
      // Start fetching one viewport early so the scroll rarely hits the wall.
      { rootMargin: '100% 0px' }
    );
    io.observe(el);
    observerRef.current = io;
  }, []);

  const isEmpty = !loading && grouped.length === 0;

  if (isEmpty) {
    return (
      <div className="empty-state">
        <div className="empty-ico"><Icon.Search size={28} /></div>
        <h4>{emptyTitle || "Δεν βρέθηκαν προσφορές"}</h4>
        <p>{emptyText || "Δοκίμασε άλλα φίλτρα ή άλλη αναζήτηση."}</p>
        {onClearFilters && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onClearFilters} style={{ marginTop: 16 }}>
            Καθαρισμός φίλτρων
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="products-grid">
        {grouped.map((d) => (
          <DiscountCard key={d.id} d={d} onAdd={onAdd} onSelect={onSelect} inCart={cartIds.has(d.id)} />
        ))}
        {loading && Array(8).fill(0).map((_, i) => <Skeleton key={i} />)}
      </div>

      <div ref={sentinelRef} aria-hidden="true" />

      {!loading && hasMore && onLoadMore && (
        <div className="load-more-wrap">
          <div className="sub">Εμφανίζονται {grouped.length} από {totalCount.toLocaleString("el-GR")}</div>
          <button
            type="button"
            className="btn btn-outline btn-lg"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <><span className="spinner" /> Φόρτωση…</> : <>Φόρτωσε περισσότερες</>}
          </button>
        </div>
      )}

      {!loading && !hasMore && grouped.length > 0 && (
        <div className="sub" style={{ textAlign: "center", marginTop: 28 }}>
          Εμφανίζονται όλες οι {grouped.length.toLocaleString("el-GR")} προσφορές
        </div>
      )}
    </>
  );
}
