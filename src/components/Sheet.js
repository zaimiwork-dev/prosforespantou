'use client';

import { useEffect } from 'react';

// Generic bottom sheet — thumb-reachable on phones, where this app lives.
// Controlled: render-null when closed. Used by the /deals and supermarket
// filter sheets (and intended for any future modal-ish surface).
export function Sheet({ isOpen, onClose, title, children, footer }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Κλείσιμο">×</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
