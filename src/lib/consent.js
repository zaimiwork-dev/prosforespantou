// Cookie/analytics consent — single source of truth for the GDPR opt-in gate.
//
// EU ePrivacy + GDPR: non-essential (analytics/behavioural) tracking may only run
// AFTER the user opts in. Until then we record nothing identifying — no sessionId,
// no click trail, no server call (see lib/track.js, which refuses to fire without
// consent here). Essential things (the site working, security rate-limits) are
// exempt and always on.
//
// State lives in localStorage under 'cookie-consent': 'accepted' | 'rejected'.
// null/absent = not asked yet (banner shows; tracking stays OFF until a choice).

export const CONSENT_KEY = 'cookie-consent';
export const CONSENT_EVENT = 'consent-change'; // window event so the banner + gate react live

export function getConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null; // private mode / blocked storage → treat as not-consented (safe default)
  }
}

// True only after an explicit Accept. Reject AND not-yet-asked both return false,
// so analytics never fires by default — the legally-required default state.
export function hasAnalyticsConsent() {
  return getConsent() === 'accepted';
}

export function setConsent(value) {
  if (typeof window === 'undefined') return;
  if (value !== 'accepted' && value !== 'rejected') return;
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked — choice just won't persist; banner will re-ask. */
  }
  // If the user withdraws consent, drop the persistent analytics id immediately
  // so a later re-accept starts a fresh session rather than re-linking old data.
  if (value === 'rejected') {
    try { localStorage.removeItem('sid'); } catch { /* ignore */ }
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  } catch {
    /* CustomEvent unsupported — non-fatal. */
  }
}

// Subscribe to consent changes (banner accept/reject, or another tab). Returns an
// unsubscribe fn. Fires on our CustomEvent and on cross-tab 'storage' events.
export function onConsentChange(cb) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb(getConsent());
  const storageHandler = (e) => { if (e.key === CONSENT_KEY) cb(getConsent()); };
  window.addEventListener(CONSENT_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CONSENT_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
