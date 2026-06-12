'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useShoppingListStore } from "@/lib/store";
import { getActiveDeals } from "@/actions/get-active-deals";
import { dedupeDeals } from "@/lib/dedupe-deals";
import { loadProfile, decayProfile, topCategories, scoreOffer } from "@/lib/interest-profile";

import { ProductSheet } from "@/components/ProductSheet";
import { ShoppingList } from "@/components/ShoppingList";
import { PreferredStoresSheet } from "@/components/PreferredStoresSheet";

// Admin tooling is ~1k lines that 99.9% of visitors never open — load it only
// when the (hidden) admin trigger fires, keeping it out of the public bundle.
const AdminPanel = dynamic(() => import("@/components/AdminPanel").then((m) => m.AdminPanel), { ssr: false });
const AdminAuth = dynamic(() => import("@/components/AdminPanel").then((m) => m.AdminAuth), { ssr: false });
import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { FavoritesRow } from "@/components/FavoritesRow";
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
  const { items: cart, addItem, preferredStores, preferredCategories } = useShoppingListStore();

  // First visit → open the preferences sheet as onboarding (once; the flag
  // sets on close however it ends). 11k offers with no steer overwhelms a new
  // user — two stores + four categories in, the page is suddenly about THEM.
  const [introMode, setIntroMode] = useState(false);
  useEffect(() => {
    let opened = false;
    try { opened = !!window.localStorage.getItem("pp-onboarded"); } catch { opened = true; }
    if (opened) return;
    const t = setTimeout(() => { setIntroMode(true); setIsSettingsOpen(true); }, 700);
    return () => clearTimeout(t);
  }, []);
  const closeSettings = () => {
    setIsSettingsOpen(false);
    setIntroMode(false);
    try { window.localStorage.setItem("pp-onboarded", "1"); } catch { /* private mode */ }
  };

  // "Τα καταστήματά μου" must shape the WHOLE app, not just /deals — the user
  // sets it from this page's header, so carousels that ignore it read as
  // broken. With a selection we refetch both rails filtered; without one the
  // server-rendered lists stand.
  const [filtered, setFiltered] = useState(null);
  const prefKey = preferredStores.join(",");
  useEffect(() => {
    if (!prefKey) { setFiltered(null); return; }
    let cancelled = false;
    Promise.all([
      getActiveDeals(16, 0, "all", "all", "hot", preferredStores),
      getActiveDeals(12, 0, "all", "all", "expiring", preferredStores),
    ])
      .then(([top, ending]) => {
        if (cancelled) return;
        setFiltered({ topDeals: dedupeDeals(top.deals), endingSoon: dedupeDeals(ending.deals) });
      })
      .catch(() => { if (!cancelled) setFiltered(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);

  const topDeals = filtered?.topDeals?.length ? filtered.topDeals : initial.topDeals;
  const endingSoon = filtered?.endingSoon?.length ? filtered.endingSoon : initial.endingSoon;
  const storesFiltered = Boolean(prefKey && filtered);

  // "✨ Για σένα" — the v1 recommender: declared categories (onboarding) +
  // learned ones (on-device interest profile, see lib/interest-profile) fetch
  // one hot-ranked pool, then personal relevance re-ranks it. Stable sort
  // keeps hotScore order inside equal-relevance groups. No prefs and no
  // history → no rail (never fake personalization).
  const [forYou, setForYou] = useState(null);
  const prefCatKey = preferredCategories.join(",");
  useEffect(() => {
    const profile = decayProfile(loadProfile(), Date.now());
    const cats = [...new Set([...preferredCategories, ...topCategories(profile, 3)])].slice(0, 6);
    if (cats.length === 0) return;
    let cancelled = false;
    getActiveDeals(30, 0, "all", cats, "hot", preferredStores)
      .then(({ deals }) => {
        if (cancelled) return;
        const ranked = dedupeDeals(deals)
          .map((d) => ({ d, s: scoreOffer(d, profile, preferredCategories) }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.d)
          .slice(0, 14);
        setForYou(ranked);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefCatKey, prefKey, isSettingsOpen]);

  // Count only chains that actually have live offers — advertising "10
  // αλυσίδες" while 5 are empty undermines the honest-data positioning.
  const liveChainCount = Object.values(initial.counts?.bySupermarket || {}).filter((n) => n > 0).length
    || SUPERMARKETS.length;

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
        supermarketCount={liveChainCount}
        isSearching={false}
        deals={[]}
        onSelect={setSelectedProduct}
      />

      <main style={{ flex: 1 }}>
        <div className="container">
          {/* Deals first — a shopper opening the app daily should see savings
              before navigation. Browsing by store/category moves below. The
              user's own watchlist outranks everything when it has live hits. */}
          <FavoritesRow onAdd={addItem} onSelect={setSelectedProduct} />

          {forYou?.length > 0 && (
            <FeaturedCarousel
              title="✨ Για σένα"
              sub="Με βάση όσα σε ενδιαφέρουν"
              deals={forYou}
              onAdd={addItem}
              onSelect={setSelectedProduct}
              viewAllHref="/deals"
            />
          )}

          <FeaturedCarousel
            title="Κορυφαίες προσφορές"
            sub={storesFiltered ? "Από τα καταστήματά σου" : "Ξεχωρίζουν αυτή την εβδομάδα"}
            deals={topDeals}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            viewAllHref="/deals"
            rows={2}
          />

          <FeaturedCarousel
            title="Τελειώνουν σύντομα"
            sub={storesFiltered ? "Από τα καταστήματά σου" : "Πρόλαβε πριν λήξουν"}
            deals={endingSoon}
            onAdd={addItem}
            onSelect={setSelectedProduct}
            viewAllHref="/deals?sort=expiring"
          />

          <section className="section-tight">
            <Link href="/deals" className="promo">
              <div>
                <div className="eyebrow">Όλες οι προσφορές</div>
                <h3>Περιήγηση σε {initial.total.toLocaleString("el-GR")} προσφορές</h3>
                <p>Φίλτραρε ανά κατάστημα, κατηγορία ή τιμή</p>
              </div>
              <span className="btn btn-accent btn-lg">
                Δες όλες <Icon.ArrowRight size={16} />
              </span>
            </Link>
          </section>

          <CategoryGrid asLinks counts={initial.counts?.byCategory || {}} />

          <SupermarketTiles counts={initial.counts?.bySupermarket || {}} />
        </div>
      </main>

      <Footer />

      <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addItem} />
      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <PreferredStoresSheet isOpen={isSettingsOpen} onClose={closeSettings} intro={introMode} />
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
