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
    const greek = greeklish(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

  const expandedTerms = expandSearch(query);

  const results = deals
    .filter((d) => {
       const name = normalize(d.productName);
       const desc = normalize(d.description);
       return expandedTerms.some(term => name.includes(term) || desc.includes(term));
    })
    .slice(0, 10);

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
        maxHeight: "210px",
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
