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

  const [selectedSMs, setSelectedSMs] = useState(() => initial.supermarkets || []);
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
          "all",
          activeCategory,
          sortBy,
          selectedSMs.length > 0 ? selectedSMs : preferredStores
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
    [selectedSMs, activeCategory, sortBy, offset, preferredStores]
  );

  const selectedSMsKey = selectedSMs.join(",");
  useEffect(() => {
    if (skipNextReloadRef.current) {
      skipNextReloadRef.current = false;
      return;
    }
    load(true);
    const url = new URL(window.location);
    if (selectedSMs.length > 0) url.searchParams.set("supermarket", selectedSMs.join(",")); else url.searchParams.delete("supermarket");
    if (activeCategory !== "all") url.searchParams.set("category", activeCategory); else url.searchParams.delete("category");
    if (sortBy !== "expiring") url.searchParams.set("sort", sortBy); else url.searchParams.delete("sort");
    window.history.replaceState({}, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSMsKey, activeCategory, sortBy, preferredStores]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading && !loadingMore) load(false);
  }, [hasMore, loading, loadingMore, load]);

  const handleClearFilters = () => {
    setSelectedSMs([]);
    setActiveCategory("all");
    setSortBy("expiring");
  };

  const toggleSM = (id) => {
    setSelectedSMs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const hasActiveFilters = selectedSMs.length > 0 || activeCategory !== "all";

  const title = useMemo(() => {
    const c = CATEGORIES.find((x) => x.id === activeCategory);
    const smObjs = SUPERMARKETS.filter((s) => selectedSMs.includes(s.id));
    let smLabel = "";
    if (smObjs.length === 1) smLabel = smObjs[0].name;
    else if (smObjs.length > 1 && smObjs.length <= 3) smLabel = smObjs.map((s) => s.name).join(" + ");
    else if (smObjs.length > 3) smLabel = `${smObjs.length} σούπερ μάρκετ`;

    if (c && activeCategory !== "all" && smLabel) return `${c.label} · ${smLabel}`;
    if (c && activeCategory !== "all") return c.label;
    if (smLabel) return `Προσφορές ${smLabel}`;
    return "Όλες οι προσφορές";
  }, [activeCategory, selectedSMs]);

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
              {preferredStores.length > 0 && selectedSMs.length === 0 && (
                <> · από {preferredStores.length} αγαπημένα καταστήματα</>
              )}
            </div>
          </header>

          <div className="sm-bar" role="group" aria-label="Σούπερ μάρκετ">
            <button
              type="button"
              className={`sm-chip sm-chip-all${selectedSMs.length === 0 ? " active" : ""}`}
              onClick={() => setSelectedSMs([])}
              aria-pressed={selectedSMs.length === 0}
            >
              <span className="sm-chip-all-icon" aria-hidden="true">★</span>
              <span className="sm-chip-label">Όλα</span>
            </button>
            {SUPERMARKETS.map((s) => {
              const active = selectedSMs.includes(s.id);
              return (
                <SupermarketChip
                  key={s.id}
                  sm={s}
                  active={active}
                  onClick={() => toggleSM(s.id)}
                />
              );
            })}
          </div>
          {selectedSMs.length > 1 && (
            <div className="sm-multi-hint">
              <Icon.Check size={14} /> Προβολή προσφορών από {selectedSMs.length} σούπερ μάρκετ
            </div>
          )}

          <div className="filter-bar">
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

          {preferredStores.length > 0 && selectedSMs.length === 0 && (
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

function SupermarketChip({ sm, active, onClick }) {
  const [imgErr, setImgErr] = useState(false);
  const style = active
    ? { background: sm.color, borderColor: sm.color, color: "#fff" }
    : { borderColor: active ? sm.color : undefined };

  return (
    <button
      type="button"
      className={`sm-chip${active ? " active" : ""}`}
      onClick={onClick}
      style={style}
      aria-pressed={active}
      aria-label={sm.name}
    >
      <span className="sm-chip-logo" style={{ background: active ? "#fff" : sm.bg }}>
        {!imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/logos/${sm.logo || `${sm.id}.png`}`}
            alt=""
            onError={() => setImgErr(true)}
          />
        ) : (
          <span
            className="sm-chip-fallback"
            style={{ color: active ? sm.color : sm.color }}
          >
            {sm.short}
          </span>
        )}
      </span>
      <span className="sm-chip-label">{sm.name}</span>
      {active && (
        <span className="sm-chip-check" aria-hidden="true">
          <Icon.Check size={12} />
        </span>
      )}
    </button>
  );
}
