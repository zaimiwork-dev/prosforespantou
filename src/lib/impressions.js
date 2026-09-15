// Consent-gated impression tracking: a card counts as SEEN when at least half
// of it is on screen for a full second. Impressions are queued and sent in
// batches (every 5 s, at 25 waiting, and when the page is hidden) through the
// trackImpressions server action.
//
// Same gate as lib/track.js: without an explicit opt-in nothing is observed,
// queued or sent. Components call observeImpression(); never the action.
'use client';

import { trackImpressions } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { hasAnalyticsConsent } from '@/lib/consent';
import { createImpressionQueue, FLUSH_SIZE, BATCH_MAX } from '@/lib/impression-queue';

const VISIBLE_MS = 1000;
const FLUSH_MS = 5000;
const COUNT_KEY = 'pp-impr-count';

let queue = null;
let timer = null;
let observer = null;
const targets = new Map(); // element -> { item, timeout }

function getQueue() {
  if (!queue) {
    let used = 0;
    try { used = parseInt(window.sessionStorage.getItem(COUNT_KEY) || '0', 10) || 0; } catch { /* blocked storage */ }
    queue = createImpressionQueue({ initialCount: used });
  }
  return queue;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  const q = getQueue();
  if (q.size() === 0) return;
  const sessionId = getSessionId();
  while (q.size() > 0) {
    const items = q.drain(BATCH_MAX);
    // Consent withdrawn since queueing → drop silently.
    if (sessionId) trackImpressions({ sessionId, items }).catch(() => {});
  }
  try { window.sessionStorage.setItem(COUNT_KEY, String(q.count())); } catch { /* blocked storage */ }
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
  if (!el || typeof window === 'undefined' || !hasAnalyticsConsent()) return () => {};
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
