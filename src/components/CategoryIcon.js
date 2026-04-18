import React from 'react';

// Stroke SVG category icons. Rendered inside .cat-ico wrapper.
// Keys match CATEGORIES[].id (Greek labels) from src/lib/constants.js

const GLYPHS = {
  "Κρέας & Ψάρι": (
    <>
      <path d="M7 14c-2-2-2-5 0-7s5-2 7 0l5 5c2 2 2 5 0 7s-5 2-7 0l-2-2" />
      <path d="M8 17c1.5 0 3-1.5 3-3" />
      <circle cx="9" cy="15" r="1" />
    </>
  ),
  "Γαλακτοκομικά": (
    <>
      <path d="M9 3h6v3l2 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10l2-4V3z" />
      <path d="M7 10h10" />
    </>
  ),
  "Φρούτα & Λαχανικά": (
    <>
      <path d="M12 8c-3 0-6 2.5-6 6.5S9 21 12 21s6-2.5 6-6.5-3-6.5-6-6.5z" />
      <path d="M12 8c0-2 1-4 3-5" />
      <path d="M14 4c.5.5 1 1 1 2" />
    </>
  ),
  "Αρτοποιία": (
    <>
      <path d="M4 14c0-3 3.5-6 8-6s8 3 8 6-2 4-4 4H8c-2 0-4-1-4-4z" />
      <path d="M8 14c1-1 2-2 4-2s3 1 4 2" />
    </>
  ),
  "Κατεψυγμένα": (
    <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
  ),
  "Ροφήματα": (
    <>
      <path d="M8 3h8l-1 18H9L8 3z" />
      <path d="M8.5 9h7" />
    </>
  ),
  "Σνακ & Γλυκά": (
    <>
      <path d="M6 7h12l-1 13H7L6 7z" />
      <path d="M6 7l-1-3h14l-1 3" />
      <path d="M9 11v5M12 11v5M15 11v5" />
    </>
  ),
  "Είδη Καθαριότητας": (
    <>
      <path d="M10 3h4v4l3 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l3-2V3z" />
      <path d="M9 13h6" />
    </>
  ),
  "Προσωπική Φροντίδα": (
    <path d="M12 3c-1 4-5 6-5 10a5 5 0 0 0 10 0c0-4-4-6-5-10z" />
  ),
  "Άλλο": (
    <>
      <path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8z" />
      <path d="M8 8V5a4 4 0 0 1 8 0v3" />
    </>
  ),
};

export function CategoryIcon({ id, size = 22 }) {
  const glyph = GLYPHS[id] || GLYPHS["Άλλο"];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
}
