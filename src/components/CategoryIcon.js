import React from 'react';

// Category icons as stroke SVGs (2026-09-16 — they were emoji until then).
// Emoji render as a different picture on every phone, sit at a different
// baseline than the text next to them, and read as decoration; the chains
// this app sits beside (Lidl, Μασούτης, Skroutz) all use flat monochrome
// glyphs. These inherit `currentColor`, so the same icon works on the brand
// circle of a category tile and on a grey image placeholder.
//
// The emoji existed because an earlier line set collided (fruit and personal
// care were both droplets, dairy and drinks both bottles). Silhouettes here
// are deliberately unlike each other: apple, fish, gable-top carton, wedge,
// bowl, tin, loaf, snowflake, basket, cup, bar, glass, pump bottle, teat
// bottle, trigger spray, paw, parcel.
//
// Keys match CATEGORIES[].id (Greek labels) in src/lib/constants.js.

const P = {
  'Φρούτα & Λαχανικά': (
    <>
      <path d="M12 8.5c-1-1.2-2.4-1.8-3.8-1.4C6.3 7.6 5 9.6 5 12.2c0 3.3 2.3 7.3 4.3 7.3.9 0 1.6-.5 2.7-.5s1.8.5 2.7.5c2 0 4.3-4 4.3-7.3 0-2.6-1.3-4.6-3.2-5.1-1.4-.4-2.8.2-3.8 1.4Z" />
      <path d="M12 8.5V6a3 3 0 0 1 3-3" />
    </>
  ),
  'Κρέας & Ψάρι': (
    <>
      <path d="M7 12c2.3-3.3 5.2-4.9 8.6-4.9 2.8 0 5.2 1.3 7 4.1.3.5.3 1.1 0 1.6-1.8 2.8-4.2 4.1-7 4.1-3.4 0-6.3-1.6-8.6-4.9Z" />
      <path d="M7 12 3 8.6v6.8L7 12Z" />
      <path d="M13 9.6c.9.7 1.4 1.5 1.4 2.4s-.5 1.7-1.4 2.4" />
      <circle cx="18" cy="10.9" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  'Γαλακτοκομικά & Είδη Ψυγείου': (
    <>
      <path d="M6 10.2 12 3.5l6 6.7V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10.2Z" />
      <path d="M6 10.2h12M12 3.5v6.7" />
    </>
  ),
  'Τυριά & Αλλαντικά': (
    <>
      <path d="M3 16V9.5l9-4.5 9 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M3 9.5h18" />
      <circle cx="8" cy="13" r="1.2" />
      <circle cx="15" cy="12.5" r="1.6" />
    </>
  ),
  'Σαλάτες & Αλοιφές': (
    <>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
      <path d="M12 11c0-2.8 1.9-5 4.5-5.5M12 11c-.6-1.8-2-3-3.9-3.3" />
    </>
  ),
  'Κονσέρβες': (
    <>
      <ellipse cx="12" cy="6" rx="6" ry="2.5" />
      <path d="M6 6v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
      <path d="M6 11.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </>
  ),
  'Αρτοποιία': (
    <>
      <path d="M4 15.5c0-4.1 3.6-7.5 8-7.5s8 3.4 8 7.5c0 .9-.7 1.5-1.6 1.5H5.6c-.9 0-1.6-.6-1.6-1.5Z" />
      <path d="M9 17V9.2M15 17V9.2" />
    </>
  ),
  'Κατεψυγμένα': (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      <path d="m9.5 5 2.5 2.5L14.5 5M9.5 19l2.5-2.5 2.5 2.5" />
    </>
  ),
  'Είδη Παντοπωλείου': (
    <>
      <path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9Z" />
      <path d="M8.5 9 10 4m5.5 5L14 4" />
      <path d="M9 13v3M15 13v3" />
    </>
  ),
  'Πρωινό & Ροφήματα': (
    <>
      <path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 6V4M12 6V4" />
    </>
  ),
  'Σνακ & Γλυκά': (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.6" />
      <path d="M4 10h16M4 14.5h16M9.5 5v14M14.5 5v14" />
    </>
  ),
  'Κάβα': (
    <>
      <path d="M7 4h10l-.6 5.3a4.5 4.5 0 0 1-8.8 0L7 4Z" />
      <path d="M12 14v6M9 20h6" />
    </>
  ),
  'Προσωπική Φροντίδα': (
    <>
      <path d="M8 10h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9Z" />
      <path d="M11 10V7h2.5" />
      <path d="M13.5 7h2.5V4.5" />
    </>
  ),
  'Βρεφικά Είδη': (
    <>
      <path d="M8.5 10h7v8.5a2.5 2.5 0 0 1-2.5 2.5h-2a2.5 2.5 0 0 1-2.5-2.5V10Z" />
      <path d="M9.5 10V8.2h5V10" />
      <path d="M12 8.2V6a2 2 0 0 1 2-2" />
      <path d="M8.5 14h2.5M8.5 17h2.5" />
    </>
  ),
  'Είδη Καθαρισμού & Σπιτιού': (
    <>
      <path d="M8.2 10.2h5.6V19a2 2 0 0 1-2 2h-1.6a2 2 0 0 1-2-2v-8.8Z" />
      <path d="M9.6 10.2V6.6h2.8v3.6" />
      <path d="M12.4 7.4h3.4l-1.1 1.8" />
      <path d="M18 6.6h.01M19.6 8.4h.01M18.4 10.4h.01" />
    </>
  ),
  'Είδη Κατοικιδίων': (
    <>
      <ellipse cx="12" cy="16" rx="4" ry="3.4" />
      <ellipse cx="6.5" cy="11" rx="1.8" ry="2.3" />
      <ellipse cx="17.5" cy="11" rx="1.8" ry="2.3" />
      <ellipse cx="9.8" cy="7" rx="1.8" ry="2.3" />
      <ellipse cx="14.2" cy="7" rx="1.8" ry="2.3" />
    </>
  ),
  'Άλλο': (
    <>
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
      <path d="m3 8.5 9 4.5 9-4.5M12 13v7" />
    </>
  ),
};

export function CategoryIcon({ id, size = 24 }) {
  const paths = P[id] || P['Άλλο'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // Thinner at 44px+ (tiles, placeholders) so the glyph reads as a drawing
      // rather than a blob; heavier at 15px, where hairlines disappear.
      strokeWidth={size >= 40 ? 1.4 : size >= 22 ? 1.6 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={id}
    >
      {paths}
    </svg>
  );
}
