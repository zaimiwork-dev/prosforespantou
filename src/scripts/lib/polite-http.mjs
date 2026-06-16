// Small safety helpers for autonomous scrapers.
//
// Goals:
// - never hang forever on a chain/CDN request;
// - honor Retry-After on throttles;
// - retry transient 429/5xx responses gently;
// - do NOT retry hard blocks such as 403, which only risks making a block worse.

export function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pace(baseMs, jitterMs = Math.floor(baseMs * 0.4)) {
  if (!baseMs || baseMs <= 0) return;
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  await sleep(baseMs + jitter);
}

function retryAfterMs(res) {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

export async function fetchWithBackoff(url, options = {}, {
  label = url,
  retries = envInt('FETCH_RETRIES', 2),
  timeoutMs = envInt('FETCH_TIMEOUT_MS', 30000),
  baseDelayMs = envInt('FETCH_BACKOFF_MS', 2000),
  maxDelayMs = envInt('FETCH_MAX_BACKOFF_MS', 60000),
  retryStatuses = [429, 500, 502, 503, 504],
} = {}) {
  const retryable = new Set(retryStatuses);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : options.signal;
      const res = await fetch(url, { ...options, signal });

      // 403/401/404 are returned as-is. Callers decide what to do, but we do
      // not retry a likely block or a genuine missing resource.
      if (!retryable.has(res.status) || attempt >= retries) return res;

      const wait = retryAfterMs(res) ??
        Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 750);
      console.log(`   ${label} HTTP ${res.status}; backing off ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    } catch (e) {
      lastError = e;
      if (attempt >= retries) throw e;
      const wait = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 750);
      console.log(`   ${label} failed (${e.message}); retry ${attempt + 1}/${retries} in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }

  throw lastError || new Error(`${label} failed`);
}
