// Move stored product-photo URLs from Cloudflare's r2.dev development host to
// the custom image domain. Re-runnable; dry run unless APPLY=1.
//
// Why: on 2026-09-23, 59,557 stored URLs pointed at pub-….r2.dev, the host
// Cloudflare rate-limits and documents as not for production, and which sends
// no Cache-Control. The objects stay exactly where they are in the bucket;
// only the host in front of each key changes.
//
// Order (CONTEXT.md, image domain): (1) the custom domain is live on the R2
// bucket, (2) R2_PUBLIC_URL is changed in GitHub secrets AND Vercel, so new
// scrapes write the new host, (3) this script. Rows scraped between (2) and
// (3), or before (2) finished, are caught by simply running it again.
//
// Before writing anything it fetches a random sample of photos from BOTH hosts
// and aborts unless every one comes back from the new host as the same file
// (HTTP 200, an image content type, identical byte length). Pointing 59k rows
// at a domain that is not serving yet would blank every photo on the site.
//
// Usage:
//   NEW_IMAGE_BASE=https://images.prosforespantou.gr node src/scripts/rewrite-image-host.mjs
//   NEW_IMAGE_BASE=https://images.prosforespantou.gr APPLY=1 node src/scripts/rewrite-image-host.mjs
// Optional: OLD_IMAGE_BASE (auto-detected when the DB holds exactly one r2.dev
// host), SAMPLE (per table, default 20), BATCH (rows per UPDATE, default 5000).
import 'dotenv/config';
import { normalizeBase, rewriteBase, likePrefix } from './lib/image-host.mjs';

const APPLY = process.env.APPLY === '1';
const SAMPLE = Number(process.env.SAMPLE || 20);
const BATCH = Number(process.env.BATCH || 5000);
// Every column that stored an r2.dev URL on 2026-09-23. pending_matches was
// missing from the first plan: the Review Queue would have kept the old host.
const TABLES = ['discounts', 'products', 'pending_matches'];
// Pairs with likePrefix(): the pattern escapes % and _ with a backslash, so
// every LIKE must name it. Spelled once, because a lost backslash here turns
// into ESCAPE '' and silently stops matching bases that contain _ or %.
const ESCAPE = "escape '\\'";

const { default: prisma } = await import('../lib/prisma.ts');

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exitCode = 1;
}

async function detectOldBase() {
  if (process.env.OLD_IMAGE_BASE) return normalizeBase(process.env.OLD_IMAGE_BASE);
  const hosts = new Set();
  for (const t of TABLES) {
    const rows = await prisma.$queryRawUnsafe(
      `select distinct 'https://' || split_part(image_url, '/', 3) as base
       from "${t}" where image_url like 'https://%.r2.dev/%'`);
    for (const r of rows) if (r.base) hosts.add(r.base);
  }
  if (hosts.size === 0) return null;
  if (hosts.size > 1) throw new Error(`several r2.dev hosts in the DB (${[...hosts].join(', ')}) — set OLD_IMAGE_BASE`);
  return [...hosts][0];
}

async function fetchImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    return {
      status: res.status,
      type: res.headers.get('content-type') || '',
      cacheControl: res.headers.get('cache-control'),
      bytes: body ? body.length : null,
    };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.message };
  }
}

// Same file on both hosts, or a reason why not.
async function preflight(oldBase, newBase, like) {
  const urls = [];
  for (const t of TABLES) {
    const rows = await prisma.$queryRawUnsafe(
      `select image_url from "${t}" where image_url like $1 ${ESCAPE} order by random() limit ${SAMPLE}`, like);
    urls.push(...rows.map((r) => r.image_url));
  }
  console.log(`\npreflight: fetching ${urls.length} random photos from both hosts…`);
  const problems = [];
  let oldUnreachable = 0;
  let cacheControl = null;
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(urls.slice(i, i + 4).map(async (oldUrl) => {
      const newUrl = rewriteBase(oldUrl, oldBase, newBase);
      const [o, n] = await Promise.all([fetchImage(oldUrl), fetchImage(newUrl)]);
      cacheControl ??= n.cacheControl;
      if (n.status !== 200) return problems.push(`${newUrl} → ${n.status || n.error}`);
      if (!n.type.startsWith('image/')) return problems.push(`${newUrl} → content-type "${n.type}" (not an image)`);
      // The old host can be unreachable from one network (it was from a VPN on
      // 2026-09-17); the new host must still serve, but the size check needs both.
      if (o.status !== 200) { oldUnreachable++; return; }
      if (o.bytes !== n.bytes) problems.push(`${newUrl} → ${n.bytes} bytes, old host has ${o.bytes}`);
    }));
  }
  console.log(`   new host served ${urls.length - problems.length}/${urls.length}`
    + (oldUnreachable ? ` (${oldUnreachable} not size-checked: old host unreachable from here)` : ''));
  console.log(`   Cache-Control on the new host: ${cacheControl ?? '(none)'}`);
  return problems;
}

async function main() {
  const rawNew = process.env.NEW_IMAGE_BASE
    || (process.env.R2_PUBLIC_URL && !/\.r2\.dev/.test(process.env.R2_PUBLIC_URL) ? process.env.R2_PUBLIC_URL : '');
  if (!rawNew) return fail('set NEW_IMAGE_BASE, e.g. https://images.prosforespantou.gr');
  const newBase = normalizeBase(rawNew);
  const oldBase = await detectOldBase();
  if (!oldBase) { console.log('No r2.dev URLs left in the DB — nothing to do.'); return; }
  if (oldBase === newBase) return fail('old and new base are the same');
  const like = likePrefix(oldBase);

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${oldBase}  →  ${newBase}`);
  for (const t of TABLES) {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `select count(*)::int as n from "${t}" where image_url like $1 ${ESCAPE}`, like);
    console.log(`   ${t.padEnd(16)} ${String(n).padStart(6)} rows`);
  }

  const problems = await preflight(oldBase, newBase, like);
  if (problems.length) {
    for (const p of problems.slice(0, 10)) console.error(`   ✗ ${p}`);
    if (problems.length > 10) console.error(`   … and ${problems.length - 10} more`);
    return fail(`the new host is not serving these photos yet — nothing was written. Is the custom domain active on the bucket?`);
  }
  console.log('   ✓ every sampled photo is served by the new host, byte for byte');

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with APPLY=1 to rewrite.'); return; }

  for (const t of TABLES) {
    let total = 0;
    for (;;) {
      const n = await prisma.$executeRawUnsafe(
        `update "${t}" set image_url = $1 || substring(image_url from $2)
         where id in (select id from "${t}" where image_url like $3 ${ESCAPE} limit ${BATCH})`,
        newBase, oldBase.length + 1, like);
      total += n;
      if (n === 0) break;
      process.stdout.write(`\r   ${t}: ${total} rewritten`);
    }
    const [{ left }] = await prisma.$queryRawUnsafe(
      `select count(*)::int as left from "${t}" where image_url like $1 ${ESCAPE}`, like);
    console.log(`\r   ${t}: ${total} rewritten, ${left} left on the old host`);
  }
  console.log('\nDone. Cached pages keep the old URLs until they refresh (5 min); the old host still serves, so nothing breaks meanwhile.');
}

try { await main(); } finally { await prisma.$disconnect(); }
