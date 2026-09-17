// Impression tracking: a card counts as SEEN when at least half of it is on
// screen for a full second. Impressions are queued and sent in batches (every
// 5 s, at 25 waiting, and when the page is hidden) through the
// trackImpressions server action.
//
// Impressions are the denominator every ranking question needs — a click count
// alone cannot tell a bad card from an unseen one.
//
// Same three modes as lib/track.js (see lib/analytics-mode). In the anonymous
// mode nothing may touch device storage, so the per-session impression counter
// below stays in memory and the cap applies per page load instead of per tab.
// Components call observeImpression(); never the action.
'use client';

import { trackImpressions } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { getVisitId } from '@/lib/visit-id';
import { analyticsMode } from '@/lib/analytics-mode';
import { createImpressionQueue, FLUSH_SIZE, BATCH_MAX } from '@/lib/impression-queue';

const VISIBLE_MS = 1000;
const FLUSH_MS = 5000;
const COUNT_KEY = 'pp-impr-count';

let queue = null;
let timer = null;
let observer = null;
const targets = new Map(); // element -> { item, timeout }

// True when this visitor is one we already store something for — consented, or
// carrying a tab-scoped visit id. The pure anonymous visitor is never touched.
const mayUseStorage = () => analyticsMode() === 'identified' || Boolean(getVisitId());

function getQueue() {
  if (!queue) {
    let used = 0;
    // Reading sessionStorage IS access to the device, so the counter persists
    // across page loads only for a visitor we are already allowed to store
    // something for: a consented one, or one carrying a tab-scoped visit id.
    // For everyone else the cap applies per page load and nothing is touched.
    if (mayUseStorage()) {
      try { used = parseInt(window.sessionStorage.getItem(COUNT_KEY) || '0', 10) || 0; } catch { /* blocked storage */ }
    }
    queue = createImpressionQueue({ initialCount: used });
  }
  return queue;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  const q = getQueue();
  if (q.size() === 0) return;
  const mode = analyticsMode();
  // Consent withdrawn since queueing, or the flag is off → drop silently.
  if (mode === 'off') return;
  // With a tab-scoped visit id (lib/visit-id, off by default) the server can
  // build its dedup key again; without one the client queue is the only guard.
  const sessionId = mode === 'identified' ? getSessionId() : getVisitId() ?? undefined;
  if (mode === 'identified' && !sessionId) return;
  while (q.size() > 0) {
    const items = q.drain(BATCH_MAX);
    trackImpressions(sessionId ? { sessionId, items } : { items }).catch(() => {});
  }
  if (mayUseStorage()) {
    try { window.sessionStorage.setItem(COUNT_KEY, String(q.count())); } catch { /* blocked storage */ }
  }
}

function schedule() {
  if (getQueue().size() >= FLUSH_SIZE) { flush(); return; }
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

function getObserver() {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const t = targets.get(entry.target);
      if (!t) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (t.timeout) continue;
        const el = entry.target;
        t.timeout = setTimeout(() => {
          t.timeout = null;
          if (getQueue().add(t.item)) schedule();
          observer.unobserve(el);
          targets.delete(el);
        }, VISIBLE_MS);
      } else if (t.timeout) {
        clearTimeout(t.timeout);
        t.timeout = null;
      }
    }
  }, { threshold: [0, 0.5] });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return observer;
}

// Returns a cleanup function (call it from the effect's teardown).
export function observeImpression(el, item) {
  if (!el || typeof window === 'undefined' || analyticsMode() === 'off') return () => {};
  if (!item?.discountId || !item?.page) return () => {};
  const obs = getObserver();
  if (!obs) return () => {};
  targets.set(el, { item, timeout: null });
  obs.observe(el);
  return () => {
    const t = targets.get(el);
    if (t?.timeout) clearTimeout(t.timeout);
    targets.delete(el);
    obs.unobserve(el);
  };
}
