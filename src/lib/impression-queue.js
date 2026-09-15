// Pure queue behind lib/impressions.js: dedupe per page load, a hard per-session
// cap, and batch draining. No browser APIs here so it is unit-testable.

// A long scroll through /deals can put hundreds of cards on screen. 200 per
// browser session is plenty to learn from and bounds the table's growth.
export const IMPRESSION_CAP = 200;
// Flush early when this many are waiting (the timer covers the rest).
export const FLUSH_SIZE = 25;
// Server-side batch limit (trackImpressions accepts at most 50 items).
export const BATCH_MAX = 50;

export function surfaceFromPath(pathname) {
  const p = String(pathname || '/');
  if (p === '/') return 'home';
  const first = p.split('/').filter(Boolean)[0] || 'home';
  return first.slice(0, 64);
}

export function createImpressionQueue({ cap = IMPRESSION_CAP, initialCount = 0 } = {}) {
  const seen = new Set();
  let pending = [];
  let count = Math.max(0, initialCount | 0);

  return {
    // Returns true when the impression was queued.
    add(item) {
      if (!item || !item.discountId || !item.page) return false;
      const key = `${item.page}:${item.discountId}`;
      if (seen.has(key) || count >= cap) return false;
      seen.add(key);
      pending.push(item);
      count += 1;
      return true;
    },
    drain(max = BATCH_MAX) {
      const batch = pending.slice(0, max);
      pending = pending.slice(max);
      return batch;
    },
    size() {
      return pending.length;
    },
    count() {
      return count;
    },
  };
}
