import { hasAnalyticsConsent } from '@/lib/consent';

// Persistent anonymous analytics id. Gated on consent: without an explicit opt-in
// we neither create nor return an id, so no behavioural session can be stitched
// together (the GDPR default-off state). lib/track.js is the only caller path.
export function getSessionId() {
  if (typeof window === 'undefined') return null;
  if (!hasAnalyticsConsent()) return null;
  let id = localStorage.getItem('sid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sid', id);
  }
  return id;
}
