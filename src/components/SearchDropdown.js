'use client';

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SUPERMARKETS } from "@/lib/constants";
import { rankSearchResults } from "@/lib/search-rank";

// Optimized 40px thumbnail — was a raw <img> downloading the full-size product
// image just to render it at 40px (real waste on mobile data). Falls back to a
// cart glyph when there's no image or the host fails.
function SearchThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f3f5f8", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        🛒
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt || ""}
      width={40}
      height={40}
      onError={() => setFailed(true)}
      style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#f3f5f8" }}
    />
  );
}

// Matching + ranking live in lib/search-rank.ts — the SAME module the server
// search action uses, so suggestions and the results page agree on what
// "relevant" means (they previously had divergent inline copies that matched
// bare substrings: typing "γάλα" suggested body lotions before milk).
export function SearchDropdown({ query, deals, onSelect, open = true, showEmpty = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onSelect(null);
    };
    const onKey = (e) => { if (e.key === "Escape") onSelect(null); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onSelect]);

  if (!open || !query || query.trim().length < 2) return null;

  const results = rankSearchResults(query, deals || []).slice(0, 6);
  if (results.length === 0 && !showEmpty) return null;

  const sm = (id) => SUPERMARKETS.find((s) => s.id === id);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        right: 0,
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        zIndex: 200,
        overflowY: "auto",
        maxHeight: "260px",
        border: "1px solid #ececf0",
      }}
    >
      {results.length === 0 ? (
        <div style={{ padding: "16px 18px", color: "#8b929c", fontSize: 14, fontWeight: 500 }}>
          Δεν βρέθηκαν αποτελέσματα
        </div>
      ) : (
        results.map((deal) => {
          const store = sm(deal.supermarket);
          return (
            <button
              key={deal.id}
              onClick={() => onSelect(deal)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "none",
                border: "none",
                borderBottom: "1px solid #f3f5f8",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <SearchThumb src={deal.imageUrl} alt={deal.productName} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1c1e24", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {deal.productName}
                </div>
                {store && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: store.color, marginTop: 2 }}>
                    {store.name}
                  </div>
                )}
              </div>

              {deal.discountPercent > 0 && (
                <div style={{
                  background: "#ff3b30",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 900,
                  padding: "3px 7px",
                  borderRadius: 8,
                  flexShrink: 0,
                }}>
                  -{deal.discountPercent}%
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
