'use client';
// GDPR opt-in cookie banner. Shows until the visitor makes a choice; nothing
// behavioural is tracked until they press "Αποδοχή" (see lib/consent.js + lib/track.js).
//
// Compliance notes (do NOT "optimise" these away — they're what keeps consent VALID):
//  - "Αποδοχή" and "Απόρριψη" are equal prominence (same size/weight). EU regulators
//    treat a harder-to-find reject as a dark pattern that invalidates ALL consent.
//  - Reject is a real, one-click choice — not buried in a sub-menu.
//  - Re-openable any time from the footer ("Ρυθμίσεις cookies" → 'open-consent' event)
//    so users can withdraw consent as easily as they gave it.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getConsent, setConsent, onConsentChange } from '@/lib/consent';

export const OPEN_CONSENT_EVENT = 'open-consent';

// Read consent through an external store so React stays in sync without a
// setState-in-effect (the server snapshot is `undefined` → banner stays hidden
// during SSR/hydration, so already-consented users never see a flash).
const subscribe = (cb) => onConsentChange(cb);

export function CookieConsent() {
  const consent = useSyncExternalStore(subscribe, getConsent, () => undefined);
  // Imperative re-open from the footer's "Ρυθμίσεις cookies" link. setState here
  // happens inside an event callback (allowed), not synchronously in the effect.
  const [forced, setForced] = useState(false);

  useEffect(() => {
    const reopen = () => setForced(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const open = forced || consent === null;
  if (!open) return null;

  const choose = (value) => { setForced(false); setConsent(value); };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Συγκατάθεση cookies"
      style={{
        position: 'fixed',
        // Sits above the bottom nav on mobile; the nav is ~64px tall.
        left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
        zIndex: 1000, maxWidth: 560, margin: '0 auto',
        background: '#fff', border: '1px solid #e7e7e7', borderRadius: 16,
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)', padding: 20,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>
        🍪 Λίγα cookies για καλύτερες προσφορές
      </div>
      <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.5, margin: '0 0 16px' }}>
        Με την αποδοχή, μας βοηθάς να καταλάβουμε ποιες προσφορές σε ενδιαφέρουν, ώστε
        να σου δείχνουμε πιο σχετικές προσφορές και να βελτιώνουμε την εφαρμογή. Δεν
        πουλάμε τα δεδομένα σου. Μπορείς να αλλάξεις γνώμη όποτε θες.{' '}
        <a href="/cookies" style={{ color: '#009de0', textDecoration: 'underline' }}>
          Μάθε περισσότερα
        </a>.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Equal prominence — same size/weight. Reject is NOT a downgraded button. */}
        <button
          type="button"
          onClick={() => choose('rejected')}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            border: '1px solid #d0d0d0', background: '#f4f4f4', color: '#222',
            fontWeight: 700, fontSize: 14,
          }}
        >
          Απόρριψη
        </button>
        <button
          type="button"
          onClick={() => choose('accepted')}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            border: '1px solid #0F5132', background: '#0F5132', color: '#fff',
            fontWeight: 700, fontSize: 14,
          }}
        >
          Αποδοχή
        </button>
      </div>
    </div>
  );
}
