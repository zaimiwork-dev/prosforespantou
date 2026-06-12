'use client';

import { useState } from "react";
import Link from "next/link";
import { useShoppingListStore } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { ShoppingList } from "@/components/ShoppingList";
import { OfferDetails } from "@/components/OfferDetails";

// Thin shell: header + back link around the shared OfferDetails component.
// All offer content (image, price, dates, verdict, comparison) lives there,
// shared with the ProductSheet quick view.
export default function OfferClientContent({ offer, comparison = [], history = null, similar = [] }) {
  const { items, addItem } = useShoppingListStore();
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <div style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      <SiteHeader cartCount={items.length} onCartOpen={() => setIsCartOpen(true)} />

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 80px" }}>
        <Link
          href="/deals"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 13, fontWeight: 700, marginBottom: 16 }}
        >
          ← Πίσω στις προσφορές
        </Link>

        <OfferDetails offer={offer} comparison={comparison} history={history} similar={similar} onAdd={addItem} />
      </main>

      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
