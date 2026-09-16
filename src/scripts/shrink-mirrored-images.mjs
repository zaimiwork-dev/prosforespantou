// Shrink the images already sitting in the mirror bucket, in place.
//
// The mirror downscales from 2026-09-16 (lib/shrink-image.mjs), but everything
// uploaded before that is still the chain's original: Κρητικός 1080px JPEGs,
// My Market 1000px PNGs — measured at 5-8 MB for one screen of 48 cards, on a
// site whose audience is on phones and whose image optimizer is off.
//
// This reads each object through the SIGNED S3 endpoint (not the rate-limited
// public r2.dev host), re-encodes it, and writes it back to the SAME key, so
// no URL changes and nothing in the database has to move. The object keeps its
// original extension and carries the real media type — browsers follow the
// header, not the suffix.
//
// Usage:
//   node src/scripts/shrink-mirrored-images.mjs                  # dry run, whole bucket
//   PREFIX=kritikos/ node src/scripts/shrink-mirrored-images.mjs # one chain
//   LIMIT=200 APPLY=1 node src/scripts/shrink-mirrored-images.mjs
//   MIN_BYTES=40000 APPLY=1 node src/scripts/shrink-mirrored-images.mjs
//
// Env: APPLY=1 writes (default is a dry run that only reports), PREFIX filters
// by key prefix, LIMIT caps objects processed, MIN_BYTES skips anything
// already smaller than that (default 30 KB), CONCURRENCY parallel workers
// (default 4).
//
// Safe to interrupt and re-run: an object that is already small is skipped by
// MIN_BYTES, and one that cannot be improved is left untouched.
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { resolveR2Config, makeR2Backend } from './lib/r2-storage.mjs';
import { shrinkImage } from './lib/shrink-image.mjs';

const APPLY = process.env.APPLY === '1';
const PREFIX = process.env.PREFIX || '';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const MIN_BYTES = parseInt(process.env.MIN_BYTES || '30000', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10));

const kb = (n) => `${Math.round(n / 1024)}KB`;
const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;

const backend = makeR2Backend(resolveR2Config());
if (!backend) {
  console.error('R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_URL).');
  process.exit(1);
}

console.log(`📦 listing bucket${PREFIX ? ` (prefix ${PREFIX})` : ''}…`);
const all = await backend.listObjects();
const candidates = all.filter((o) => (!PREFIX || o.key.startsWith(PREFIX)) && o.size >= MIN_BYTES);
// Biggest first by default — the objects that actually hurt a phone. SAMPLE=1
// shuffles instead, so a LIMITed dry run estimates the whole bucket honestly
// rather than reporting the tail.
if (process.env.SAMPLE === '1') candidates.sort(() => Math.random() - 0.5);
else candidates.sort((a, b) => b.size - a.size);
const work = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

const bucketBytes = all.reduce((n, o) => n + o.size, 0);
console.log(`   objects: ${all.length} (${mb(bucketBytes)}) | over ${kb(MIN_BYTES)}: ${candidates.length} | processing: ${work.length}${APPLY ? '' : '  [DRY RUN]'}`);

const stat = { read: 0, shrunk: 0, kept: 0, failed: 0, before: 0, after: 0 };
const byChain = new Map();
let next = 0;

async function worker() {
  for (;;) {
    const i = next++;
    if (i >= work.length) return;
    const { key, size } = work[i];
    const chain = key.split('/')[0];
    try {
      const { bytes, contentType } = await backend.download(key);
      stat.read++;
      const out = await shrinkImage(bytes, contentType);
      stat.before += bytes.length;
      stat.after += out.bytes.length;
      if (!out.changed) { stat.kept++; continue; }
      if (APPLY) await backend.upload(key, out.bytes, out.contentType);
      stat.shrunk++;
      const c = byChain.get(chain) || { n: 0, before: 0, after: 0 };
      c.n++; c.before += bytes.length; c.after += out.bytes.length;
      byChain.set(chain, c);
      if (stat.shrunk <= 5 || stat.shrunk % 250 === 0) console.log(`   ${key} — ${out.note}`);
    } catch (e) {
      stat.failed++;
      if (stat.failed <= 5) console.log(`   ⚠️  ${key} (${size}B): ${e.message.slice(0, 80)}`);
    }
    if (stat.read % 500 === 0) console.log(`   … ${stat.read}/${work.length} read, ${stat.shrunk} shrunk, saved ${mb(stat.before - stat.after)}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n🏁 ${APPLY ? 'shrunk' : 'would shrink'} ${stat.shrunk} objects, left ${stat.kept} alone, ${stat.failed} failed`);
console.log(`   ${mb(stat.before)} → ${mb(stat.after)} (${stat.before ? Math.round((1 - stat.after / stat.before) * 100) : 0}% smaller)`);
for (const [chain, c] of [...byChain].sort((a, b) => (b[1].before - b[1].after) - (a[1].before - a[1].after))) {
  console.log(`   ${chain.padEnd(12)} ${c.n} objects  ${mb(c.before)} → ${mb(c.after)}`);
}
if (!APPLY) console.log('\nDry run — APPLY=1 writes the smaller objects back to the same keys.');
