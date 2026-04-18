'use client';

import { useRouter } from "next/navigation";
import { SearchDropdown } from "@/components/SearchDropdown";
import { Icon } from "@/components/Icons";

export function Hero({ search, onSearch, totalCount, supermarketCount, isSearching, onCancel, deals, onSelect }) {
  const router = useRouter();

  const submitSearch = () => {
    if (search.trim().length >= 2) {
      router.push("/search?q=" + encodeURIComponent(search.trim()));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") submitSearch();
  };

  if (isSearching) {
    return (
      <div className="topbar" style={{ position: "sticky", top: 0 }}>
        <div className="container topbar-inner" style={{ height: 64, gap: 10 }}>
          <div className="topbar-search" style={{ flex: 1, maxWidth: "none" }}>
            <span className="search-ico"><Icon.Search size={16} /></span>
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Τι ψάχνεις; π.χ. γάλα, ελαιόλαδο…"
            />
            <SearchDropdown query={search} deals={deals} onSelect={(d) => { if (d) onSelect(d); }} />
          </div>
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Ακύρωση</button>
        </div>
      </div>
    );
  }

  return (
    <section className="hero">
      <div className="container">
        <div className="hero-compact">
          <div className="hero-compact-head">
            <h1>Όλες οι προσφορές, <em>σε ένα μέρος</em></h1>
            <div className="hero-meta">
              {typeof totalCount === "number" && totalCount > 0 && (
                <>
                  <span><b>{totalCount.toLocaleString("el-GR")}</b> προσφορές</span>
                  <span className="dot">·</span>
                </>
              )}
              <span><b>{supermarketCount}</b> αλυσίδες</span>
              <span className="dot">·</span>
              <span className="live-dot" />
              <span>Ενημερώνεται καθημερινά</span>
            </div>
          </div>

          <div className="big-search" style={{ position: "relative" }}>
            <Icon.Search size={18} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Τι ψάχνεις; π.χ. ελαιόλαδο, γιαούρτι, χαρτί κουζίνας…"
            />
            <button type="button" className="btn btn-primary" onClick={submitSearch}>
              Αναζήτηση
            </button>
            <SearchDropdown query={search} deals={deals} onSelect={(d) => { if (d) onSelect(d); }} />
          </div>
        </div>
      </div>
    </section>
  );
}
