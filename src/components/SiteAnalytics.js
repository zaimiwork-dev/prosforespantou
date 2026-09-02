'use client';

// Aggregate, cookieless visit counting — deliberately NOT behind the consent
// banner, and deliberately separate from lib/track.js.
//
// WHY BOTH EXIST
// lib/track.js records BEHAVIOURAL events (which deal you clicked, what you
// searched, a per-device sessionId in localStorage). That is non-essential
// profiling, so it stays opt-in and silent until the user accepts — see
// lib/consent.js. The cost of that correctness is that we currently cannot
// count visitors at all: 504 events in five months, four sessions in thirty
// days, because almost nobody opts in. You cannot run a distribution
// experiment blind, which is what weeks 4-6 of the plan are.
//
// This counter answers only "how many people opened which page". Vercel Web
// Analytics sets no cookie and writes nothing to the device; a visitor is a
// hash derived from the incoming request, discarded after 24 hours, with no
// identifier that could follow anyone to another site. Because nothing is
// stored on or read from the visitor's device, the ePrivacy consent trigger
// for storage/access does not apply, and the data is aggregate-only.
//
// beforeSend below drops query strings entirely. Vercel would keep filtered
// params, but ours can carry a shopper's own search text (/search?q=…), which
// is their input and none of our business in an analytics store. Paths alone
// answer the only question we are asking.
import { Analytics } from '@vercel/analytics/react';

export default function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          // Path only — no query, no hash.
          return { ...event, url: `${url.origin}${url.pathname}` };
        } catch {
          // If the URL can't be parsed, drop the event rather than risk
          // shipping something unexpected.
          return null;
        }
      }}
    />
  );
}
