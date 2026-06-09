'use client';

import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { CATEGORIES } from '@/lib/constants';

export function CategoryGrid({ activeCategory, onSelect, counts = {}, asLinks = false }) {
  // Dynamic grid: when we know the per-category counts, hide departments that
  // have no active deals so the row reflects what's actually in the catalogue
  // (the keyword categorizer fills ~16 of the 17; empties shouldn't show).
  // Always keep the currently-active category visible even if its count is 0.
  const hasCounts = Object.keys(counts).length > 0;
  const items = CATEGORIES.filter(
    (c) => c.id !== "all" && (!hasCounts || (counts[c.id] || 0) > 0 || c.id === activeCategory)
  );

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

      <div className="cats-row">
        {items.map((c) => {
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
      </div>
    </section>
  );
}
