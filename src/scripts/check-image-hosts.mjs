// Watchdog for the hosts that serve product photos.
//
// 77% of live offer images (and 30,869 product records) are served from
// Cloudflare's shared `pub-….r2.dev` address. Cloudflare rate-limits that host
// and documents it as not for production use, but publishes no limit and sends
// no warning — if we cross it, photos simply stop loading for some visitors and
// nothing in our own logs would say so. Until the bucket gets a custom domain
// (owner decision, 2026-09-17), this is how we find out.
//
// Read-only. Samples live offer images per host, fetches each one, and fails
// the run when a host drops below the success threshold — so a broken image
// host arrives as a red workflow run and an email, not as a bounce rate.
//
//   node src/scripts/check-image-hosts.mjs
//   SAMPLE=10 node src/scripts/check-image-hosts.mjs      # quick local check
//
// Env: SAMPLE (images per host, default 40), TIMEOUT_MS (default 15000),
//      MIN_OK_PCT (default 90), MIN_IMAGES (default 25), CONCURRENCY (default 6).
//
// A host serving a handful of images is a leftover hotlink, not an outage: it
// is reported as a straggler to re-mirror, and only a host above MIN_IMAGES can
// fail the run. Otherwise one stale URL would cry wolf every morning and the
// alarm would be ignored by the time it mattered.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SAMPLE = parseInt(process.env.SAMPLE || '40', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '15000', 10);
const MIN_OK_PCT = parseFloat(process.env.MIN_OK_PCT || '90');
const MIN_IMAGES = parseInt(process.env.MIN_IMAGES || '25', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '6', 10);

const { default: prisma } = await import('../lib/prisma.ts');

const hostOf = (url) => {
  try { return new URL(url).host; } catch { return null; }
};

// A GET, not a HEAD: some object stores answer HEAD from a different path and
// we want to know that the BYTES arrive, which is what a visitor needs.
async function probe(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const buf = await res.arrayBuffer();
    return {
      ok: res.ok && buf.byteLength > 0,
      status: res.status,
      bytes: buf.byteLength,
      ms: Date.now() - started,
      contentType: res.headers.get('content-type') || '',
      cacheControl: res.headers.get('cache-control'),
    };
  } catch (err) {
    return { ok: false, status: 0, bytes: 0, ms: Date.now() - started, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const now = new Date();
const rows = await prisma.discount.findMany({
  where: { isActive: true, validUntil: { gt: now }, imageUrl: { not: null } },
  select: { imageUrl: true, supermarket: true },
});

// Stratify by host: a host serving 100 images matters as much as one serving
// 10,000 when the question is "is it up?".
const byHost = new Map();
for (const r of rows) {
  const host = hostOf(r.imageUrl);
  if (!host) continue;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(r);
}

console.log(`Live offer images: ${rows.length} across ${byHost.size} host(s). Sampling up to ${SAMPLE} per host.\n`);

let failedHosts = 0;
const summary = [];
const stragglers = []; // small hosts we never mirrored; broken, but not an outage

for (const [host, all] of [...byHost.entries()].sort((a, b) => b[1].length - a[1].length)) {
  // Evenly spaced through the list rather than the first N, so one bad prefix
  // (a single chain, a single upload batch) cannot masquerade as the whole host.
  const step = Math.max(1, Math.floor(all.length / SAMPLE));
  const picked = [];
  for (let i = 0; i < all.length && picked.length < SAMPLE; i += step) picked.push(all[i]);

  const results = await mapLimited(picked, CONCURRENCY, (r) => probe(r.imageUrl));
  const ok = results.filter((r) => r.ok).length;
  const pct = (ok / results.length) * 100;
  const times = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const p50 = times.length ? times[Math.floor(times.length / 2)] : 0;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)] : 0;
  const cached = results.filter((r) => r.ok && r.cacheControl).length;

  const healthy = pct >= MIN_OK_PCT;
  const major = all.length >= MIN_IMAGES;
  if (!healthy && major) failedHosts++;
  if (!healthy && !major) stragglers.push({ host, count: all.length, examples: [] });

  const label = healthy ? 'OK  ' : major ? 'FAIL' : 'note';
  console.log(`${label} ${host}`);
  console.log(`     serves ${all.length} live offer images; sampled ${results.length}`);
  console.log(`     reachable: ${ok}/${results.length} (${pct.toFixed(1)}%), p50 ${p50}ms, p95 ${p95}ms`);
  console.log(`     Cache-Control present on ${cached}/${ok} successful responses`);
  const bad = results.map((r, i) => ({ r, url: picked[i].imageUrl })).filter((x) => !x.r.ok);
  for (const b of bad.slice(0, 3)) {
    console.log(`     ! ${b.r.error || 'HTTP ' + b.r.status} — ${b.url}`);
  }
  if (!healthy && !major) {
    stragglers[stragglers.length - 1].examples = bad.slice(0, 3).map((b) => b.url);
  }
  console.log('');
  summary.push({ host, pct, p50, count: all.length, cached, ok });
}

// The custom-domain decision rides on this line: an address with no
// Cache-Control tells every browser to guess, so returning shoppers re-download
// photos we already sent them.
const uncached = summary.filter((s) => s.ok > 0 && s.cached === 0);
if (uncached.length > 0) {
  console.log(`Note: ${uncached.map((s) => s.host).join(', ')} send no Cache-Control at all — repeat visits re-download these images.`);
}

if (stragglers.length > 0) {
  console.log('Stragglers — offers still pointing at a chain CDN that is failing. Re-run the mirror for these:');
  for (const st of stragglers) {
    console.log(`  ${st.host} (${st.count} image${st.count === 1 ? '' : 's'})`);
    for (const ex of st.examples) console.log(`    ${ex}`);
  }
  console.log('');
}

if (failedHosts > 0) {
  console.error(`\n::error::${failedHosts} image host(s) below ${MIN_OK_PCT}% reachable — product photos are failing for visitors.`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log(
  `All ${summary.length - stragglers.length} major image host(s) at or above ${MIN_OK_PCT}% reachable` +
  (stragglers.length ? `; ${stragglers.length} straggler host(s) noted above.` : '.')
);
await prisma.$disconnect();
