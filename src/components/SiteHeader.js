'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';
import { useShoppingListStore } from '@/lib/store';

export function SiteHeader({ onAdminTrigger = () => {}, cartCount = 0, onCartOpen = () => {}, onSettingsOpen = () => {} }) {
  // Show how many "Τα καταστήματά μου" are active — without a visible state
  // the filter feels like it does nothing (user feedback 2026-06-12).
  const preferredCount = useShoppingListStore((s) => s.preferredStores.length);
  const pathname = usePathname() || '/';
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href="/" className="logo" onDoubleClick={onAdminTrigger}>
          <span className="logo-mark">Π</span>
          <span className="logo-text">Προσφορές Παντού</span>
        </Link>

        <nav className="topbar-nav" aria-label="Κύρια πλοήγηση">
          <Link href="/deals" className={`topbar-link${pathname.startsWith('/deals') || pathname.startsWith('/offer') || pathname.startsWith('/supermarket') ? ' active' : ''}`}>
            Προσφορές
          </Link>
          <Link href="/catalog" className={`topbar-link${pathname.startsWith('/catalog') ? ' active' : ''}`}>
            Κατάλογος
          </Link>
        </nav>

        <div className="topbar-right">
          <button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Ρυθμίσεις καταστημάτων"
            className="icon-btn"
          >
            <Icon.Settings size={18} />
            {preferredCount > 0 && <span className="badge-count">{preferredCount}</span>}
          </button>

          <button
            type="button"
            onClick={onCartOpen}
            aria-label="Λίστα αγορών"
            className="icon-btn"
          >
            <Icon.Bag size={20} />
            {cartCount > 0 && <span className="badge-count">{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}
