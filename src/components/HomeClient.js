'use client';

import { useState } from "react";
import Link from "next/link";
import { useShoppingListStore } from "@/lib/store";

import { ProductModal } from "@/components/ProductModal";
import { ShoppingList } from "@/components/ShoppingList";
import { PreferredStoresSheet } from "@/components/PreferredStoresSheet";
import { AdminPanel, AdminAuth } from "@/components/AdminPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { CategoryGrid } from "@/components/CategoryGrid";
import { SupermarketTiles } from "@/components/SupermarketTiles";
import { Icon } from "@/components/Icons";
import { Footer } from "@/components/Footer";
import { SUPERMARKETS } from "@/lib/constants";

function PublicSite({ initial, onAdmin }) {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { items: cart, addItem } = useShoppingListStore();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader
        onAdminTrigger={onAdmin}
        cartCount={cart.length}
        onCartOpen={() => setIsCartOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />

      <Hero
        search={search}
        onSearch={setSearch}
        onCancel={() => setSearch("")}
        totalCount={initial.total}
        supermarketCount={SUPERMARKETS.length}
        isSearching={false}
        deals={[]}
        onSelect={setSelectedProduct}
      />

      <main style={{ flex: 1 }}>
        <div className="container">
          <SupermarketTiles counts={initial.counts?.bySupermarket || {}} />

          <CategoryGrid asLinks counts={initial.counts?.byCategory || {}} />

          <section className="section-tight">
            <Link href="/deals" className="promo">
              <div>
                <div className="eyebrow">Όλες οι προσφορές</div>
                <h3>Περιήγηση σε {initial.total.toLocaleString("el-GR")} προσφορές</h3>
                <p>Φίλτραρε ανά σούπερ μάρκετ, κατηγορία ή τιμή</p>
              </div>
              <span className="btn btn-accent btn-lg">
                Δες όλες <Icon.ArrowRight size={16} />
              </span>
            </Link>
          </section>

          <FeaturedCarousel
            title="Κορυφαίες εκπτώσεις"
            sub="Τα μεγαλύτερα ποσοστά αυτή την εβδομάδα"
            deals={initial.topDeals}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            viewAllHref="/deals?sort=discount"
          />

          <FeaturedCarousel
            title="Τελειώνουν σύντομα"
            sub="Πρόλαβε πριν λήξουν"
            deals={initial.endingSoon}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            viewAllHref="/deals?sort=expiring"
          />
        </div>
      </main>

      <Footer />

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <PreferredStoresSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default function HomeClient({ initial, initiallyAdmin }) {
  const [screen, setScreen] = useState("public");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(initiallyAdmin);
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      {screen === "public" ? (
        <PublicSite
          initial={initial}
          onAdmin={() => (isAdminAuthenticated ? setScreen("admin") : setShowLogin(true))}
        />
      ) : (
        <AdminPanel onBack={() => { setScreen("public"); setIsAdminAuthenticated(false); }} />
      )}
      {showLogin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} onClick={() => setShowLogin(false)} />
          <div style={{ position: "relative" }}>
            <AdminAuth onAuth={() => { setIsAdminAuthenticated(true); setShowLogin(false); setScreen("admin"); }} />
          </div>
        </div>
      )}
    </>
  );
}
