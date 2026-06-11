'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DiscountCard } from './DiscountCard';
import { Icon } from './Icons';
import { useShoppingListStore } from '@/lib/store';
import { groupDealsByProduct } from '@/lib/group-deals';

export function FeaturedCarousel({ title, sub, deals, onAdd, onSelect, viewAllHref, rows = 1 }) {
  const cartItems = useShoppingListStore((s) => s.items);
  const cartIds = useMemo(() => new Set(cartItems.map((i) => i.id)), [cartItems]);
  const grouped = useMemo(() => groupDealsByProduct(deals), [deals]);

  const scrollerRef = useRef(null);
  // Edge state drives the arrow disabling. Defaults assume overflow to the
  // right; measure() corrects on mount (ref callback) and on every scroll.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = (el) => {
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };
  const attachScroller = (el) => {
    scrollerRef.current = el;
    measure(el);
  };
  const page = (dir) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (!grouped || grouped.length === 0) return null;

  // Both edges at once means nothing overflows — arrows would be dead weight.
  const showArrows = !(atStart && atEnd);

  return (
    <section className={rows === 2 ? 'section section--showcase' : 'section'}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="link">
            Όλες <Icon.ArrowRight size={14} />
          </Link>
        )}
        {showArrows && (
          <div className="car-nav">
            <button
              type="button"
              className="car-arrow"
              onClick={() => page(-1)}
              disabled={atStart}
              aria-label="Προηγούμενες προσφορές"
            >
              <Icon.ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="car-arrow"
              onClick={() => page(1)}
              disabled={atEnd}
              aria-label="Επόμενες προσφορές"
            >
              <Icon.ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={attachScroller}
        onScroll={(e) => measure(e.currentTarget)}
        className={rows === 2 ? 'featured-scroll two-row' : 'featured-scroll'}
      >
        {grouped.map((d) => (
          <DiscountCard key={d.id} d={d} onAdd={onAdd} onSelect={onSelect} inCart={cartIds.has(d.id)} />
        ))}
      </div>
    </section>
  );
}
