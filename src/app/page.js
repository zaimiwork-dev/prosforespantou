'use client';

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { verifyAdminPassword } from "@/actions/verify-admin";
import { searchDeals } from "@/actions/search-deals";
import { useShoppingListStore } from "@/lib/store";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY; // Kept private, will be undefined on client as intended

const SUPERMARKETS = [
  { id: "ab", name: "AB Vassilopoulos", short: "AB", color: "#E63946", bg: "#fff0f0", heroLabel: "AB", heroSub: "Vassilopoulos" },
  { id: "sklavenitis", name: "Σκλαβενίτης", short: "ΣΚ", color: "#1D3557", bg: "#f0f3ff", heroLabel: "Σκλαβε-", heroSub: "νίτης" },
  { id: "lidl", name: "Lidl", short: "LI", color: "#0050AA", bg: "#f0f5ff", heroLabel: "Lidl", heroSub: "" },
  { id: "mymarket", name: "My Market", short: "MM", color: "#e07b00", bg: "#fff7ed", heroLabel: "My", heroSub: "Market" },
  { id: "masoutis", name: "Μασούτης", short: "ΜΑ", color: "#2d6a4f", bg: "#f0fff4", heroLabel: "Μασού-", heroSub: "της" },
  { id: "bazaar", name: "Bazaar", short: "BZ", color: "#7b2d8b", bg: "#fdf0ff", heroLabel: "Bazaar", heroSub: "" },
  { id: "kritikos", name: "Κρητικός", short: "ΚΡ", color: "#e85d04", bg: "#fff4ed", heroLabel: "Κρητι-", heroSub: "κός" },
  { id: "marketin", name: "Market In", short: "MI", color: "#606c38", bg: "#f4f7ed", heroLabel: "Market", heroSub: "In" },
];

const HERO_SUPERMARKETS = SUPERMARKETS.slice(0, 4);

const CATEGORIES = [
  { id: "all", label: "Όλες" },
  { id: "Κρέας & Ψάρι", label: "Κρέας & Ψάρι" },
  { id: "Γαλακτοκομικά", label: "Γαλακτοκομικά" },
  { id: "Φρούτα & Λαχανικά", label: "Φρούτα & Λαχ." },
  { id: "Αρτοποιία", label: "Αρτοποιία" },
  { id: "Κατεψυγμένα", label: "Κατεψυγμένα" },
  { id: "Ροφήματα", label: "Ροφήματα" },
  { id: "Σνακ & Γλυκά", label: "Σνακ & Γλυκά" },
  { id: "Είδη Καθαριότητας", label: "Καθαριότητα" },
  { id: "Προσωπική Φροντίδα", label: "Προσωπική Φρ." },
  { id: "Άλλο", label: "Άλλο" },
];

function CategoryIcon({ id, className = "w-5 h-5" }) {
  const icons = {
    all: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>,
    "Κρέας & Ψάρι": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-4.625 3.353 3.75 3.75 0 0 0 4.13 4.115Z" /></svg>,
    "Γαλακτοκομικά": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v1.607a2 2 0 0 1-.778 1.584l-1.197.911a2 2 0 0 0-.775 1.582v4.849a2 2 0 0 0 .775 1.582l1.197.911a2 2 0 0 1 .778 1.584v1.607m1.2-17.92 2.147 2.146a2.12 2.12 0 0 1 0 2.999l-2.147 2.146M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>,
    "Φρούτα & Λαχανικά": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.25-1.591 1.591M3 12h2.25m.386-6.364 1.591 1.591M12 18.75V21m-4.773-4.25-1.591 1.591M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" /></svg>,
    "Αρτοποιία": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" /></svg>,
    "Κατεψυγμένα": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3m15.364-6.364L5.636 18.364m12.728 0L5.636 5.636" /></svg>,
    "Ροφήματα": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v1.607a2 2 0 0 1-.778 1.584l-1.197.911a2 2 0 0 0-.775 1.582v4.849a2 2 0 0 0 .775 1.582l1.197.911a2 2 0 0 1 .778 1.584v1.607m1.2-17.92 2.147 2.146a2.12 2.12 0 0 1 0 2.999l-2.147 2.146M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>,
    "Σνακ & Γλυκά": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345l2.125-5.11Z" /></svg>,
    "Είδη Καθαριότητας": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.456-2.455L18 2.25l.259 1.036a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>,
    "Προσωπική Φροντίδα": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>,
    "Άλλο": <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>,
  };
  return icons[id] || icons.all;
}

// Converts both Greek text AND greeklish input to the same latin base
// so "μπανάνα", "μπανανα", "banana", "mpanana" all match each other
const GREEK_TO_LATIN = [
  ["μπ","b"],["ντ","d"],["γκ","g"],["τσ","ts"],["τζ","tz"],
  ["α","a"],["β","v"],["γ","g"],["δ","d"],["ε","e"],["ζ","z"],
  ["η","i"],["θ","th"],["ι","i"],["κ","k"],["λ","l"],["μ","m"],
  ["ν","n"],["ξ","x"],["ο","o"],["π","p"],["ρ","r"],["σ","s"],
  ["ς","s"],["τ","t"],["υ","y"],["φ","f"],["χ","ch"],["ψ","ps"],["ω","o"],
];

const GREEKLISH_TO_LATIN = [
  ["mp","b"],["nt","d"],["gk","g"],["th","8"],["ch","x2"],["ps","ps"],
];

const normalize = (s) => {
  let base = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [gr, en] of GREEK_TO_LATIN) base = base.split(gr).join(en);
  for (const [gl, en] of GREEKLISH_TO_LATIN) base = base.split(gl).join(en);
  return base;
};

const supabase = {
  async query(table, options = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    const params = ["select=*"];
    if (options.eq) Object.entries(options.eq).forEach(([k, v]) => params.push(`${k}=eq.${v}`));
    if (options.order) params.push(`order=${options.order}`);
    url += params.join("&");
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async delete(table, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  },
};

const G = {
  bg: "#f7f8fa", card: "#ffffff", border: "#e8eaed", text: "#1a1a2e",
  muted: "#6b7280", accent: "#e63946", accentLight: "#fff0f0",
  radius: 14, shadow: "0 2px 12px rgba(0,0,0,0.07)", shadowHover: "0 8px 28px rgba(0,0,0,0.13)",
};

function SupermarketBadge({ sm }) {
  return (
    <div style={{ background: sm.color, borderRadius: 12, padding: "8px 14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 70, flexShrink: 0 }}>
      <span style={{ color: "#fff", fontWeight: 900, fontSize: 15, lineHeight: 1.1, letterSpacing: -0.3 }}>{sm.heroLabel}</span>
      {sm.heroSub && <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700, fontSize: 11, lineHeight: 1.1 }}>{sm.heroSub}</span>}
    </div>
  );
}

function DiscountCard({ d, onAdd }) {
  const sm = SUPERMARKETS.find((s) => s.id === d.supermarket) || { name: d.supermarket, color: "#888", bg: "#f5f5f5", short: "??" };
  const pct = d.discount_percent || (d.original_price && d.discounted_price ? Math.round((1 - d.discounted_price / d.original_price) * 100) : null);
  
  const getDaysLeft = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expDate = new Date(dateStr); expDate.setHours(0, 0, 0, 0);
    return Math.round((expDate - today) / 86400000);
  };
  const daysLeft = getDaysLeft(d.valid_until);

  return (
    <div className="group bg-[#1c1e24] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/30 flex flex-col h-full border border-white/5">
      {/* Image Area (Aspect 4:3) */}
      <div className="relative aspect-[4/3] bg-[#2a2a2a] overflow-hidden flex items-center justify-center">
        {d.image_url ? (
          <img 
            src={d.image_url} 
            alt={d.product_name} 
            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-500" 
          />
        ) : (
          <div className="text-slate-400 opacity-80">
            <CategoryIcon id={d.category} className="w-12 h-12 md:w-16 md:h-16" />
          </div>
        )}
        
        {/* Soft + Button */}
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onAdd(d);
          }}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-medium hover:bg-blue-500 hover:text-white transition-colors border border-blue-500/20 z-10"
        >
          <span className="text-xl font-medium">+</span>
        </button>

        {/* Supermarket Badge Overlay */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <div 
            className="px-1.5 py-0.5 rounded text-[9px] font-black text-white shadow-sm"
            style={{ backgroundColor: sm.color }}
          >
            {sm.short}
          </div>
          {pct && (
            <div className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">
              -{pct}%
            </div>
          )}
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1">
        {/* Product Title at top */}
        <h3 className="text-slate-100 font-medium text-sm leading-tight line-clamp-2 mb-2">
          {d.product_name}
        </h3>

        {/* Category & Expiry mid-section */}
        <div className="flex flex-col gap-1 mb-auto">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            {d.category}
          </div>
          {daysLeft !== null && (
            <div className={`text-[10px] font-bold flex items-center gap-1 ${
              daysLeft <= 2 ? (daysLeft < 0 ? 'text-gray-300' : 'text-red-500') : 'text-gray-400'
            }`}>
              {daysLeft < 0 ? "ΕΛΗΞΕ" : daysLeft === 0 ? "ΛΗΓΕΙ ΣΗΜΕΡΑ" : daysLeft === 1 ? "ΛΗΓΕΙ ΑΥΡΙΟ" : `${daysLeft} ΗΜΕΡΕΣ`}
            </div>
          )}
        </div>

        {/* Prices at bottom */}
        <div className="mt-3 flex items-center gap-2">
          {d.discounted_price && (
            <span className="text-lg font-bold text-white tracking-tight">
              €{Number(d.discounted_price).toFixed(2)}
            </span>
          )}
          {d.original_price && (
            <span className="text-gray-400 text-xs line-through font-medium">
              €{Number(d.original_price).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicSite({ onAdmin, isAdmin }) {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "");
  const [activeSM, setActiveSM] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { items: cart, addItem: addItemToStore, removeItem: removeFromStore, decreaseItem, clearList } = useShoppingListStore();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [lastAddedId, setLastAddedId] = useState(null);

  const addItemToCart = (product) => {
    addItemToStore(product);
    setShowToast(true);
    setLastAddedId(Date.now());
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleShare = () => {
    const shareData = {
      title: "Προσφορές Παντού",
      text: "Δες όλες τις προσφορές των σούπερ μάρκετ σε ένα μέρος!",
      url: window.location.origin
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareData.url);
      alert("Ο σύνδεσμος αντιγράφηκε!");
    }
  };

  const handleSearch = (val) => {
    setSearch(val);
    const url = new URL(window.location);
    if (val) url.searchParams.set("q", val);
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
  };

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      const url = new URL(window.location);
      if (search.trim()) url.searchParams.set("q", search.trim());
      else url.searchParams.delete("q");
      window.history.pushState({}, "", url);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (search.trim()) {
        const results = await searchDeals(search);
        setDiscounts(results);
      } else {
        const data = await supabase.query("discounts", { eq: { is_active: true }, order: "created_at.desc" });
        setDiscounts(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const filtered = discounts.filter((d) => {
    const smId = d.supermarket || d.supermarket_id;
    const matchSM = activeSM === "all" || smId === activeSM;
    const matchCat = activeCategory === "all" || d.category === activeCategory;
    return matchSM && matchCat;
  });

  const counts = {};
  SUPERMARKETS.forEach((sm) => { counts[sm.id] = discounts.filter((d) => d.supermarket === sm.id).length; });

  return (
    <div className="bg-[#0f1115] text-slate-200 min-h-screen font-sans">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Modern Hero Header Section */}
      <header className="bg-[#0f1115] border-b border-white/5 mb-8 pt-10 pb-8 px-4 relative">

        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <div className="mb-4 cursor-default select-none" onDoubleClick={onAdmin}>
            <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              🏷️ Προσφορές Παντού
            </span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-black text-white mb-8 tracking-tight text-center leading-tight">
            Όλες οι Προσφορές <span className="text-blue-400 font-extrabold italic">σε Ένα Μέρος</span>
          </h1>

          <div className="w-full max-w-xl mx-auto flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </span>
              <input 
                value={search} 
                onChange={(e) => handleSearch(e.target.value)} 
                onKeyDown={handleEnter}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Ψάξε προϊόν... γάλα, κοτόπουλο, τυρί"
                className="w-full pl-12 pr-6 py-4 bg-[#1c1e24] text-white placeholder-slate-400 border border-white/5 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
            <button 
              onClick={handleShare}
              className="p-3 rounded-xl bg-[#1c1e24] text-slate-300 border border-white/5 hover:bg-[#2a2d35] transition-colors flex items-center justify-center shadow-sm group"
              title="Κοινοποίηση"
            >
              <span className="group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
              </span>
            </button>
          </div>

          {isAdmin && (
            <div className="w-full max-w-lg mt-8">
              <AdminUpload />
            </div>
          )}
        </div>
      </header>

      {/* Sticky Category Navigation */}
      <nav className="sticky top-0 z-40 bg-[#0f1115]/90 backdrop-blur-md border-b border-white/5 py-3 mb-8">
        <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto px-4 no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {CATEGORIES.map((c) => (
            <button 
              key={c.id} 
              onClick={() => setActiveCategory(c.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
                activeCategory === c.id 
                  ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-900/30 border-blue-600' 
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border-white/5 transition-colors duration-200'
              }`}
            >
              <CategoryIcon id={c.id} className="w-4 h-4" />
              {c.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 pb-20">
        <div className="flex flex-wrap gap-2 mb-8 items-center">
          <button onClick={() => setActiveSM("all")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              activeSM === "all" ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-900/30 border-blue-600' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border-white/5 transition-colors duration-200'
            }`}>
            Όλα
          </button>
          {SUPERMARKETS.map((sm) => (
            <button key={sm.id} onClick={() => setActiveSM(sm.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
                activeSM === sm.id ? 'text-white font-medium shadow-md shadow-blue-900/30' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border-white/5 transition-colors duration-200'
              }`}
              style={activeSM === sm.id ? { backgroundColor: sm.color, borderColor: sm.color } : {}}>
              {sm.name}
              {counts[sm.id] > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeSM === sm.id ? 'bg-white/20' : 'bg-gray-100'}`}>{counts[sm.id]}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl aspect-[4/5] border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm mt-8">
            <div className="text-6xl mb-4 flex justify-center text-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-20 h-20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              {search ? `Δεν βρέθηκε "${search}"` : "Δεν υπάρχουν προσφορές ακόμα"}
            </h3>
            <p className="text-gray-500">
              {search ? "Δοκίμασε διαφορετικό όρο" : "Πρόσθεσε από το Admin panel"}
            </p>
          </div>
        ) : (
          <>
            <div className="text-gray-400 text-xs mb-6 font-bold flex items-center gap-2 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <strong className="text-gray-700">{filtered.length}</strong> προσφορές διαθέσιμες
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map((d) => (
                <div key={d.id} onClick={() => setSelectedProduct(d)}>
                  <DiscountCard d={d} onAdd={addItemToCart} />
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Floating Cart Button */}
      <button 
        onClick={() => setIsCartOpen(true)}
        className={`fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/40 hover:scale-105 transition-transform duration-300 p-4 rounded-full active:scale-95 group ${
          lastAddedId ? 'animate-[bounce_0.4s_ease-in-out]' : ''
        }`}
        key={lastAddedId}
      >
        <span className="text-2xl">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        </span>
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-in zoom-in">
            {cart.length}
          </span>
        )}
      </button>

      {/* Toast Notification */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] pointer-events-none transition-all duration-500 ease-out ${
        showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        <div className="bg-gray-900/95 backdrop-blur-md text-white px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
          <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">✓</span>
          <span className="text-sm font-semibold tracking-wide">Προστέθηκε στη λίστα</span>
        </div>
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div 
            className="bg-white max-w-lg w-full rounded-3xl overflow-hidden relative shadow-2xl animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/80 backdrop-blur-md hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-colors z-10 text-gray-800 text-xl font-bold"
            >
              ×
            </button>

            {/* Modal Image Section */}
            <div className="aspect-video bg-slate-50 flex items-center justify-center relative border-b border-gray-100">
              {selectedProduct.image_url ? (
                <img 
                  src={selectedProduct.image_url} 
                  alt={selectedProduct.product_name} 
                  className="w-full h-full object-contain p-8"
                />
              ) : (
                <div className="text-slate-300">
                  <CategoryIcon id={selectedProduct.category} className="w-20 h-20" />
                </div>
              )}
              
              {/* Supermarket Badge Overlay in Modal */}
              <div className="absolute bottom-4 left-6">
                <div 
                  className="px-3 py-1 rounded-lg text-xs font-black text-white shadow-lg inline-block"
                  style={{ backgroundColor: (SUPERMARKETS.find(s => s.id === selectedProduct.supermarket) || {}).color || '#888' }}
                >
                  {(SUPERMARKETS.find(s => s.id === selectedProduct.supermarket) || {}).name}
                </div>
              </div>
            </div>

            {/* Modal Content Section */}
            <div className="p-8">
              <div className="mb-6">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <CategoryIcon id={selectedProduct.category} className="w-4 h-4" />
                  {selectedProduct.category}
                </div>
                <h2 className="text-2xl font-black text-gray-900 leading-tight mb-2">
                  {selectedProduct.product_name}
                </h2>
                <p className="text-sm text-gray-500 mt-3 mb-4 leading-relaxed">
                  Εδώ θα μπει η αναλυτική περιγραφή του προϊόντος. Ιδανικό για συστατικά, βάρος, ή όρους της προσφοράς.
                </p>
                {selectedProduct.description && (
                  <p className="text-gray-500 text-sm leading-relaxed mb-4 italic border-l-2 border-blue-100 pl-3">
                    {selectedProduct.description}
                  </p>
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-auto">
                <div className="flex flex-col">
                  {selectedProduct.original_price && (
                    <span className="text-gray-400 text-sm line-through font-medium mb-1">
                      €{Number(selectedProduct.original_price).toFixed(2)}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 font-black text-3xl tracking-tighter">
                      €{Number(selectedProduct.discounted_price).toFixed(2)}
                    </span>
                    {selectedProduct.discount_percent && (
                      <span className="bg-red-50 text-red-600 text-xs font-black px-2 py-1 rounded-md">
                        -{selectedProduct.discount_percent}%
                      </span>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => { 
                    addItemToCart(selectedProduct);
                    setSelectedProduct(null); 
                  }}
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 hover:shadow-blue-300 transition-all active:scale-95"
                >
                  Προσθήκη στη Λίστα
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sidebar */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] transition-all"
          onClick={() => setIsCartOpen(false)}
        >
          <div 
            className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cart Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                <h2 className="text-xl font-black text-gray-900">Η Λίστα μου</h2>
                <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                  {cart.length}
                </span>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="w-10 h-10 bg-gray-50 text-gray-500 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Cart Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                  <div className="text-6xl mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                  </div>
                  <p className="font-bold text-gray-900">Η λίστα σου είναι άδεια</p>
                  <p className="text-sm">Πρόσθεσε προσφορές για να τις έχεις μαζί σου στο σούπερ μάρκετ!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item, idx) => {
                    const itemSm = SUPERMARKETS.find(s => s.id === (item.supermarket || item.supermarket_id));
                    const price = Number(item.discountedPrice || item.discounted_price);
                    const qty = item.quantity || 1;

                    return (
                      <div key={`${item.id}-${idx}`} className="flex items-center gap-4 p-3 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-50">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-full h-full object-contain p-1" />
                          ) : (
                            <div className="text-slate-300">
                              <CategoryIcon id={item.category} className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 truncate">{item.productName || item.product_name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: itemSm?.color }}>
                              {itemSm?.short}
                            </span>
                            <span className="text-xs text-red-600 font-bold">€{(price * qty).toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
                          <button 
                            onClick={() => decreaseItem(item.id)}
                            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-red-500 hover:border-red-100 transition-colors shadow-sm font-bold"
                          >
                            -
                          </button>
                          <span className="text-sm font-black text-gray-900 min-w-[20px] text-center">{qty}</span>
                          <button 
                            onClick={() => addItemToStore(item)}
                            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-blue-500 hover:border-blue-100 transition-colors shadow-sm font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="p-6 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-500 font-bold uppercase text-xs tracking-wider">Σύνολο Λίστας</span>
                  <span className="text-xl font-black text-gray-900">
                    €{cart.reduce((sum, item) => sum + (Number(item.discountedPrice || item.discounted_price) * (item.quantity || 1)), 0).toFixed(2)}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    const total = cart.reduce((sum, item) => sum + (Number(item.discountedPrice || item.discounted_price) * (item.quantity || 1)), 0).toFixed(2);
                    const itemsText = cart.map(item => {
                      const sm = SUPERMARKETS.find(s => s.id === (item.supermarket || item.supermarket_id));
                      const name = item.productName || item.product_name;
                      const qty = item.quantity || 1;
                      const price = (Number(item.discountedPrice || item.discounted_price) * qty).toFixed(2);
                      return `• ${qty}x ${name} (${sm?.name || 'Σούπερ Μάρκετ'}) - ${price}€`;
                    }).join('\n');

                    const shareText = `ΠΡΟΣΦΟΡΕΣ ΠΑΝΤΟΥ - Η Λίστα Μου\n\n${itemsText}\n\nΣΥΝΟΛΙΚΟ ΚΟΣΤΟΣ: ${total}€`;

                    navigator.clipboard.writeText(shareText);

                    // Visual Feedback
                    const btn = document.getElementById('share-btn');
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✅ Αντιγράφηκε!';
                    btn.classList.add('bg-green-600');
                    btn.classList.remove('bg-blue-600');

                    setTimeout(() => {
                      btn.innerHTML = originalText;
                      btn.classList.remove('bg-green-600');
                      btn.classList.add('bg-blue-600');
                    }, 2000);
                  }}
                  id="share-btn"
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                  Αντιγραφή Λίστας
                </button>
              </div>
            )}          </div>
        </div>
      )}

      <footer className="border-t border-gray-200 bg-white mt-20 py-10 px-4 text-center">
        <div className="font-black text-lg text-gray-800 mb-2">🏷️ Προσφορές <span className="text-blue-600">Παντού</span></div>
        <p className="text-gray-500 text-sm italic">Όλες οι προσφορές των σούπερ μάρκετ σε ένα μέρος</p>
      </footer>
    </div>
  );
}

function AdminPanel({ onBack }) {
  const [discounts, setDiscounts] = useState([]);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState({ supermarket: "ab", product_name: "", category: "Άλλο", original_price: "", discounted_price: "", discount_percent: "", description: "", valid_from: "", valid_until: "", image_url: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiImage, setAiImage] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [search, setSearch] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "");

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAiImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const load = async () => {
    const data = await supabase.query("discounts", { order: "created_at.desc" });
    setDiscounts(Array.isArray(data) ? data : []);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (text, type = "success") => { setMsg({ text, type }); setTimeout(() => setMsg({ text: "", type: "" }), 3500); };

  const saveDiscount = async () => {
    if (!form.product_name.trim()) { showMsg("Συμπλήρωσε το όνομα προϊόντος.", "error"); return; }
    setSaving(true);
    const payload = { ...form, original_price: form.original_price || null, discounted_price: form.discounted_price || null, discount_percent: form.discount_percent || null, valid_from: form.valid_from || null, valid_until: form.valid_until || null };
    await supabase.insert("discounts", payload);
    showMsg("✓ Η προσφορά αποθηκεύτηκε!");
    setForm({ supermarket: "ab", product_name: "", category: "Άλλο", original_price: "", discounted_price: "", discount_percent: "", description: "", valid_from: "", valid_until: "", image_url: "", is_active: true });
    setSaving(false);
    load();
  };

  const toggleActive = async (d) => { await supabase.update("discounts", d.id, { is_active: !d.is_active }); load(); };
  const deleteDiscount = async (id) => { if (!window.confirm("Να διαγραφεί;")) return; await supabase.delete("discounts", id); load(); showMsg("Διαγράφηκε."); };

  const cropImage = (srcBase64, box) => {
    return new Promise((resolve) => {
      if (!box || typeof box !== 'object') return resolve(null);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const { x, y, width, height } = box;
        
        // Convert normalized (0-1000) coordinates to actual pixels
        const pX = (x / 1000) * img.width;
        const pY = (y / 1000) * img.height;
        const pW = (width / 1000) * img.width;
        const pH = (height / 1000) * img.height;
        
        canvas.width = pW; canvas.height = pH;
        ctx.drawImage(img, pX, pY, pW, pH, 0, 0, pW, pH);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = srcBase64;
    });
  };

  const runAI = async () => {
    if (!aiText.trim() && !aiImage) return;
    setAiLoading(true); setAiResult(null);
    try {
      const prompt = `You are a Greek supermarket discount extractor. Analyze the provided image or text and return ONLY a JSON array of deals found.
      
      Strict JSON Format:
      - productName (Greek)
      - discountedPrice (number, float e.g. 1.50, NO currency symbols)
      - originalPrice (number or null)
      - category (one of: Κρέας & Ψάρι, Γαλακτοκομικά, Φρούτα & Λαχανικά, Αρτοποιία, Κατεψυγμένα, Ροφήματα, Σνακ & Γλυκά, Είδη Καθαριότητας, Προσωπική Φροντίδα, Άλλο)
      - boundingBox (object: {x, y, width, height}, normalized 0-1000, representing the product image location. If no image, return null)
      - supermarket (one of: ab, sklavenitis, lidl, mymarket, masoutis, bazaar, kritikos, marketin)
      - description (string or null)
      - discountPercent (integer or null)
      
      ${aiText ? "Input text: " + aiText : ""}`;

      const messageContent = [{ type: "text", text: prompt }];
      if (aiImage) messageContent.push({ type: "image_url", image_url: { url: aiImage } });

      const res = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{ role: "user", content: messageContent }],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      
      let validatedArray = json.data;
      
      if (aiImage) {
        validatedArray = await Promise.all(validatedArray.map(async (item) => {
          if (item.boundingBox) {
            const cropped = await cropImage(aiImage, item.boundingBox);
            return { ...item, extractedImage: cropped };
          }
          return { ...item, extractedImage: aiImage };
        }));
      }

      setAiResult(validatedArray);
    } catch (e) { showMsg("Σφάλμα AI: " + e.message, "error"); }
    setAiLoading(false);
  };

  const importAIResult = async () => {
    for (const item of aiResult) {
      const payload = { 
        ...item, 
        imageUrl: item.extractedImage || item.imageUrl, 
        isActive: true 
      };
      delete payload.extractedImage;
      delete payload.boundingBox;
      await supabase.insert("discounts", payload);
    }
    showMsg(`✓ ${aiResult.length} προσφορές εισήχθησαν!`);
    setAiResult(null); setAiText(""); setAiImage(null); load(); setTab("list");
  };

  const inp = { background: G.bg, border: `1.5px solid ${G.border}`, borderRadius: 10, padding: "10px 14px", color: G.text, fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" };
  const lbl = { color: G.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };
  const filteredList = discounts.filter((d) => !search || normalize(d.productName || d.product_name || "").includes(normalize(search)));

  return (
    <div style={{ minHeight: "100vh", background: G.bg, fontFamily: "'Outfit', 'Segoe UI', sans-serif", color: G.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; }`}</style>

      <header style={{ background: "#fff", borderBottom: `1px solid ${G.border}`, padding: "0 20px", height: 64, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
        <button onClick={onBack} style={{ background: G.bg, border: `1px solid ${G.border}`, color: G.text, cursor: "pointer", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>← Πίσω</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: G.accent, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚙️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1 }}>Admin Panel</div>
            <div style={{ color: G.muted, fontSize: 11, lineHeight: 1, marginTop: 2 }}>Προσφορές Παντού</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", background: G.bg, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, color: G.muted, border: `1px solid ${G.border}` }}>{discounts.length} προσφορές</div>
      </header>

      {msg.text && (
        <div style={{ background: msg.type === "error" ? "#fef2f2" : "#f0fdf4", color: msg.type === "error" ? "#dc2626" : "#16a34a", padding: "12px 24px", fontSize: 14, fontWeight: 600, borderBottom: `1px solid ${msg.type === "error" ? "#fecaca" : "#bbf7d0"}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#fff", borderRadius: 12, padding: 5, width: "fit-content", border: `1px solid ${G.border}` }}>
          {[["list", `📋 Λίστα (${discounts.length})`], ["add", "➕ Νέα Προσφορά"], ["ai", "🤖 AI Εισαγωγή"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ background: tab === id ? G.text : "transparent", color: tab === id ? "#fff" : G.muted, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 700 : 500, transition: "all 0.15s", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "list" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Αναζήτηση..." style={{ ...inp, maxWidth: 320 }} />
            </div>
            {filteredList.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: G.muted, background: "#fff", borderRadius: G.radius, border: `1px solid ${G.border}` }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontWeight: 700 }}>Δεν βρέθηκαν προσφορές</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredList.map((d) => {
                  const sm = SUPERMARKETS.find((s) => s.id === d.supermarket);
                  const pName = d.productName || d.product_name;
                  const dPrice = d.discountedPrice || d.discounted_price;
                  const dPercent = d.discountPercent || d.discount_percent;
                  const isActive = d.isActive !== undefined ? d.isActive : d.is_active;

                  return (
                    <div key={d.id} className="admin-item" style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, border: `1px solid ${G.border}`, boxShadow: G.shadow }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, width: "100%" }} className="admin-info">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "#22c55e" : "#d1d5db", flexShrink: 0 }} />
                        <div style={{ background: sm?.color || G.muted, borderRadius: 7, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{sm?.short}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pName}</div>
                          <div style={{ color: G.muted, fontSize: 12, marginTop: 1 }}>{sm?.name} · {d.category}</div>
                        </div>
                        {dPrice && <div style={{ color: "#16a34a", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>€{Number(dPrice).toFixed(2)}</div>}
                        {dPercent && <div style={{ background: G.accentLight, color: G.accent, borderRadius: 7, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>-{dPercent}%</div>}
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }} className="admin-actions">
                        <button onClick={() => toggleActive(d)} style={{ background: G.bg, border: `1px solid ${G.border}`, color: G.muted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit" }}>{isActive ? "Απόκρυψη" : "Εμφάνιση"}</button>
                        <button onClick={() => deleteDiscount(d.id)} style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit" }}>Διαγραφή</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "add" && (
          <div style={{ background: "#fff", borderRadius: G.radius, padding: 24, border: `1px solid ${G.border}`, boxShadow: G.shadow }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>➕ Νέα Προσφορά</h2>
            <div className="admin-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Σούπερ Μάρκετ *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SUPERMARKETS.map((sm) => (
                    <button key={sm.id} onClick={() => setForm((f) => ({ ...f, supermarket: sm.id }))}
                      style={{ background: form.supermarket === sm.id ? sm.color : "#fff", color: form.supermarket === sm.id ? "#fff" : G.text, border: `2px solid ${form.supermarket === sm.id ? sm.color : G.border}`, borderRadius: 9, padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.15s", fontFamily: "inherit" }}>
                      {sm.name}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Όνομα Προϊόντος *</label>
                <input value={form.productName || form.product_name || ""} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} placeholder="π.χ. Γάλα Φρέσκο 1lt" style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Κατηγορία</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CATEGORIES.slice(1).map((c) => (
                    <button key={c.id} onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                      style={{ background: form.category === c.id ? G.accent : "#fff", color: form.category === c.id ? "#fff" : G.muted, border: `1.5px solid ${form.category === c.id ? G.accent : G.border}`, borderRadius: 20, padding: "4px 11px", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s", fontFamily: "inherit" }}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Κανονική Τιμή (€)</label><input type="number" step="0.01" value={form.originalPrice || form.original_price || ""} onChange={(e) => setForm((f) => ({ ...f, originalPrice: e.target.value }))} placeholder="2.50" style={inp} /></div>
              <div><label style={lbl}>Τιμή Προσφοράς (€)</label><input type="number" step="0.01" value={form.discountedPrice || form.discounted_price || ""} onChange={(e) => setForm((f) => ({ ...f, discountedPrice: e.target.value }))} placeholder="1.75" style={inp} /></div>
              <div><label style={lbl}>Έκπτωση %</label><input type="number" value={form.discountPercent || form.discount_percent || ""} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} placeholder="30" style={inp} /></div>
              <div><label style={lbl}>URL Εικόνας</label><input value={form.imageUrl || form.image_url || ""} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={saveDiscount} disabled={saving}
                  style={{ background: saving ? G.muted : G.accent, color: "#fff", border: "none", borderRadius: 10, padding: "13px 24px", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", width: "100%", fontFamily: "inherit", transition: "background 0.2s" }}>
                  {saving ? "Αποθήκευση..." : "✓ Αποθήκευση Προσφοράς"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div>
            <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 5, fontSize: 14 }}>🤖 AI Αυτόματη Εισαγωγή</div>
              <div style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>
                Αντέγραψε κείμενο ή <b>ανέβασε μια φωτογραφία</b> από φυλλάδιο. Το AI θα εξαγάγει αυτόματα όλες τις προσφορές.<br />
                <strong>Παράδειγμα:</strong> Φωτογραφία από φυλλάδιο Lidl ή κείμενο "Lidl - Κοτόπουλο 1kg €2.49"
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Φωτογραφία Φυλλαδίου</label>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <label style={{ background: "#fff", border: `2px dashed ${G.border}`, borderRadius: 12, padding: "20px", width: 140, height: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = G.accent}
                  onMouseLeave={e => e.currentTarget.style.borderColor = G.border}>
                  <span style={{ fontSize: 24, marginBottom: 4 }}>📸</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>Επιλογή Φωτό</span>
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                </label>
                {aiImage && (
                  <div style={{ position: "relative" }}>
                    <img src={aiImage} alt="Preview" style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 12, border: `1px solid ${G.border}` }} />
                    <button onClick={() => setAiImage(null)} style={{ position: "absolute", top: -8, right: -8, background: G.accent, color: "#fff", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontWeight: "bold", fontSize: 12 }}>×</button>
                  </div>
                )}
              </div>
            </div>

            <label style={lbl}>Κείμενο από φυλλάδιο / website (Προαιρετικό)</label>
            <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Επικόλλησε εδώ κείμενο με προσφορές..." rows={4} style={{ ...inp, resize: "vertical", marginBottom: 16 }} />
            
            <button onClick={runAI} disabled={aiLoading || (!aiText.trim() && !aiImage)}
              style={{ background: aiLoading ? G.muted : "#f59e0b", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: aiLoading ? "not-allowed" : "pointer", marginBottom: 24, width: "100%", fontFamily: "inherit" }}>
              {aiLoading ? "⏳ Ανάλυση (μπορεί να πάρει λίγο χρόνο)..." : "🔍 Ανάλυση με AI Vision"}
            </button>
            {aiResult && aiResult.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, color: "#16a34a", marginBottom: 12, fontSize: 14 }}>✓ Βρέθηκαν {aiResult.length} προσφορές:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  {aiResult.map((r, i) => {
                    const sm = SUPERMARKETS.find((s) => s.id === r.supermarket);
                    const pName = r.productName || r.product_name;
                    const dPrice = r.discountedPrice || r.discounted_price;
                    const dPercent = r.discountPercent || r.discount_percent;

                    return (
                      <div key={i} style={{ background: "#fff", borderRadius: 9, padding: "11px 14px", border: `1px solid ${G.border}`, display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ background: sm?.color || G.muted, borderRadius: 6, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{sm?.short || "?"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{pName}</div>
                          <div style={{ color: G.muted, fontSize: 11 }}>{sm?.name} · {r.category}</div>
                        </div>
                        {dPrice && <div style={{ color: "#16a34a", fontWeight: 800, fontSize: 13 }}>€{dPrice}</div>}
                        {dPercent && <div style={{ background: G.accentLight, color: G.accent, borderRadius: 7, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>-{dPercent}%</div>}
                      </div>
                    );
                  })}
                </div>
                <button onClick={importAIResult} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  ✓ Εισαγωγή Όλων ({aiResult.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUpload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => setFile(reader.result);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extract supermarket deals from this image." },
                { type: "image_url", image_url: { url: file } },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      alert("Upload successful! Check console for results.");
      console.log(data);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
          🛡️
        </div>
        <h3 className="text-gray-800 font-bold text-sm">Admin Control Panel</h3>
      </div>
      
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <label className="flex-1 w-full relative">
            <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className={`px-4 py-2 border border-dashed rounded-lg text-sm text-center transition-colors ${
              file ? 'bg-green-50 border-green-200 text-green-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}>
              {file ? "✅ Photo Selected" : "📸 Click to select flyer photo"}
            </div>
          </label>
          
          <button 
            onClick={handleUpload} 
            disabled={loading || !file} 
            className={`whitespace-nowrap px-6 py-2 rounded-lg font-bold text-sm shadow-md transition-all ${
              loading || !file 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
            }`}
          >
            {loading ? "Processing..." : "Upload & Process"}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center italic">AI will automatically detect and extract offers from the image</p>
      </div>
    </div>
  );
}

function LoginModal({ onLogin, onCancel }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await verifyAdminPassword(password);
    if (result.success) {
      onLogin();
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-[#1c1e24] border border-white/10 w-full max-w-sm rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
            🔒
          </div>
          <h2 className="text-xl font-bold text-white">Admin Login</h2>
          <p className="text-slate-400 text-sm mt-1">Εισάγετε τον κωδικό πρόσβασης</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Κωδικός..."
              autoFocus
              className="w-full px-4 py-3 bg-[#0f1115] text-white border border-white/5 rounded-xl outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 bg-white/5 text-slate-300 rounded-xl font-bold hover:bg-white/10 transition-colors"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
            >
              {loading ? "..." : "Είσοδος"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HomeContent() {
  const [screen, setScreen] = useState("public");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      {screen === "public" && (
        <PublicSite 
          onAdmin={() => {
            if (isAdminAuthenticated) setScreen("admin");
            else setShowLogin(true);
          }} 
          isAdmin={isAdminAuthenticated} 
        />
      )}
      
      {screen === "admin" && isAdminAuthenticated && (
        <AdminPanel onBack={() => setScreen("public")} />
      )}

      {showLogin && (
        <LoginModal 
          onLogin={() => {
            setIsAdminAuthenticated(true);
            setShowLogin(false);
            setScreen("admin");
          }}
          onCancel={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
