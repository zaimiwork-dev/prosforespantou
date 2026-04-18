'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShoppingListStore } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { DealGrid } from "@/components/DealGrid";
import { SearchDropdown } from "@/components/SearchDropdown";
import { ProductModal } from "@/components/ProductModal";
import { ShoppingList } from "@/components/ShoppingList";

export function SearchPage({ query, deals }) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(query);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { items: cart, addItem } = useShoppingListStore();

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && inputValue.trim().length >= 2) {
      router.push("/search?q=" + encodeURIComponent(inputValue.trim()));
    }
  };

  return (
    <div style={{ background: "#f3f5f8", color: "#1c1e24", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

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
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
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
            <SearchDropdown query={inputValue} deals={deals} onSelect={(d) => { if (d) setSelectedProduct(d); }} />
          </div>
          <button
            onClick={() => router.push("/")}
            style={{ background: "none", border: "none", color: "#009de0", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "0 4px", whiteSpace: "nowrap" }}
          >
            ΑΚΥΡΟ
          </button>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 80px" }}>
        <div style={{ marginBottom: 16, padding: "0 4px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.4px" }}>
            {query ? `Αποτελέσματα για "${query}"` : "Αναζήτηση"}
          </h1>
          {query && (
            <p style={{ fontSize: 13, color: "#8b929c", margin: 0, fontWeight: 500 }}>
              {deals.length === 0 ? "Δεν βρέθηκαν αποτελέσματα" : `${deals.length} προσφορές`}
            </p>
          )}
        </div>

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
      </main>

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
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}
        >
          🛒
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

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
