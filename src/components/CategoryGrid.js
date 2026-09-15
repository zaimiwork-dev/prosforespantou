'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { CATEGORIES } from '@/lib/constants';

// Homepage order: the departments a weekly shop starts from. 17 small tiles
// were a wall for an older reader; 8 big ones + «Περισσότερα» fit one screen
// (3×3 at phone width, the toggle being the ninth tile).
const HOME_ORDER = [
  'Γαλακτοκομικά & Είδη Ψυγείου',
  'Κρέας & Ψάρι',
  'Φρούτα & Λαχανικά',
  'Τυριά & Αλλαντικά',
  'Είδη Παντοπωλείου',
  'Πρωινό & Ροφήματα',
  'Είδη Καθαρισμού & Σπιτιού',
  'Κάβα',
];

export function CategoryGrid({ activeCategory, onSelect, counts = {}, asLinks = false, limit = 0 }) {
  const [expanded, setExpanded] = useState(false);

  // Dynamic grid: when we know the per-category counts, hide departments that
  // have no active deals so the row reflects what's actually in the catalogue
  // (the keyword categorizer fills ~16 of the 17; empties shouldn't show).
  // Always keep the currently-active category visible even if its count is 0.
  const hasCounts = Object.keys(counts).length > 0;
  let items = CATEGORIES.filter(
    (c) => c.id !== "all" && (!hasCounts || (counts[c.id] || 0) > 0 || c.id === activeCategory)
  );
  if (limit > 0) {
    const rank = (id) => {
      const i = HOME_ORDER.indexOf(id);
      return i === -1 ? HOME_ORDER.length : i;
    };
    // Stable: departments outside HOME_ORDER keep their CATEGORIES order.
    items = items
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.i - b.i)
      .map((x) => x.c);
  }
  const collapsible = limit > 0 && items.length > limit + 1;
  const shown = collapsible && !expanded ? items.slice(0, limit) : items;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{asLinks ? "Ανά κατηγορία" : "Κατηγορίες"}</h2>
        </div>
        {!asLinks && activeCategory !== "all" && (
          <button type="button" onClick={() => onSelect("all")} className="link" style={{ cursor: "pointer", background: "none", border: 0 }}>
            Καθαρισμός φίλτρου
          </button>
        )}
      </div>

      <div className={`cats-row${limit > 0 ? " cats-row--home" : ""}`}>
        {shown.map((c) => {
          const active = !asLinks && activeCategory === c.id;
          const count = counts[c.id] || 0;
          const tileClass = `cat-tile${active ? " active" : ""}`;

          const inner = (
            <>
              <div className="cat-ico">
                <CategoryIcon id={c.id} />
              </div>
              <div className="cat-name">{c.label}</div>
              {count > 0 && (
                <div className="cat-count">{count.toLocaleString("el-GR")}</div>
              )}
            </>
          );

          if (asLinks) {
            return (
              <Link key={c.id} href={`/deals?category=${encodeURIComponent(c.id)}`} className={tileClass}>
                {inner}
              </Link>
            );
          }

          return (
            <button key={c.id} type="button" onClick={() => onSelect(active ? "all" : c.id)} className={tileClass}>
              {inner}
            </button>
          );
        })}

        {collapsible && (
          <button
            type="button"
            className="cat-tile cat-tile--more"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <div className="cat-ico">
              {expanded ? <Icon.Minus size={20} /> : <Icon.Plus size={20} />}
            </div>
            <div className="cat-name">{expanded ? "Λιγότερες" : "Περισσότερες"}</div>
            {!expanded && <div className="cat-count">+{items.length - limit}</div>}
          </button>
        )}
      </div>
    </section>
  );
}
