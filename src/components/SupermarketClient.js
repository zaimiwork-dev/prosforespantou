'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useShoppingListStore } from "@/lib/store";
import { ProductModal } from "@/components/ProductModal";
import { ShoppingList } from "@/components/ShoppingList";
import { SiteHeader } from "@/components/SiteHeader";
import { DealGrid } from "@/components/DealGrid";
import { SortBar } from "@/components/SortBar";
import { CategoryGrid } from "@/components/CategoryGrid";
import { Footer } from "@/components/Footer";
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';

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

function sortDeals(deals, sortBy) {
  const copy = [...deals];
  if (sortBy === "discount") {
    copy.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
  } else if (sortBy === "newest") {
    copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    copy.sort((a, b) => new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime());
  }
  return copy;
}

export default function SupermarketClient({ sm, initialDeals, leaflet }) {
  const [sortBy, setSortBy] = useState("discount");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { items: cart, addItem } = useShoppingListStore();

  const filtered = useMemo(() => {
    let byCategory = activeCategory === "all"
      ? initialDeals
      : initialDeals.filter((d) => d.category === activeCategory);

    if (searchQuery.trim().length >= 2) {
      const expandedTerms = expandSearch(searchQuery);

      byCategory = byCategory.filter(d => {
         const name = d.productName ? d.productName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
         const desc = d.description ? d.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
         return expandedTerms.some(term => name.includes(term) || desc.includes(term));
      });
    }

    return sortDeals(byCategory, sortBy);
  }, [initialDeals, activeCategory, sortBy, searchQuery]);

  const biggestDiscount = useMemo(() => {
    return initialDeals.reduce((max, d) => Math.max(max, d.discountPercent ?? 0), 0);
  }, [initialDeals]);

  return (
    <div style={{ background: "#f3f5f8", color: "#1c1e24", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <SiteHeader cartCount={cart.length} onCartOpen={() => setIsCartOpen(true)} />

      <section
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${sm.color} 22%, #ffffff) 0%, color-mix(in srgb, ${sm.color} 45%, #ffffff) 100%)`,
          color: "#1c1e24",
          padding: "44px 20px 56px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -60, right: -40, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <Link
            href="/"
            style={{
              color: "rgba(28,30,36,0.75)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}
          >
            ← Πίσω στην αρχική
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 10, flexWrap: "wrap" }}>
            <div
              style={{
                width: 96,
                height: 96,
                background: "#fff",
                borderRadius: 18,
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                flex: "none",
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/logos/${sm.logo || `${sm.id}.png`}`}
                alt={sm.name}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
              />
            </div>
            <h1 style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 900, margin: 0, letterSpacing: "-1px", lineHeight: 1.05 }}>
              Προσφορές {sm.name}
            </h1>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, fontWeight: 700, color: "rgba(28,30,36,0.85)" }}>
            <span>{initialDeals.length} ενεργές</span>
            {biggestDiscount > 0 && (
              <>
                <span style={{ opacity: 0.35 }}>•</span>
                <span>έως -{biggestDiscount}%</span>
              </>
            )}
            {leaflet && leaflet.pdfUrl && (
              <>
                <span style={{ opacity: 0.35 }}>•</span>
                <a
                  href={leaflet.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    trackEvent({
                      eventType: 'leaflet_click',
                      supermarket: sm.id,
                      leafletId: leaflet.id,
                      sessionId: getSessionId(),
                    }).catch(() => {});
                  }}
                  style={{ color: sm.color, textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Δες το φυλλάδιο
                </a>
              </>
            )}
          </div>

          <div style={{ marginTop: 24, maxWidth: 600 }}>
            <div style={{ position: "relative", width: "100%" }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Αναζήτηση προσφορών ${sm.name}...`}
                style={{
                  width: "100%",
                  padding: "14px 16px 14px 44px",
                  borderRadius: 14,
                  border: "none",
                  background: "#fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  fontSize: 15,
                  outline: "none",
                  fontWeight: 500,
                  color: "#1c1e24",
                }}
              />
              <svg style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, color: "#8b929c" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 80px" }}>
        <CategoryGrid activeCategory={activeCategory} onSelect={setActiveCategory} />

        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: "-0.4px" }}>
              {activeCategory === "all" ? "Όλες οι προσφορές" : activeCategory}
            </h2>
          </div>

          <SortBar value={sortBy} onChange={setSortBy} totalCount={filtered.length} />

          <DealGrid
            deals={filtered}
            loading={false}
            loadingMore={false}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            emptyTitle={`Δεν βρέθηκαν προσφορές${activeCategory !== "all" ? ` στην κατηγορία "${activeCategory}"` : ""}`}
            emptyText="Δοκίμασε άλλη κατηγορία ή επίστρεψε αργότερα."
            onClearFilters={activeCategory !== "all" ? () => setActiveCategory("all") : null}
          />
        </section>
      </main>

      <Footer />

      {cart.length > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          aria-label="Άνοιγμα λίστας"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "linear-gradient(135deg, #009de0, #0077b6)",
            color: "#fff",
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            zIndex: 100,
            boxShadow: "0 10px 24px rgba(0,157,224,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          🛒
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#ff3b30",
              color: "#fff",
              minWidth: 22,
              height: 22,
              padding: "0 6px",
              borderRadius: 11,
              fontSize: 11,
              fontWeight: 900,
              border: "2px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {cart.length}
          </span>
        </button>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
