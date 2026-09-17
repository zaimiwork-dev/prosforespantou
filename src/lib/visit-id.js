// Tab-scoped visit id for a visitor who has NOT consented (2026-09-17).
//
// The anonymous layer (lib/analytics-mode) answers "which card was tapped".
// This answers "was it the same visit that searched for it" — the one thing
// aggregate counting cannot reconstruct. It buys funnels: search → scroll →
// tap, abandon rates, how deep a visit goes before it finds something.
//
// WHAT IT IS, PRECISELY, because the difference is the whole legal question:
//   • sessionStorage, not localStorage — it dies when the tab closes. It cannot
//     link two visits, two days, or two devices. There is no person here, only
//     a visit.
//   • first-party only; it is never sent anywhere but our own server and never
//     joined to anything else.
//   • ids are prefixed `v-`, so an anonymous visit is distinguishable from a
//     consented session at a glance — and, if counsel says no, every row it
//     produced is removable with one `WHERE "sessionId" LIKE 'v-%'`. That
//     reversibility is deliberate: this ships before the legal advice, not
//     after.
//
// This IS storage on the device, so unlike the rest of the anonymous layer it
// is not exempt by construction — it rests on the audience-measurement
// reasoning several EU regulators apply to first-party analytics, which holds
// only while the purpose stays measurement. The moment these ids were used to
// build a durable per-person profile the reasoning would collapse, which is
// why they cannot: they do not survive the tab.
//
// OFF unless NEXT_PUBLIC_VISIT_ID=1, separately from the anonymous layer, so
// the lawyer conversation is about one switch and nothing else.
'use client';

import { VISIT_ID_ENABLED, analyticsMode } from '@/lib/analytics-mode';

export const VISIT_KEY = 'pp-visit';
export const VISIT_PREFIX = 'v-';

export function getVisitId() {
  if (typeof window === 'undefined') return null;
  if (!VISIT_ID_ENABLED) return null;
  // Only for the non-consenting. A consented visitor has the real `sid`.
  if (analyticsMode() !== 'anonymous') return null;
  try {
    let id = window.sessionStorage.getItem(VISIT_KEY);
    if (!id) {
      id = VISIT_PREFIX + crypto.randomUUID();
      window.sessionStorage.setItem(VISIT_KEY, id);
    }
    return id;
  } catch {
    return null; // private mode / blocked storage → stay anonymous, still counted
  }
}

// Called when consent is withdrawn: the visit id is not consented data, but a
// visitor who just said no should not keep carrying one either.
export function forgetVisitId() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(VISIT_KEY); } catch { /* ignore */ }
}
