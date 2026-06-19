// Image mirroring for chains whose image host blocks off-site fetches.
//
// www.ab.gr (Akamai) 403s the Vercel image optimizer, plain node fetches and
// even local browsers — but the GitHub Actions runner that executes the AB
// adapter CAN reach it (same context that fetches the offers API). So the
// adapter downloads each offer image during the scrape and re-uploads it to a
// public Supabase Storage bucket; the item's imageUrl is rewritten to the
// mirror before ingestOffers() writes it. ingest-offers refreshes imageUrl on
// every update, so previously-written rows heal on the next scheduled run.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_URL, falling back to
// NEXT_PUBLIC_SUPABASE_URL). Without credentials this is a NO-OP that leaves
// the original URLs untouched and raises a report warning — image mirroring is
// progressive enhancement, never a reason to fail an ingest.
//
// Object paths are deterministic (sha1 of the source URL), so re-runs cheaply
// HEAD the public URL and skip images that are already mirrored. Offers that
// repeat across weeks reuse the same object — the bucket grows only with
// genuinely new artwork.

import { createHash } from 'node:crypto';
import { resolveR2Config, makeR2Backend } from './r2-storage.mjs';

export const BUCKET = 'chain-images';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → { url, key } or null when unset.
export function resolveStorageConfig(env = process.env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

// True for an imageUrl already living on either mirror (Supabase or R2). Used to
// skip re-mirroring and to count mirrored coverage. R2 public bases are the
// configured R2_PUBLIC_URL plus the generic Cloudflare hosts.
export function isMirroredUrl(url, env = process.env) {
  if (!url) return false;
  if (url.includes(`/storage/v1/object/public/${BUCKET}/`)) return true;
  const r2Public = (env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (r2Public && url.startsWith(r2Public)) return true;
  return /(^|\.)r2\.dev\//.test(url) || url.includes('.r2.cloudflarestorage.com/');
}

// Supabase Storage as a mirror backend (the original; kept as the fallback when
// R2 isn't configured). Matches the { kind, publicUrlFor, upload, ensure } shape.
function makeSupabaseBackend(config = resolveStorageConfig()) {
  if (!config) return null;
  const { url, key } = config;
  return {
    kind: 'supabase',
    publicUrlFor: (path) => `${url}/storage/v1/object/public/${BUCKET}/${path}`,
    async ensure() {
      const res = await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      });
      if (res.ok) return;
      const body = await res.text();
      if (/exist|duplicate/i.test(body)) return;
      throw new Error(`bucket create HTTP ${res.status}: ${body.slice(0, 200)}`);
    },
    async upload(path, bytes, contentType) {
      const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
        signal: AbortSignal.timeout(20000),
      });
      if (!up.ok) throw new Error(`upload HTTP ${up.status}: ${(await up.text()).slice(0, 120)}`);
    },
  };
}

// Prefer R2 (10 GB free + free egress) when configured; otherwise Supabase.
export function resolveMirrorBackend() {
  const r2 = makeR2Backend(resolveR2Config());
  if (r2) return r2;
  return makeSupabaseBackend();
}

// Deterministic bucket path for a source URL: <chain>/<sha1-prefix><ext>.
export function mirrorPathFor(chain, srcUrl) {
  const hash = createHash('sha1').update(srcUrl).digest('hex').slice(0, 20);
  let ext = '.jpg';
  try {
    const m = new URL(srcUrl).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    if (m) ext = m[0].toLowerCase();
  } catch { /* not a parseable URL — hash still works, keep .jpg */ }
  return `${chain}/${hash}${ext}`;
}

export function publicUrlFor(storageUrl, path) {
  return `${storageUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Mirror every item whose imageUrl matches `match` and rewrite it in place.
// Never throws for per-image failures — those keep their original URL and are
// counted. Returns { enabled, attempted, mirrored, reused, failed, warnings }.
//
// `maxNew` caps fresh downloads per run (HEAD-reuses are free and uncapped) —
// for callers on a serverless clock (the masoutis Vercel cron, 300s): the
// first run mirrors a slice, every run after that picks up where it left off,
// and within a few days the whole catalog is HEAD-reuse.
// `rewrite` maps a source URL to the variant worth keeping forever (e.g.
// mymarket medium → original) before download/hashing.
// `concurrency` / MIRROR_CONCURRENCY controls parallel HEAD/download/upload
// workers; maxNew is still shared across the whole run.
export async function mirrorImages({
  chain,
  items,
  match,
  headers = {},
  paceMs = 150,
  maxNew = Infinity,
  rewrite = null,
  concurrency = parseInt(process.env.MIRROR_CONCURRENCY || '3', 10),
}) {
  const result = { enabled: false, attempted: 0, mirrored: 0, reused: 0, failed: 0, skipped: 0, warnings: [] };

  const backend = resolveMirrorBackend();
  if (!backend) {
    result.warnings.push(
      'Image mirroring skipped — no storage backend configured (set R2_* or SUPABASE_* env). Original chain image URLs kept.'
    );
    return result;
  }
  try {
    if (backend.ensure) await backend.ensure();
  } catch (e) {
    result.warnings.push(`Image mirroring skipped — ${e.message}`);
    return result;
  }
  result.enabled = true;

  const candidates = [];
  for (const item of items) {
    let src = item.imageUrl;
    if (!src || !match(src)) continue;
    if (rewrite) src = rewrite(src) || src;
    result.attempted++;
    const path = mirrorPathFor(chain, src);
    candidates.push({ item, src, publicUrl: backend.publicUrlFor(path), path });
  }

  let lastError = null;
  let nextIndex = 0;
  let freshDownloadsReserved = 0;
  const parsedConcurrency = parseInt(concurrency, 10);
  const workerCount = Math.max(1, Math.min(
    candidates.length || 1,
    Number.isFinite(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 1
  ));

  async function mirrorOne({ item, src, publicUrl, path }) {
    try {
      // Already mirrored on a previous run? Public-bucket HEAD needs no auth.
      // Per-request timeouts so one hung fetch can't stall the whole run.
      const head = await fetch(publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      if (head.ok) {
        item.imageUrl = publicUrl;
        result.reused++;
        return;
      }

      if (freshDownloadsReserved >= maxNew) { result.skipped++; return; }
      freshDownloadsReserved++;

      const dl = await fetch(src, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const contentType = dl.headers.get('content-type') || '';
      if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
      // Akamai block pages come back 200 text/html — never publish those.
      if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType.split(';')[0]})`);
      const bytes = Buffer.from(await dl.arrayBuffer());
      if (bytes.byteLength < 100) throw new Error(`suspiciously small body (${bytes.byteLength} bytes)`);

      await backend.upload(path, bytes, contentType);

      item.imageUrl = publicUrl;
      result.mirrored++;
      await sleep(paceMs); // pace only actual chain downloads, not HEAD skips
    } catch (e) {
      result.failed++;
      lastError = e.message;
    }
  }

  async function worker() {
    while (nextIndex < candidates.length) {
      const current = candidates[nextIndex++];
      await mirrorOne(current);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (result.failed > 0) {
    result.warnings.push(
      `${result.failed}/${result.attempted} image mirrors failed (last: ${lastError}) — original chain URLs kept for those.`
    );
  }
  console.log(
    `   🖼️ image mirror: ${result.mirrored} uploaded, ${result.reused} already mirrored, ${result.failed} failed, ${result.skipped} deferred (of ${result.attempted})`
  );
  return result;
}
