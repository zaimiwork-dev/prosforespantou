'use client';

import Link from 'next/link';
import { Icon } from './Icons';

export function SiteHeader({ onAdminTrigger, cartCount = 0, onCartOpen, onSettingsOpen }) {
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href="/" className="logo" onDoubleClick={onAdminTrigger}>
          <span className="logo-mark">Π</span>
          <span className="logo-text">Προσφορές Παντού</span>
        </Link>

        <div className="topbar-right">
          <button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Ρυθμίσεις καταστημάτων"
            className="icon-btn"
          >
            <Icon.Settings size={18} />
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
