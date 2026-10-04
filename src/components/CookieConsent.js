'use client';
// GDPR opt-in cookie banner. Shows until the visitor makes a choice; nothing
// behavioural is tracked until they press "Αποδοχή" (see lib/consent.js + lib/track.js).
//
// Two layouts, chosen by NEXT_PUBLIC_CONSENT_ACCEPT_FIRST (see analytics-mode):
//
//  - DEFAULT (flag unset) — the layout most Greek sites use. Owner, 2026-10-04:
//    "do the accept banner as most people are doing". Surveyed that day at
//    390px (.local-scratch/banner-survey.mjs): of 12 big Greek consumer sites
//    showing a banner, 11 put a reject option on the FIRST layer; 5 of them —
//    AB, Lidl, Κρητικός, My Market, insider — make «Αποδοχή» the big filled
//    button and «Απόρριψη» a quieter outline button or link beneath it, with
//    settings as a text link. Only Jumbo hid reject behind settings. So: a
//    full-width green «Αποδοχή», an outline «Απόρριψη» under it, «Ρυθμίσεις»
//    as a link that opens the category details. One click either way.
//
//  - ACCEPT-FIRST (flag set): "Αποδοχή" alone up front, declining reachable
//    only after "Περισσότερα" — the Jumbo pattern. Asked for on 2026-09-18 and
//    kept behind the flag; the survey above found it is NOT what most sites
//    do, and EU regulators treat the extra click as a dark pattern that
//    invalidates the consent it collects, not merely as a fine risk.
//
// Both layouts keep these:
//  - Declining is always ONE real click once visible — never a sub-menu of
//    toggles, never a "confirm your choices" step.
//  - Re-openable any time from the footer ("Ρυθμίσεις cookies" → 'open-consent'
//    event) so users can withdraw consent as easily as they gave it.
//  - The anonymous-layer disclosure is shown on the FIRST layer in both, since
//    it describes what happens to someone who never expands anything.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getConsent, setConsent, onConsentChange } from '@/lib/consent';
import { ANON_ANALYTICS_ENABLED, VISIT_ID_ENABLED, CONSENT_ACCEPT_FIRST } from '@/lib/analytics-mode';
import { trackConsentChoice } from '@/lib/track';
import { forgetVisitId } from '@/lib/visit-id';

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
  // Has the visitor opened the details («Ρυθμίσεις» / «Περισσότερα») yet.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const reopen = () => setForced(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const open = forced || consent === null;
  if (!open) return null;

  const choose = (value) => {
    setForced(false);
    setExpanded(false);
    // Recorded BEFORE the choice lands, so it is sent without any id in either
    // direction — a count of choices, not a record of who chose. Without it a
    // refusal leaves no trace at all and the accept rate stays unknowable.
    trackConsentChoice(value);
    // Either way the visit id has no further purpose: a refusal should not
    // leave one behind, and an acceptance replaces it with the real `sid`.
    forgetVisitId();
    setConsent(value);
  };

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
        Λίγα cookies για καλύτερες προσφορές
      </div>
      {/* Short in both layouts — the detail lives behind «Ρυθμίσεις» /
          «Περισσότερα», which is what layering is for. The long version
          measured 448px tall at 390px wide, most of a phone screen. */}
      <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.5, margin: '0 0 16px' }}>
        Χρησιμοποιούμε cookies για να σου δείχνουμε πιο σχετικές προσφορές.{' '}
        <a href="/cookies" style={{ color: '#009de0', textDecoration: 'underline' }}>
          Μάθε περισσότερα
        </a>.
      </p>
      {/* Transparency, not a nudge: a visitor pressing «Απόρριψη» must know what
          still happens. The anonymous layer stores and reads nothing on the
          device, so it is not what this banner asks about — but staying silent
          about it would make the reject button say more than it means. */}
      {ANON_ANALYTICS_ENABLED && (
        <p style={{ fontSize: 12, color: '#777', lineHeight: 1.5, margin: '-8px 0 16px' }}>
          {!VISIT_ID_ENABLED ? (
            // Short form, but it still says the part that matters to someone
            // who never expands: refusing does not stop the anonymous count.
            <>
              Ακόμη κι αν πατήσεις «Απόρριψη», μετράμε ανώνυμα ποιες προσφορές εμφανίζονται
              και ποιες πατιούνται.
            </>
          ) : (
            // The visit id IS device storage, so when it is on the banner has
            // to say so; it stays short by naming only what matters.
            <>
              Ακόμη κι αν πατήσεις «Απόρριψη», μετράμε ανώνυμα ποιες προσφορές εμφανίζονται και
              ποιες πατιούνται, με έναν προσωρινό κωδικό που σβήνει μόλις κλείσεις την καρτέλα.
            </>
          )}
        </p>
      )}
      {/* The category details, behind «Ρυθμίσεις» (default layout) or
          «Περισσότερα» (accept-first). */}
      {expanded && (
        <div
          id="consent-detail"
          style={{
            fontSize: 12.5, color: '#555', lineHeight: 1.55,
            background: '#fafafa', border: '1px solid #eee', borderRadius: 12,
            padding: '12px 14px', margin: '0 0 14px',
          }}
        >
          <p style={{ margin: '0 0 8px' }}>
            <strong>Απαραίτητα</strong> — χρειάζονται για να λειτουργεί η εφαρμογή: η
            επιλογή σου εδώ, η λίστα σου και οι ρυθμίσεις σου. Δεν απενεργοποιούνται.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Στατιστικά και εξατομίκευση</strong> — ένα ανώνυμο αναγνωριστικό που
            μας δείχνει ποιες προσφορές σε ενδιαφέρουν, ώστε να σου προτείνουμε πιο
            σχετικές. Μπορείς να τα απορρίψεις παρακάτω.{' '}
            <a href="/cookies" style={{ color: '#009de0', textDecoration: 'underline' }}>
              Αναλυτικά
            </a>.
          </p>
          <p style={{ margin: 0 }}>
            Δεν πουλάμε τα δεδομένα σου και μπορείς να αλλάξεις γνώμη όποτε θες, από τις
            «Ρυθμίσεις cookies» στο υποσέλιδο.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => choose('accepted')}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 12, cursor: 'pointer',
          border: '1px solid #0F5132', background: '#0F5132', color: '#fff',
          fontWeight: 800, fontSize: 15,
        }}
      >
        Αποδοχή
      </button>
      {CONSENT_ACCEPT_FIRST && !expanded ? (
        // Accept-first only: declining is reached by expanding first.
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls="consent-detail"
          style={{
            width: '100%', marginTop: 8, padding: '10px 16px', borderRadius: 12,
            cursor: 'pointer', border: 'none', background: 'transparent',
            color: '#555', fontWeight: 700, fontSize: 13.5,
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Περισσότερα
        </button>
      ) : (
        <>
          {/* Quieter than «Αποδοχή» — an outline on white, the way AB, Κρητικός
              and My Market do it — but one real click that resolves the
              banner by itself, never a menu of toggles. */}
          <button
            type="button"
            onClick={() => choose('rejected')}
            style={{
              width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 12,
              cursor: 'pointer', border: '1px solid #c9c9c9', background: '#fff',
              color: '#333', fontWeight: 700, fontSize: 14,
            }}
          >
            {CONSENT_ACCEPT_FIRST ? 'Απόρριψη μη απαραίτητων' : 'Απόρριψη'}
          </button>
          {!CONSENT_ACCEPT_FIRST && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-controls="consent-detail"
              style={{
                width: '100%', marginTop: 4, padding: '8px 16px', borderRadius: 12,
                cursor: 'pointer', border: 'none', background: 'transparent',
                color: '#555', fontWeight: 700, fontSize: 13.5,
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Ρυθμίσεις
            </button>
          )}
        </>
      )}
    </div>
  );
}
