'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useShoppingListStore } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { DealGrid } from "@/components/DealGrid";
import { ProductCard } from "@/components/ProductCard";
import { ProductSheet } from "@/components/ProductSheet";
import { ShoppingList } from "@/components/ShoppingList";
import { Footer } from "@/components/Footer";
import { track } from "@/lib/track";
import { Icon } from "@/components/Icons";

// Starting points for the empty search screen — the staples a Greek
// household actually hunts for, in the words shoppers type (no brands).
const SEARCH_STARTERS = [
  'γάλα', 'καφές', 'ελαιόλαδο', 'φέτα', 'απορρυπαντικό', 'χαρτί υγείας',
  'πάνες', 'ζυμαρικά', 'αναψυκτικά', 'μπύρα', 'σαμπουάν', 'κοτόπουλο',
];

export function SearchPage({ query, deals, catalogProducts = [] }) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(query);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { items: cart, addItem } = useShoppingListStore();

  // One `search` per query shown, with what the shopper got back. Zero-result
  // queries are the catalogue-gap list; low-result ones are matcher misses.
  const resultCount = deals.length + catalogProducts.length;
  useEffect(() => {
    if (!query) return;
    track({ eventType: 'search', page: 'search', query: query.slice(0, 200), resultCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim().length >= 2) {
      router.push("/search?q=" + encodeURIComponent(inputValue.trim()));
    }
  };

  return (
    <div style={{ background: "#f3f5f8", color: "#1c1e24", minHeight: "100vh", fontFamily: "var(--font-outfit), sans-serif" }}>

      <SiteHeader cartCount={cart.length} onCartOpen={() => setIsCartOpen(true)} />

      <div
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #ececf0",
          padding: "12px 16px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <form onSubmit={handleSubmit} style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              autoFocus
              type="search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Αναζήτηση προϊόντος..."
              style={{
                width: "100%",
                padding: "11px 16px 11px 42px",
                borderRadius: 12,
                border: "1px solid #ececf0",
                background: "#f6f7f9",
                fontSize: 15,
                outline: "none",
                fontWeight: 500,
              }}
            />
            <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, color: "#8b929c" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            style={{ background: "none", border: "none", color: "#009de0", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
          >
            ΑΚΥΡΟ
          </button>
        </form>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 80px" }}>
        <div style={{ marginBottom: 16, padding: "0 4px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.4px" }}>
            {query ? `Αποτελέσματα για "${query}"` : "Αναζήτηση"}
          </h1>
          {query && (
            <p style={{ fontSize: 13, color: "#8b929c", margin: 0, fontWeight: 500 }}>
              {deals.length === 0 ? "Δεν βρέθηκαν προσφορές" : `${deals.length} προσφορές`}
              {catalogProducts.length > 0 && ` · ${catalogProducts.length} από τους καταλόγους`}
            </p>
          )}
        </div>

        {/* The bottom-nav «Αναζήτηση» tab lands here with no query. Show a
            starting point instead of a "no results" message for nothing. */}
        {!query && (
          <div style={{ padding: "4px 4px 8px" }}>
            <p style={{ fontSize: 16, color: "#1c1e24", margin: "0 0 12px", fontWeight: 600 }}>
              Τι ψάχνεις σήμερα;
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {SEARCH_STARTERS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => router.push(`/search?q=${encodeURIComponent(term)}`)}
                  style={{
                    padding: "12px 16px", borderRadius: 999, border: "1px solid #ececf0",
                    background: "#fff", color: "#1c1e24", fontSize: 16, fontWeight: 600,
                    cursor: "pointer", minHeight: 48,
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {query && (deals.length > 0 || catalogProducts.length === 0) && (
          <DealGrid
            deals={deals}
            loading={false}
            loadingMore={false}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            emptyTitle={`Δεν βρέθηκαν προϊόντα για "${query}"`}
            emptyText="Δοκίμασε άλλη λέξη ή greeklish (π.χ. gala, tyri, kafes)."
            onClearFilters={null}
          />
        )}

        {catalogProducts.length > 0 && (
          <section style={{ marginTop: deals.length > 0 ? 28 : 0 }}>
            <div style={{ marginBottom: 12, padding: "0 4px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 2px", letterSpacing: "-0.3px" }}>
                Από τους καταλόγους
              </h2>
              <p style={{ fontSize: 12, color: "#8b929c", margin: 0, fontWeight: 500 }}>
                Δεν είναι σε προσφορά τώρα — τελευταία γνωστή τιμή ραφιού.
              </p>
            </div>
            <div className="products-grid">
              {catalogProducts.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />

      {cart.length > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          aria-label="Άνοιγμα λίστας"
          style={{
            position: "fixed", bottom: 20, right: 20,
            background: "linear-gradient(135deg, #009de0, #0077b6)",
            color: "#fff", width: 56, height: 56, borderRadius: "50%",
            border: "none", cursor: "pointer", zIndex: 100,
            boxShadow: "0 10px 24px rgba(0,157,224,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon.Bag size={24} />
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#ff3b30", color: "#fff", minWidth: 22, height: 22,
            padding: "0 6px", borderRadius: 11, fontSize: 11, fontWeight: 900,
            border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {cart.length}
          </span>
        </button>
      )}

      <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
