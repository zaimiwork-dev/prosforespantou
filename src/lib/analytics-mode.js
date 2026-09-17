// What this visitor's events may carry — the single place that decides.
//
// Why this exists (owner decision, 2026-09-17): for five months nothing at all
// was recorded unless a visitor pressed «Αποδοχή», which produced 917 events
// across the whole life of the site. Every ranking number we ship — how much a
// familiar chain counts, how much «cheapest across chains» counts, how many
// browse slots a shopper's own chains get — was chosen by reasoning and
// simulation, and none of it has ever been checked against a real shopper.
//
// The cookie rule (ePrivacy Art. 5(3)) is about STORING OR READING things on
// someone's device. So the anonymous mode below stores and reads nothing at
// all: no id, no cookie, no localStorage, no sessionStorage, and the server
// records no user agent and no IP. What is left is a plain anonymous count of
// "this card, in this department, at this chain, in this slot, was shown / was
// tapped" — statistics, with nothing to tie two events to one person. That is
// the same basis Vercel Web Analytics already runs on for this site without
// consent, as /aporrito and /cookies already say.
//
// After an explicit «Αποδοχή» we keep the richer identified mode: the same
// events plus the persistent `sid`, which is what lets a visit be followed
// from search to tap.
//
//   'identified' → consented: events carry the persistent session id
//   'anonymous'  → no consent, flag on: events carry NOTHING that identifies
//   'off'        → no consent, flag off: nothing is sent at all
//
// OFF unless NEXT_PUBLIC_ANON_ANALYTICS=1, so the whole thing reverts by
// flipping one Vercel variable. The /cookies and /aporrito wording switches on
// the same flag, so the site never describes a data flow that is not running,
// or hides one that is.
'use client';

import { hasAnalyticsConsent } from '@/lib/consent';

export const ANON_ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANON_ANALYTICS === '1';

export function analyticsMode() {
  if (typeof window === 'undefined') return 'off';
  if (hasAnalyticsConsent()) return 'identified';
  return ANON_ANALYTICS_ENABLED ? 'anonymous' : 'off';
}

// True when this visitor's events may not touch device storage in any form —
// including our own impression counter, which lives in sessionStorage for
// consented visitors and in memory for everyone else.
export const isAnonymous = (mode) => mode === 'anonymous';
