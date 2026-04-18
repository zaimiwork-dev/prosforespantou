'use client';

import { DiscountCard } from './DiscountCard';
import { Icon } from './Icons';

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
  const isEmpty = !loading && deals.length === 0;

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
        {deals.map((d) => (
          <DiscountCard key={d.id} d={d} onAdd={onAdd} onSelect={onSelect} />
        ))}
        {loading && Array(8).fill(0).map((_, i) => <Skeleton key={i} />)}
      </div>

      {!loading && hasMore && onLoadMore && (
        <div className="load-more-wrap">
          <div className="sub">Εμφανίζονται {deals.length} από {totalCount.toLocaleString("el-GR")}</div>
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

      {!loading && !hasMore && deals.length > 0 && (
        <div className="sub" style={{ textAlign: "center", marginTop: 28 }}>
          Εμφανίζονται όλες οι {deals.length.toLocaleString("el-GR")} προσφορές
        </div>
      )}
    </>
  );
}
