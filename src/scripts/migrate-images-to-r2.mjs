// One-time migration: copy the chain-images bucket from Supabase Storage to
// Cloudflare R2, then repoint Product/Discount.imageUrl from the Supabase base
// to the R2 base. Object keys are identical on both sides (<chain>/<sha>.<ext>),
// so the DB rewrite is a pure base-URL REPLACE.
//
// Why: Supabase free tier (1 GB storage, metered egress) can't host a growing
// multi-chain image set; R2 gives 10 GB free + unlimited free egress.
//
// Requires BOTH backends configured:
//   Supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   R2:       R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_PUBLIC_URL
//
// Safe sequence (each phase is idempotent / resumable):
//   1. node src/scripts/migrate-images-to-r2.mjs                 # copy objects → R2
//   2. node src/scripts/migrate-images-to-r2.mjs                 # re-run: should be all HEAD-reuse
//   3. REWRITE_DB=1 node src/scripts/migrate-images-to-r2.mjs    # flip imageUrl base in the DB
//   4. verify images load on prod, THEN delete the Supabase bucket by hand.
//
// Flags: DRY_RUN=1, REWRITE_DB=1, MAX=<n> (cap copies this run),
//        CONCURRENCY=<n> (default 8).

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { resolveStorageConfig, BUCKET } from './lib/mirror-images.mjs';
import { resolveR2Config, makeR2Backend } from './lib/r2-storage.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const REWRITE_DB = process.env.REWRITE_DB === '1';
const MAX = process.env.MAX ? parseInt(process.env.MAX, 10) : Infinity;
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '8', 10));

const supa = resolveStorageConfig();
const r2cfg = resolveR2Config();
if (!supa) { console.error('❌ Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
if (!r2cfg) { console.error('❌ R2 not configured (R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_PUBLIC_URL)'); process.exit(1); }
const r2 = makeR2Backend(r2cfg);

const supaPublicBase = `${supa.url}/storage/v1/object/public/${BUCKET}/`;
const r2PublicBase = `${r2cfg.publicUrl}/`;
const H = { Authorization: `Bearer ${supa.key}`, apikey: supa.key, 'Content-Type': 'application/json' };

async function listFolder(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${supa.url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`list ${prefix} HTTP ${res.status}`);
    const page = await res.json();
    for (const o of page) if (o.id) out.push(`${prefix}${o.name}`);
    if (page.length < 1000) break;
  }
  return out;
}

async function copyObjects() {
  // Discover chain folders at the bucket root.
  const rootRes = await fetch(`${supa.url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'name', order: 'asc' } }),
  });
  const root = await rootRes.json();
  const folders = root.filter((e) => !e.id).map((e) => `${e.name}/`); // folders have no id
  console.log(`Folders: ${folders.map((f) => f.replace('/', '')).join(', ') || '(none)'}`);

  let allKeys = [];
  for (const f of folders) {
    const keys = await listFolder(f);
    console.log(`  ${f.replace('/', '').padEnd(14)} ${keys.length} objects`);
    allKeys = allKeys.concat(keys);
  }
  console.log(`Total objects: ${allKeys.length}${DRY_RUN ? ' (DRY_RUN — no copy)' : ''}`);
  if (DRY_RUN) return;

  let copied = 0, reused = 0, failed = 0, done = 0;
  let idx = 0;
  async function worker() {
    while (idx < allKeys.length && copied < MAX) {
      const key = allKeys[idx++];
      try {
        // Resumable: skip if already on R2 (public HEAD, no auth).
        const head = await fetch(`${r2PublicBase}${encodeURI(key)}`, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        if (head.ok) { reused++; }
        else {
          const dl = await fetch(`${supaPublicBase}${encodeURI(key)}`, { signal: AbortSignal.timeout(20000) });
          if (!dl.ok) throw new Error(`supabase GET ${dl.status}`);
          const ct = dl.headers.get('content-type') || 'image/jpeg';
          const bytes = Buffer.from(await dl.arrayBuffer());
          await r2.upload(key, bytes, ct);
          copied++;
        }
      } catch (e) {
        failed++;
        if (failed <= 10) console.log(`   ⚠️ ${key}: ${e.message}`);
      }
      if (++done % 500 === 0) process.stdout.write(`\r   copied ${copied}, reused ${reused}, failed ${failed} (${done}/${allKeys.length})   `);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\nCopy done — copied ${copied}, reused ${reused}, failed ${failed} of ${allKeys.length}`);
  return { failed };
}

async function rewriteDb() {
  const { default: prisma } = await import('../lib/prisma.ts');
  console.log(`\nRewriting DB imageUrl base:\n  from ${supaPublicBase}\n  to   ${r2PublicBase}`);
  if (DRY_RUN) {
    const p = await prisma.product.count({ where: { imageUrl: { startsWith: supaPublicBase } } });
    const d = await prisma.discount.count({ where: { imageUrl: { startsWith: supaPublicBase } } });
    console.log(`  (DRY_RUN) would rewrite ${p} products + ${d} discounts`);
    await prisma.$disconnect();
    return;
  }
  const p = await prisma.$executeRaw`UPDATE products SET image_url = REPLACE(image_url, ${supaPublicBase}, ${r2PublicBase}) WHERE image_url LIKE ${supaPublicBase + '%'}`;
  const d = await prisma.$executeRaw`UPDATE discounts SET image_url = REPLACE(image_url, ${supaPublicBase}, ${r2PublicBase}) WHERE image_url LIKE ${supaPublicBase + '%'}`;
  console.log(`  rewrote ${p} products + ${d} discounts`);
  await prisma.$disconnect();
}

console.log(`R2 migration — Supabase chain-images → R2 (${r2cfg.bucket} @ ${r2cfg.publicUrl})`);
if (REWRITE_DB) {
  await rewriteDb();
} else {
  const res = await copyObjects();
  if (res?.failed) console.log('\n⚠️ Some objects failed to copy — re-run to retry (idempotent) before REWRITE_DB.');
  console.log('\nNext: verify R2 has the objects, then re-run with REWRITE_DB=1 to flip the DB URLs.');
}
