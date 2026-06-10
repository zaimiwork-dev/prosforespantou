'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';
import { ShoppingList } from './ShoppingList';
import { useShoppingListStore } from '@/lib/store';

// Persistent bottom tab bar (phones only — CSS hides it ≥768px). The audience
// is elderly + mobile-first; hunting for gear/basket icons in the top corners
// is exactly what they won't do. Λίστα opens the drawer rather than routing —
// the list IS a drawer everywhere else.
// Ειδοποιήσεις is deliberately absent: /alerts is token-gated today and would
// dead-end anonymous users. Add the tab when alerts work without an email link.
const TABS = [
  { href: '/', label: 'Αρχική', icon: 'Home', match: (p) => p === '/' },
  { href: '/deals', label: 'Προσφορές', icon: 'Tag', match: (p) => p.startsWith('/deals') || p.startsWith('/offer') || p.startsWith('/supermarket') },
  { href: '/search', label: 'Αναζήτηση', icon: 'Search', match: (p) => p.startsWith('/search') },
];

export function BottomNav() {
  const pathname = usePathname() || '/';
  const [isListOpen, setIsListOpen] = useState(false);
  const count = useShoppingListStore((s) => s.items.length);

  return (
    <>
      <nav className="bottom-nav" aria-label="Κύρια πλοήγηση">
        {TABS.map((t) => {
          const I = Icon[t.icon];
          const active = t.match(pathname);
          return (
            <Link key={t.href} href={t.href} className={`bn-tab${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
              <I size={21} />
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" className="bn-tab" onClick={() => setIsListOpen(true)}>
          <span className="bn-badge-wrap">
            <Icon.Bag size={21} />
            {count > 0 && <span className="bn-badge">{count}</span>}
          </span>
          <span>Λίστα</span>
        </button>
      </nav>

      <ShoppingList isOpen={isListOpen} onClose={() => setIsListOpen(false)} />
    </>
  );
}
