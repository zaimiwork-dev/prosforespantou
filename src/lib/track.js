// Consent-gated analytics entry point. EVERY behavioural event goes through here.
//
// If the user hasn't opted in (lib/consent.js), this is a hard no-op: the server
// action is never called, so no sessionId, IP, or user-agent is ever recorded for
// a non-consenting visitor. Once they Accept, events flow normally and carry the
// persistent (consent-gated) sessionId so a session funnel can be reconstructed.
//
// Usage:  import { track } from '@/lib/track';
//         track({ eventType: 'deal_click', supermarket, discountId });
// Do NOT call the trackEvent server action directly from components — it bypasses
// the gate.
'use client';

import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { hasAnalyticsConsent } from '@/lib/consent';

export function track(event) {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return; // opt-in gate — silent no-op before consent
  const sessionId = getSessionId();
  // Fire-and-forget; analytics must never block UI or surface errors to the user.
  trackEvent({ ...event, sessionId }).catch(() => {});
}
