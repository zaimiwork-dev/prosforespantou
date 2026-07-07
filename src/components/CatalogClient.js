'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCatalogProducts } from '@/actions/get-catalog-products';
import { ProductCard } from './ProductCard';
import { SiteHeader } from './SiteHeader';
import { ShoppingList } from './ShoppingList';
import { PreferredStoresSheet } from './PreferredStoresSheet';
import { ProductSheet } from './ProductSheet';
import { useShoppingListStore } from '@/lib/store';
import { CATEGORIES, SUPERMARKETS } from '@/lib/constants';

const PAGE = 24;

// Full-catalog browse: active offers first, then the wider Product catalog for
// search/deeper browsing. Offer products open the same sheet as the rest of the
// app so the catalog does not feel like a separate, colder surface.
// initialStore preselects the chain filter (deep link from the supermarket
// pages: /catalog?supermarket=ab). The server initial fetch must have used the
// same value or the first paint shows the wrong list.
export default function CatalogClient({ initial, initialStore = 'all' }) {
  const [products, setProducts] = useState(initial.products);
  const [total, setTotal] = useState(initial.total);
  const [offset, setOffset] = useState(initial.products.length);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('catalog');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeStore, setActiveStore] = useState(initialStore);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const sentinelRef = useRef(null);
  const skipNextReloadRef = useRef(true);
  const cartCount = useShoppingListStore((s) => s.items.length);
  const addItem = useShoppingListStore((s) => s.addItem);

  const facets = initial.facets || { offerTotal: 0, catalogTotal: total, bySupermarket: {}, offerBySupermarket: {}, byCategory: {} };
  const hasMore = products.length < total;
  const categoryItems = CATEGORIES.filter((c) => c.id !== 'all' && (facets.byCategory?.[c.id] || 0) > 0);
  const storeCounts = mode === 'offers' ? (facets.offerBySupermarket || {}) : (facets.bySupermarket || {});
  const storeItems = SUPERMARKETS
    .filter((s) => (storeCounts[s.id] || 0) > 0)
    .sort((a, b) => (storeCounts[b.id] || 0) - (storeCounts[a.id] || 0));

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (reset) => {
      setLoading(true);
      try {
        const currentOffset = reset ? 0 : offset;
        const res = await getCatalogProducts({
          search,
          limit: PAGE,
          offset: currentOffset,
          mode,
          category: mode === 'offers' ? activeCategory : 'all',
          supermarket: activeStore,
        });
        setTotal(res.total);
        setOffset(currentOffset + res.products.length);
        setProducts(reset ? res.products : (prev) => [...prev, ...res.products]);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    },
    [search, mode, activeCategory, activeStore, offset]
  );

  useEffect(() => {
    if (skipNextReloadRef.current) { skipNextReloadRef.current = false; return; }
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, mode, activeCategory, activeStore]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) load(false);
  }, [hasMore, loading, load]);

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

  const resetFilters = () => {
    setActiveCategory('all');
    setActiveStore('all');
  };

  const selectMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode === 'catalog') setActiveCategory('all');
  };

  return (
    <>
      <SiteHeader
        cartCount={cartCount}
        onCartOpen={() => setIsCartOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />
      <main className="catalog-shell">
        <section className="catalog-head">
          <div>
            <div className="eyebrow">Πλήρεις κατάλογοι</div>
            <h1>Αναζήτηση προϊόντων</h1>
            <p>
              Βλέπεις τον πλήρη κατάλογο προϊόντων. Άνοιξε τις προσφορές μόνο όταν θέλεις ενεργές εκπτώσεις.
            </p>
          </div>
          <div className="catalog-stats" aria-label="Σύνοψη καταλόγου">
            <span><b>{facets.offerTotal.toLocaleString('el-GR')}</b> προσφορές</span>
            <span><b>{facets.catalogTotal.toLocaleString('el-GR')}</b> προϊόντα</span>
          </div>
        </section>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση προϊόντος ή μάρκας..."
          aria-label="Αναζήτηση στον κατάλογο"
          className="catalog-search"
        />

        <div className="catalog-mode-tabs" aria-label="Τύπος καταλόγου">
          <button
            type="button"
            className={mode === 'catalog' ? 'active' : ''}
            onClick={() => selectMode('catalog')}
          >
            Όλα τα προϊόντα <span>{facets.catalogTotal.toLocaleString('el-GR')}</span>
          </button>
          <button
            type="button"
            className={mode === 'offers' ? 'active' : ''}
            onClick={() => selectMode('offers')}
          >
            Προσφορές τώρα <span>{facets.offerTotal.toLocaleString('el-GR')}</span>
          </button>
        </div>

        <div className="catalog-controls" aria-label="Φίλτρα καταλόγου">
          {mode === 'offers' && (
            <div className="catalog-filter-row">
              <button
                type="button"
                className={`catalog-chip${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                Όλες οι προσφορές
              </button>
              {categoryItems.slice(0, 10).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`catalog-chip${activeCategory === c.id ? ' active' : ''}`}
                  onClick={() => setActiveCategory(c.id)}
                >
                  {c.label} <span>{(facets.byCategory[c.id] || 0).toLocaleString('el-GR')}</span>
                </button>
              ))}
            </div>
          )}

          <div className="catalog-filter-row compact">
            <button
              type="button"
              className={`catalog-chip${activeStore === 'all' ? ' active' : ''}`}
              onClick={() => setActiveStore('all')}
            >
              Όλα τα καταστήματα
            </button>
            {storeItems.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`catalog-chip store${activeStore === s.id ? ' active' : ''}`}
                onClick={() => setActiveStore(s.id)}
                style={{ '--chip-color': s.color }}
              >
                {s.name} <span>{(storeCounts[s.id] || 0).toLocaleString('el-GR')}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="catalog-result-line">
          <span>
            {total.toLocaleString('el-GR')} {mode === 'offers' ? 'προσφορές' : 'προϊόντα'}{search ? ` για "${search}"` : ''}
          </span>
          {(activeCategory !== 'all' || activeStore !== 'all') && (
            <button type="button" onClick={resetFilters}>Καθαρισμός φίλτρων</button>
          )}
        </div>

        {products.length === 0 && !loading ? (
          <div className="empty-state">
            <h4>Δεν βρέθηκαν προϊόντα</h4>
            <p>Δοκίμασε άλλη αναζήτηση ή καθάρισε τα φίλτρα.</p>
          </div>
        ) : (
          <div className="products-grid">
            {products.map((p) => <ProductCard key={p.id} p={p} onSelect={setSelectedProduct} />)}
          </div>
        )}

        {loading && (
          <div className="catalog-loading">Φόρτωση...</div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </main>
      <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <PreferredStoresSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
