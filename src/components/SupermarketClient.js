'use client';

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useShoppingListStore } from "@/lib/store";
import { ProductSheet } from "@/components/ProductSheet";
import { ShoppingList } from "@/components/ShoppingList";
import { SiteHeader } from "@/components/SiteHeader";
import { DealGrid } from "@/components/DealGrid";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icons";
import { Footer } from "@/components/Footer";
import { CATEGORIES } from "@/lib/constants";
import { track } from '@/lib/track';
import { searchDeals } from '@/actions/search-deals';
import { dedupeDeals } from '@/lib/dedupe-deals';
import { SupermarketAisles } from '@/components/SupermarketAisles';
import { SupermarketCategoryBrowser } from '@/components/SupermarketCategoryBrowser';

const GREEKLISH_MAP = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ',
};

function greeklishToGreek(text) {
  const lower = text.toLowerCase();
  let result = '';
  let i = 0;
  while (i < lower.length) {
    const two = lower[i] + (lower[i + 1] || '');
    if (GREEKLISH_MAP[two]) { result += GREEKLISH_MAP[two]; i += 2; }
    else if (GREEKLISH_MAP[lower[i]]) { result += GREEKLISH_MAP[lower[i]]; i++; }
    else { result += lower[i]; i++; }
  }
  return result;
}

const SYNONYMS = [
  ['gouda', 'γουδα', 'γκουντα'],
  ['bacon', 'μπεικον', 'μπεηκον'],
  ['edam', 'ενταμ'],
  ['cheddar', 'τσενταρ'],
  ['kelloggs', 'κελογκς'],
  ['quaker', 'κουακερ'],
  ['pampers', 'παμπερς']
];

function expandSearch(query) {
  if (!query) return [];
  const raw = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const terms = new Set([raw]);
  
  const isLatin = /^[a-zA-Z\s]+$/.test(raw);
  if (isLatin) {
    const greek = greeklishToGreek(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    terms.add(greek);
    
    if (raw.includes('x')) terms.add(greek.replace(/ξ/g, 'χ'));
    if (raw.includes('h')) {
       terms.add(greek.replace(/η/g, 'χ'));
       terms.add(greek.replace(/η/g, 'ι'));
    }
    if (raw.includes('u')) terms.add(greek.replace(/ου/g, 'υ'));
    if (raw.includes('y')) terms.add(greek.replace(/υ/g, 'ι'));
    if (raw.includes('w')) terms.add(greek.replace(/ω/g, 'ο'));
    if (raw.includes('b')) terms.add(greek.replace(/β/g, 'μπ'));
    if (raw.includes('d')) terms.add(greek.replace(/δ/g, 'ντ'));
    if (raw.includes('g')) terms.add(greek.replace(/γ/g, 'γκ'));
    if (raw.includes('c')) terms.add(greek.replace(/ψ/g, 'κ').replace(/τσ/g, 'κ'));
  } else {
    const grToLat = {
      'α':'a', 'β':'v', 'γ':'g', 'δ':'d', 'ε':'e', 'ζ':'z', 'η':'h', 'θ':'th',
      'ι':'i', 'κ':'k', 'λ':'l', 'μ':'m', 'ν':'n', 'ξ':'x', 'ο':'o', 'π':'p',
      'ρ':'r', 'σ':'s', 'ς':'s', 'τ':'t', 'υ':'y', 'φ':'f', 'χ':'x', 'ψ':'ps', 'ω':'o'
    };
    let latin = '';
    for (let i=0; i<raw.length; i++) {
      latin += grToLat[raw[i]] || raw[i];
    }
    terms.add(latin);
    
    if (raw.includes('χ')) {
      terms.add(latin.replace(/x/g, 'h'));
      terms.add(latin.replace(/x/g, 'ch'));
    }
    if (raw.includes('η')) terms.add(latin.replace(/h/g, 'i'));
    if (raw.includes('υ')) {
      terms.add(latin.replace(/y/g, 'u'));
      terms.add(latin.replace(/y/g, 'i'));
    }
    if (raw.includes('ω')) terms.add(latin.replace(/o/g, 'w'));
    if (raw.includes('β')) terms.add(latin.replace(/v/g, 'b'));
  }

  const expanded = new Set();
  for (const term of terms) {
    expanded.add(term);
    for (const group of SYNONYMS) {
      for (const syn of group) {
        if (term.includes(syn)) {
          for (const s of group) {
             expanded.add(term.replace(syn, s));
          }
        }
      }
    }
  }
  return Array.from(expanded);
}

const SORTS = [
  { id: "hot",        label: "🔥 Δημοφιλή" },
  { id: "expiring",   label: "Λήγουν σύντομα" },
  { id: "discount",   label: "Μεγαλύτερη έκπτωση" },
  { id: "price_asc",  label: "Τιμή: χαμηλή → υψηλή" },
  { id: "price_desc", label: "Τιμή: υψηλή → χαμηλή" },
  { id: "newest",     label: "Νεότερες" },
];

function sortDeals(deals, sortBy) {
  const copy = [...deals];
  if (sortBy === "hot") {
    copy.sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0));
  } else if (sortBy === "discount") {
    // Biggest provable deal first; among equal (incl. the ΜΟΝΟ rows with no
    // published %), cheapest first — a graspable order, never random.
    copy.sort((a, b) =>
      ((b.discountPercent ?? 0) - (a.discountPercent ?? 0))
      || ((a.discountedPrice ?? 0) - (b.discountedPrice ?? 0)));
  } else if (sortBy === "price_asc") {
    copy.sort((a, b) => (a.discountedPrice ?? 0) - (b.discountedPrice ?? 0));
  } else if (sortBy === "price_desc") {
    copy.sort((a, b) => (b.discountedPrice ?? 0) - (a.discountedPrice ?? 0));
  } else if (sortBy === "newest") {
    copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    copy.sort((a, b) => new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime());
  }
  return copy;
}

export default function SupermarketClient({ sm, initialDeals, totalCount, catalogCount, categoryTree, leaflet }) {
  const [viewMode, setViewMode] = useState("offers");
  // Default to biggest-discount-first: hotScore carries ranking jitter that
  // reads as "random order" to shoppers (owner complaint 2026-07-06).
  const [sortBy, setSortBy] = useState("discount");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  // Server-side results for searches: covers the full chain catalog (the
  // initialDeals prop is capped to top-500 best-discount items to keep the
  // RSC payload mobile-sized). Null = not searched yet; [] = empty result.
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { items: cart, addItem } = useShoppingListStore();

  // Debounced server search across the chain's full catalog.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults(null); setSearchLoading(false); return; }
    setSearchLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows = await searchDeals(q, sm.id);
        if (!cancelled) {
          const serialized = (rows || []).map((d) => ({
            ...d,
            validFrom: d.validFrom?.toISOString?.() ?? d.validFrom,
            validUntil: d.validUntil?.toISOString?.() ?? d.validUntil,
            createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
            updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
          }));
          setSearchResults(serialized);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery, sm.id]);

  // Per-department counts from the loaded deals — drives the dynamic grid so it
  // only shows departments this chain actually has. Based on initialDeals
  // (top-500 by hotScore); good enough to decide which tiles to show.
  const categoryCounts = useMemo(() => {
    const m = {};
    for (const d of initialDeals) if (d.category) m[d.category] = (m[d.category] || 0) + 1;
    return m;
  }, [initialDeals]);

  // Departments this chain actually stocks, in canonical order — drives the
  // filter sheet (empty departments would just dead-end).
  const chainCategories = useMemo(
    () => CATEGORIES.filter((c) => c.id !== "all" && (categoryCounts[c.id] || 0) > 0),
    [categoryCounts]
  );

  const filtered = useMemo(() => {
    // When the user is searching, render the server results (they cover the
    // full catalog, not just the top-500 initialDeals). Otherwise filter the
    // initial set by category and sort. dedupeDeals collapses the web+leaflet
    // rows of the same product into one card.
    const base = searchResults ?? initialDeals;
    const byCategory = activeCategory === "all"
      ? base
      : base.filter((d) => d.category === activeCategory);
    return dedupeDeals(sortDeals(byCategory, sortBy));
  }, [initialDeals, searchResults, activeCategory, sortBy]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(60); }, [activeCategory, searchQuery, sortBy]);

  const visibleDeals = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const initialPreviewCount = useMemo(() => dedupeDeals(initialDeals).length, [initialDeals]);
  const searching = searchQuery.trim().length >= 2;
  const showCategoryBrowser = viewMode === "categories" && !searching;
  const groupedView = viewMode === "offers"
    && activeCategory === "all"
    && searchQuery.trim().length < 2
    && searchResults === null;

  const biggestDiscount = useMemo(() => {
    return initialDeals.reduce((max, d) => Math.max(max, d.discountPercent ?? 0), 0);
  }, [initialDeals]);
  const hasMoreActiveOffers = (totalCount ?? initialPreviewCount) > initialPreviewCount;

  const switchView = (nextView) => {
    setViewMode(nextView);
    setActiveCategory("all");
    if (nextView === "categories") setSearchQuery("");
  };

  return (
    <div className="sm-page" style={{ "--brand": sm.color }}>

      <SiteHeader cartCount={cart.length} onCartOpen={() => setIsCartOpen(true)} />

      <section className="sm-hero">
        <div className="sm-hero-ornament" />
        <div className="sm-hero-inner">
          <Link href="/" className="sm-back-link">
            ← Πίσω στην αρχική
          </Link>

          <div className="sm-hero-brand-row">
            <div className="sm-logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/logos/${sm.logo || `${sm.id}.png`}`} alt={sm.name} />
            </div>
            <h1 className="sm-hero-title">Προσφορές {sm.name}</h1>
          </div>

          <div className="sm-hero-stats">
            <span>{(totalCount ?? initialDeals.length).toLocaleString("el-GR")} ενεργές προσφορές</span>
            {catalogCount > 0 && (
              <>
                <span className="dot">•</span>
                <span>{catalogCount.toLocaleString("el-GR")} προϊόντα συνολικά</span>
              </>
            )}
            {biggestDiscount > 0 && (
              <>
                <span className="dot">•</span>
                <span>έως -{biggestDiscount}%</span>
              </>
            )}
            {/* Admin-uploaded PDF when one is current, else the chain's own
                leaflet page (stable URL, always shows the running leaflet) —
                the admin Leaflet rows went stale and the link vanished. */}
            {(leaflet?.pdfUrl || sm.leafletUrl) && (
              <>
                <span className="dot">•</span>
                <a
                  href={leaflet?.pdfUrl || sm.leafletUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="sm-hero-leaflet"
                  onClick={() => {
                    track({
                      eventType: 'leaflet_click',
                      supermarket: sm.id,
                      leafletId: leaflet?.id,
                    });
                  }}
                >
                  📖 Δες το φυλλάδιο
                </a>
              </>
            )}
          </div>

          <div className="sm-hero-search">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Αναζήτησε στις προσφορές ${sm.name}...`}
            />
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 80px" }}>
        <div className="supermarket-view-tabs" aria-label="Τρόπος περιήγησης">
          <button
            type="button"
            className={viewMode === "offers" ? "active" : ""}
            onClick={() => switchView("offers")}
          >
            <span>🏷️</span>
            <span>
              <strong>Προσφορές</strong>
              <small>{initialPreviewCount.toLocaleString("el-GR")} επιλεγμένες</small>
            </span>
          </button>
          <button
            type="button"
            className={viewMode === "categories" ? "active" : ""}
            onClick={() => switchView("categories")}
          >
            <span>▦</span>
            <span>
              <strong>Κατηγορίες</strong>
              <small>Βρες αυτό που ψάχνεις</small>
            </span>
          </button>
        </div>

        {showCategoryBrowser ? (
          <SupermarketCategoryBrowser
            tree={categoryTree || []}
            supermarket={sm.id}
            onAdd={addItem}
            onSelect={setSelectedProduct}
          />
        ) : (
        <section>
          <div className="listing-head">
            <h2>
              {searching
                ? `Αποτελέσματα για «${searchQuery.trim()}»`
                : groupedView
                  ? "Προσφορές ανά κατηγορία"
                  : (activeCategory === "all" ? "Όλες οι προσφορές" : activeCategory)}
            </h2>
            <span className="count">
              {filtered.length.toLocaleString("el-GR")} {groupedView ? "επιλεγμένες προσφορές" : "προσφορές"}
            </span>
          </div>

          <div className="listing-toolbar">
            <button
              type="button"
              className="btn-filters"
              onClick={() => setIsFilterOpen(true)}
              aria-haspopup="dialog"
            >
              <Icon.Sort size={14} /> Φίλτρα
              {activeCategory !== "all" && <span className="badge">1</span>}
            </button>
            <label className="sort-select">
              <span>Ταξινόμηση:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Ταξινόμηση">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          {activeCategory !== "all" && (
            <div className="active-filters">
              <button type="button" className="af-chip" onClick={() => setActiveCategory("all")}>
                {activeCategory} <span className="x">×</span>
              </button>
            </div>
          )}

          {groupedView ? (
            <>
              <SupermarketAisles deals={filtered} onAdd={addItem} onSelect={setSelectedProduct} />
              {hasMoreActiveOffers && (
                <section className="supermarket-all-offers-cta">
                  <div>
                    <strong>Όλες οι {totalCount.toLocaleString("el-GR")} ενεργές προσφορές</strong>
                    <p>Εδώ βλέπεις μια επιλεγμένη ψηφιακή βιτρίνα. Οι Κατηγορίες έχουν όλο το τρέχον φυλλάδιο.</p>
                  </div>
                  <button type="button" onClick={() => switchView("categories")}>
                    Περιήγηση σε όλες
                  </button>
                </section>
              )}
            </>
          ) : (
            <DealGrid
              deals={visibleDeals}
              loading={searchLoading && searchResults === null}
              loadingMore={false}
              onAdd={addItem}
              onSelect={setSelectedProduct}
              emptyTitle={`Δεν βρέθηκαν προσφορές${activeCategory !== "all" ? ` στην κατηγορία "${activeCategory}"` : ""}`}
              emptyText="Δοκίμασε άλλη κατηγορία ή επίστρεψε αργότερα."
              onClearFilters={activeCategory !== "all" ? () => setActiveCategory("all") : null}
            />
          )}

          {!groupedView && visibleCount < filtered.length && (
            <div className="load-more-wrap">
              <button className="load-more-btn" onClick={() => setVisibleCount(prev => prev + 60)}>
                Φόρτωση περισσότερων ({filtered.length - visibleCount} υπολείπονται)
              </button>
            </div>
          )}

          {/* Bottom of the offers journey: the full-catalog door (owner ask
              2026-07-06 — after the offers, let people browse everything). */}
          {catalogCount > 0 && (
            <section className="supermarket-all-offers-cta">
              <div>
                <strong>Ολόκληρος ο κατάλογος {sm.name}</strong>
                <p>
                  Δες και τα {catalogCount.toLocaleString("el-GR")} προϊόντα που δεν είναι σε
                  προσφορά — με την τελευταία γνωστή τιμή ραφιού.
                </p>
              </div>
              <Link href={`/catalog?supermarket=${sm.id}`} className="cta-link">
                Άνοιγμα καταλόγου
              </Link>
            </section>
          )}
        </section>
        )}
      </main>

      <Footer />

      <Sheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Φίλτρα"
        footer={
          <>
            {activeCategory !== "all" && (
              <button type="button" className="btn btn-outline" onClick={() => setActiveCategory("all")}>
                Καθαρισμός
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setIsFilterOpen(false)}>
              Δες {filtered.length.toLocaleString("el-GR")} προσφορές
            </button>
          </>
        }
      >
        <div className="sheet-section">
          <div className="sheet-section-title">Κατηγορίες</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={`chip${activeCategory === "all" ? " active" : ""}`}
              onClick={() => setActiveCategory("all")}
            >
              Όλες
            </button>
            {chainCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${activeCategory === c.id ? " active" : ""}`}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.label} ({categoryCounts[c.id]})
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
