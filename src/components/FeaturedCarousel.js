'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { DiscountCard } from './DiscountCard';
import { Icon } from './Icons';
import { useShoppingListStore } from '@/lib/store';

export function FeaturedCarousel({ title, sub, deals, onAdd, onSelect, viewAllHref }) {
  const cartItems = useShoppingListStore((s) => s.items);
  const cartIds = useMemo(() => new Set(cartItems.map((i) => i.id)), [cartItems]);

  if (!deals || deals.length === 0) return null;

  return (
    <section className="section">
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
      </div>

      <div className="featured-scroll">
        {deals.map((d) => (
          <DiscountCard key={d.id} d={d} onAdd={onAdd} onSelect={onSelect} inCart={cartIds.has(d.id)} />
        ))}
      </div>
    </section>
  );
}
