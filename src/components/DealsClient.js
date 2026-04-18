'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { getActiveDeals } from "@/actions/get-active-deals";
import { useShoppingListStore } from "@/lib/store";

import { ProductModal } from "@/components/ProductModal";
import { ShoppingList } from "@/components/ShoppingList";
import { PreferredStoresSheet } from "@/components/PreferredStoresSheet";
import { SiteHeader } from "@/components/SiteHeader";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icons";
import { SUPERMARKETS, CATEGORIES } from "@/lib/constants";

const PAGE_SIZE = 24;

const SORTS = [
  { id: "expiring",  label: "Λήγουν σύντομα" },
  { id: "discount",  label: "Μεγαλύτερη έκπτωση" },
  { id: "price_asc", label: "Τιμή: χαμηλή → υψηλή" },
  { id: "price_desc",label: "Τιμή: υψηλή → χαμηλή" },
  { id: "newest",    label: "Νεότερες" },
];

export default function DealsClient({ initial }) {
  const [discounts, setDiscounts] = useState(initial.deals);
  const [totalCount, setTotalCount] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(initial.deals.length);
  const [hasMore, setHasMore] = useState(initial.deals.length < initial.total);

  const [activeSM, setActiveSM] = useState(initial.supermarket || "all");
  const [activeCategory, setActiveCategory] = useState(initial.category || "all");
  const [sortBy, setSortBy] = useState(initial.sort || "expiring");

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { items: cart, addItem, preferredStores, clearPreferred } = useShoppingListStore();

  const skipNextReloadRef = useRef(true);

  const load = useCallback(
    async (reset) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const currentOffset = reset ? 0 : offset;
        const { deals, total } = await getActiveDeals(
          PAGE_SIZE,
          currentOffset,
          activeSM,
          activeCategory,
          sortBy,
          activeSM === "all" ? preferredStores : undefined
        );
        setTotalCount(total);
        setHasMore(currentOffset + deals.length < total);
        setOffset(currentOffset + deals.length);
        setDiscounts(reset ? deals : (prev) => [...prev, ...deals]);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [activeSM, activeCategory, sortBy, offset, preferredStores]
  );

  useEffect(() => {
    if (skipNextReloadRef.current) {
      skipNextReloadRef.current = false;
      return;
    }
    load(true);
    const url = new URL(window.location);
    if (activeSM !== "all") url.searchParams.set("supermarket", activeSM); else url.searchParams.delete("supermarket");
    if (activeCategory !== "all") url.searchParams.set("category", activeCategory); else url.searchParams.delete("category");
    if (sortBy !== "expiring") url.searchParams.set("sort", sortBy); else url.searchParams.delete("sort");
    window.history.replaceState({}, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSM, activeCategory, sortBy, preferredStores]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading && !loadingMore) load(false);
  }, [hasMore, loading, loadingMore, load]);

  const handleClearFilters = () => {
    setActiveSM("all");
    setActiveCategory("all");
    setSortBy("expiring");
  };

  const hasActiveFilters = activeSM !== "all" || activeCategory !== "all";

  const title = useMemo(() => {
    const c = CATEGORIES.find((x) => x.id === activeCategory);
    const sm = SUPERMARKETS.find((x) => x.id === activeSM);
    if (c && activeCategory !== "all" && sm) return `${c.label} · ${sm.name}`;
    if (c && activeCategory !== "all") return c.label;
    if (sm) return `Προσφορές ${sm.name}`;
    return "Όλες οι προσφορές";
  }, [activeCategory, activeSM]);

  const categoryItems = CATEGORIES.filter((c) => c.id !== "all");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader
        cartCount={cart.length}
        onCartOpen={() => setIsCartOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />

      <main style={{ flex: 1 }}>
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Αρχική</Link>
            <Icon.ChevronRight size={14} />
            <span>Όλες οι προσφορές</span>
          </nav>

          <header className="listing-head">
            <h1>{title}</h1>
            <div className="count">
              {totalCount.toLocaleString("el-GR")} προσφορές
              {preferredStores.length > 0 && activeSM === "all" && (
                <> · από {preferredStores.length} αγαπημένα καταστήματα</>
              )}
            </div>
          </header>

          <div className="filter-bar">
            <button
              type="button"
              className={`chip${activeSM === "all" ? " active" : ""}`}
              onClick={() => setActiveSM("all")}
            >
              Όλα τα σούπερ μάρκετ
            </button>
            {SUPERMARKETS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip${activeSM === s.id ? " active" : ""}`}
                onClick={() => setActiveSM(s.id)}
              >
                <span className="dot" style={{ background: s.color }} />
                {s.name}
              </button>
            ))}

            <span className="divider" aria-hidden="true" />

            <button
              type="button"
              className={`chip${activeCategory === "all" ? " active" : ""}`}
              onClick={() => setActiveCategory("all")}
            >
              Όλες οι κατηγορίες
            </button>
            {categoryItems.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${activeCategory === c.id ? " active" : ""}`}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.label}
              </button>
            ))}

            <label className="sort-select">
              <Icon.Sort size={14} />
              <span>Ταξινόμηση:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Ταξινόμηση"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          {preferredStores.length > 0 && activeSM === "all" && (
            <div className="pref-banner">
              <span>Φιλτράρεται από τα αγαπημένα σου καταστήματα.</span>
              <button type="button" className="link" onClick={clearPreferred}>
                Δες όλα <Icon.ArrowRight size={12} />
              </button>
            </div>
          )}

          <DealGrid
            deals={discounts}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            totalCount={totalCount}
            onLoadMore={handleLoadMore}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            emptyTitle="Δεν βρέθηκαν προσφορές"
            emptyText="Δοκίμασε να καθαρίσεις κάποιο φίλτρο ή να αλλάξεις ταξινόμηση."
            onClearFilters={hasActiveFilters ? handleClearFilters : null}
          />
        </div>
      </main>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <PreferredStoresSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
