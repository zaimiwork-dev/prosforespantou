import React from 'react';

// Category icons as emoji — instantly recognizable for the elderly target
// users, colourful, and unambiguous (the old monochrome line glyphs collided:
// fruit/personal-care were both droplets, dairy/drinks both bottles).
// Keys match CATEGORIES[].id (Greek labels) in src/lib/constants.js.

const EMOJI = {
  'Φρούτα & Λαχανικά': '🍎',
  'Κρέας & Ψάρι': '🥩',
  'Γαλακτοκομικά & Είδη Ψυγείου': '🥛',
  'Τυριά & Αλλαντικά': '🧀',
  'Σαλάτες & Αλοιφές': '🥗',
  'Κονσέρβες': '🥫',
  'Αρτοποιία': '🍞',
  'Κατεψυγμένα': '🧊',
  'Είδη Παντοπωλείου': '🛒',
  'Πρωινό & Ροφήματα': '☕',
  'Σνακ & Γλυκά': '🍫',
  'Κάβα': '🍷',
  'Προσωπική Φροντίδα': '🧴',
  'Βρεφικά Είδη': '👶',
  'Είδη Καθαρισμού & Σπιτιού': '🧼',
  'Είδη Κατοικιδίων': '🐾',
  'Άλλο': '📦',
};

export function CategoryIcon({ id, size = 24 }) {
  const emoji = EMOJI[id] || EMOJI['Άλλο'];
  return (
    <span
      role="img"
      aria-label={id}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}
    >
      {emoji}
    </span>
  );
}
