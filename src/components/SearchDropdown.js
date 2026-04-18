'use client';

import { useEffect, useRef } from "react";
import { SUPERMARKETS } from "@/lib/constants";

const GREEKLISH_MAP = {
  th: 'θ', ch: 'χ', ps: 'ψ', ou: 'ου', mp: 'μπ',
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε',
  z: 'ζ', h: 'η', i: 'ι', k: 'κ', l: 'λ',
  m: 'μ', n: 'ν', x: 'ξ', o: 'ο', p: 'π',
  r: 'ρ', s: 'σ', t: 'τ', u: 'υ', y: 'υ',
  f: 'φ', v: 'β', w: 'ω', q: 'κ',
};

function greeklish(text) {
  const lower = text.toLowerCase();
  let result = '';
  let i = 0;
  while (i < lower.length) {
    const two = lower[i] + (lower[i + 1] ?? '');
    if (GREEKLISH_MAP[two]) { result += GREEKLISH_MAP[two]; i += 2; }
    else if (GREEKLISH_MAP[lower[i]]) { result += GREEKLISH_MAP[lower[i]]; i++; }
    else { result += lower[i]; i++; }
  }
  return result;
}

const normalize = (s) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function SearchDropdown({ query, deals, onSelect }) {
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

  if (!query || query.trim().length < 2) return null;

  const raw = query.trim();
  const isLatin = /^[a-zA-Z\s]+$/.test(raw);
  const q = normalize(isLatin ? greeklish(raw) : raw);

  const results = deals
    .filter((d) => normalize(d.productName).includes(q))
    .slice(0, 6);

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
        overflow: "hidden",
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
              {deal.imageUrl ? (
                <img
                  src={deal.imageUrl}
                  alt={deal.productName}
                  style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#f3f5f8" }}
                />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f3f5f8", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  🛒
                </div>
              )}

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
