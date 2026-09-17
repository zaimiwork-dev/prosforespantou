// Analytics entry point. EVERY behavioural event goes through here.
//
// Three modes, decided by lib/analytics-mode:
//   • identified — the visitor pressed «Αποδοχή». Events carry the persistent
//     `sid`, so a visit can be followed end to end.
//   • anonymous  — no consent, NEXT_PUBLIC_ANON_ANALYTICS=1. Events carry no
//     session id and the server stores no user agent and no IP, so nothing
//     ties two of them to one person. Repeats inside a 5 s window are dropped
//     here, in memory, because without an id the server cannot dedupe.
//   • off        — no consent and the flag is off: a hard no-op, as it was for
//     the whole of the site's first five months.
//
// Usage:  import { track } from '@/lib/track';
//         track({ eventType: 'deal_click', supermarket, discountId });
// Do NOT call the trackEvent server action directly from components — it
// bypasses this gate.
'use client';

import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { getVisitId } from '@/lib/visit-id';
import { analyticsMode } from '@/lib/analytics-mode';

// Anonymous events have no session id, so the server's own dedupe key cannot
// be built. This is the same 5 s window, kept in page memory: it dies with the
// tab and is never written anywhere, which is the whole point of the mode.
const recent = new Map();
const WINDOW_MS = 5000;

function isRepeat(key) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > WINDOW_MS) recent.delete(k);
  const last = recent.get(key);
  if (last && now - last < WINDOW_MS) return true;
  recent.set(key, now);
  return false;
}

export function track(event) {
  if (typeof window === 'undefined') return;
  const mode = analyticsMode();
  if (mode === 'off') return;

  // A tab-scoped visit id when NEXT_PUBLIC_VISIT_ID is on (lib/visit-id):
  // enough to stitch one visit together, gone when the tab closes. Null
  // otherwise, which is the shipped default.
  const visitId = mode === 'anonymous' ? getVisitId() : null;

  // Without any id the server cannot dedupe, so the 5 s window is kept here in
  // page memory. With a visit id the server's own window does the job.
  if (mode === 'anonymous' && !visitId) {
    const target = event.discountId ?? event.leafletId ?? event.query ?? event.category ?? event.supermarket;
    if (isRepeat(`${event.eventType}:${target}`)) return;
  }

  const sessionId = mode === 'identified' ? getSessionId() : visitId ?? undefined;
  // Fire-and-forget; analytics must never block UI or surface errors to the user.
  trackEvent({ ...event, sessionId }).catch(() => {});
}

// How many visitors accept, and how many refuse.
//
// Today this is unknowable: refusing means recording nothing, including the
// refusal. So we cannot say whether consented profiles cover 5% of shoppers or
// 60% — and that number is the ceiling on every consented feature (the server
// profile, cross-device history, price alerts tied to a person).
//
// Deliberately sent with NO id in either direction: it is a count of choices,
// not a record of who chose. Recording that a consent decision was made is
// also the thing that lets us evidence consent practice if anyone asks.
export function trackConsentChoice(value) {
  if (typeof window === 'undefined') return;
  if (value !== 'accepted' && value !== 'rejected') return;
  trackEvent({ eventType: 'consent_choice', page: 'banner', query: value }).catch(() => {});
}
