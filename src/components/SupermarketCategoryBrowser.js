'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browseSupermarketDeals } from '@/actions/browse-supermarket-deals';
import { DealGrid } from './DealGrid';

const PAGE_SIZE = 48;

function CategoryCard({ node, onClick }) {
  return (
    <button type="button" className="supermarket-category-card" onClick={onClick}>
      <span className="supermarket-category-art" aria-hidden="true">
        {node.image ? (
          // Category imagery can be local or supplied by the supermarket feed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.image} alt="" />
        ) : (
          <span>🏷️</span>
        )}
      </span>
      <strong>{node.label}</strong>
      <small>{node.count.toLocaleString('el-GR')} προσφορές</small>
    </button>
  );
}

export function SupermarketCategoryBrowser({ tree, supermarket, onAdd, onSelect }) {
  const [topKey, setTopKey] = useState(null);
  const [groupKey, setGroupKey] = useState(null);
  const [leafKey, setLeafKey] = useState(null);
  const [deals, setDeals] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const top = useMemo(() => tree.find((node) => node.key === topKey) || null, [tree, topKey]);
  const group = useMemo(
    () => top?.children.find((node) => node.key === groupKey) || null,
    [top, groupKey]
  );
  const leaf = useMemo(
    () => group?.children.find((node) => node.key === leafKey) || null,
    [group, leafKey]
  );
  const isFinalSelection = Boolean(group && (leaf || group.children.length === 0));
  const visibleNodes = !top ? tree : !group ? top.children : group.children;
  const currentLabel = leaf?.label || group?.label || top?.label || 'Κατηγορίες';

  const loadPage = useCallback(async (append = false) => {
    if (!group || !isFinalSelection) return;
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const offset = append ? deals.length : 0;
      const result = await browseSupermarketDeals({
        supermarket,
        topKey,
        groupKey,
        leafKey: leafKey || null,
        offset,
        limit: PAGE_SIZE,
      });
      setDeals((current) => append ? [...current, ...(result.deals || [])] : (result.deals || []));
      setTotal(result.total || 0);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [deals.length, group, groupKey, isFinalSelection, leafKey, supermarket, topKey]);

  useEffect(() => {
    if (!isFinalSelection) {
      setDeals([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDeals([]);
    browseSupermarketDeals({
      supermarket,
      topKey,
      groupKey,
      leafKey: leafKey || null,
      offset: 0,
      limit: PAGE_SIZE,
    }).then((result) => {
      if (cancelled) return;
      setDeals(result.deals || []);
      setTotal(result.total || 0);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [groupKey, isFinalSelection, leafKey, supermarket, topKey]);

  const reset = () => {
    setTopKey(null);
    setGroupKey(null);
    setLeafKey(null);
  };

  const selectTop = (key) => {
    setTopKey(key);
    setGroupKey(null);
    setLeafKey(null);
  };

  const selectGroup = (key) => {
    setGroupKey(key);
    setLeafKey(null);
  };

  return (
    <section className="supermarket-category-browser">
      <nav className="supermarket-category-crumbs" aria-label="Διαδρομή κατηγορίας">
        <button type="button" onClick={reset}>Κατηγορίες</button>
        {top && (
          <>
            <span>›</span>
            <button type="button" onClick={() => selectTop(top.key)}>{top.label}</button>
          </>
        )}
        {group && (
          <>
            <span>›</span>
            <button type="button" onClick={() => selectGroup(group.key)}>{group.label}</button>
          </>
        )}
        {leaf && (
          <>
            <span>›</span>
            <strong>{leaf.label}</strong>
          </>
        )}
      </nav>

      {!isFinalSelection ? (
        <>
          <div className="supermarket-category-heading">
            <div>
              <h2>{top ? top.label : 'Περιήγηση κατηγοριών'}</h2>
              <p>
                {top
                  ? `${visibleNodes.length} ${visibleNodes.length === 1 ? 'κατηγορία' : 'κατηγορίες'} με ενεργές προσφορές`
                  : 'Διάλεξε τι ψάχνεις και δες μόνο τις σχετικές προσφορές.'}
              </p>
            </div>
          </div>
          <div className="supermarket-category-grid">
            {visibleNodes.map((node) => (
              <CategoryCard
                key={node.key}
                node={node}
                onClick={() => top ? selectGroup(node.key) : selectTop(node.key)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="supermarket-category-results-head">
            <div>
              <span>Ενεργές προσφορές</span>
              <h2>{currentLabel}</h2>
            </div>
            <strong>{total.toLocaleString('el-GR')}</strong>
          </div>
          <DealGrid
            deals={deals}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={deals.length < total}
            totalCount={total}
            onLoadMore={() => loadPage(true)}
            onAdd={onAdd}
            onSelect={onSelect}
            emptyTitle={`Δεν βρέθηκαν ενεργές προσφορές στην κατηγορία «${currentLabel}»`}
            emptyText="Δοκίμασε μια άλλη κατηγορία ή επέστρεψε αργότερα."
          />
        </>
      )}
    </section>
  );
}
