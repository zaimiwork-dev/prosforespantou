// Self-host the CATALOG images (Product.imageUrl) on the Supabase mirror.
//
// The per-adapter image mirroring covers OFFER images (Discount.imageUrl). This
// companion covers the rest of the catalog — the non-offer Product rows that the
// browsable full catalog renders — so a product keeps its picture even if a
// chain CDN blocks us or rotates its URLs. Reuses lib/mirror-images.mjs, then
// writes the rewritten URL back onto the Product row.
//
// Per-chain because image hosts differ and some IP-block datacenter ranges:
//   CHAIN=kritikos    → s3.eu-central-1.amazonaws.com/w4ve/kritikos  (any IP)
//   CHAIN=ab          → www.ab.gr                                    (CI only)
//   CHAIN=mymarket    → cdn.mymarket.gr
//   CHAIN=masoutis    → masoutisimagesneu.blob.core.windows.net
//   CHAIN=lidl        → imgproxy-retcat.assets.schwarz  (any IP)
//   CHAIN=sklavenitis → s1.sklavenitis.gr        (needs PROXY_URL / residential)
// Run it wherever the host is reachable (CI for ab/kritikos/mymarket/masoutis;
// PROXY_URL or this dev PC for sklavenitis). Images the offer adapters already
// uploaded are free HEAD-reuses here (same source URL → same object path).
//
// Usage:
//   CHAIN=kritikos node src/scripts/mirror-catalog.mjs
//   CHAIN=sklavenitis PROXY_URL=http://user:pass@host:port node src/scripts/mirror-catalog.mjs
//   CHAIN=kritikos DRY_RUN=1 node src/scripts/mirror-catalog.mjs   # no DB writes
//   MIRROR_MAX_NEW=500 MIRROR_CONCURRENCY=8 QUERY_LIMIT=2000 ...   # tune the drain
//
// dotenv first (ESM hoist trap — DB import comes later).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
const CHAIN = (process.env.CHAIN || '').trim().toLowerCase();
const MIRROR_MAX_NEW = parseInt(process.env.MIRROR_MAX_NEW || '1500', 10);
const QUERY_LIMIT = parseInt(process.env.QUERY_LIMIT || '3000', 10);

// chain → substrings that identify its image host in a Product.imageUrl.
const HOST_MATCH = {
  kritikos: ['/w4ve/kritikos/', 's3.eu-central-1.amazonaws.com'],
  ab: ['www.ab.gr'],
  mymarket: ['mymarket.gr'],
  masoutis: ['blob.core.windows.net'],
  sklavenitis: ['sklavenitis.gr'],
  lidl: ['assets.schwarz', 'lidl-hellas.gr'], // schwarz imgproxy + own /assets/ host
  wolt: ['wolt.com'], // mostly dead links; low yield, kept for completeness
};

async function run() {
  if (!HOST_MATCH[CHAIN]) {
    console.error(`Set CHAIN to one of: ${Object.keys(HOST_MATCH).join(', ')}`);
    process.exit(1);
  }

  const { installProxyFromEnv } = await import('./lib/proxy-fetch.mjs');
  const { mirrorImages } = await import('./lib/mirror-images.mjs');
  const { default: prisma } = await import('../lib/prisma.ts');

  installProxyFromEnv(); // residential proxy for blocked hosts (no-op without PROXY_URL)

  const hosts = HOST_MATCH[CHAIN];
  console.log(`🖼️  catalog mirror — chain=${CHAIN} hosts=[${hosts.join(', ')}]${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  // Candidate Products: image still on the chain host, not yet on the mirror.
  // One OR clause per host substring; exclude anything already mirrored.
  const candidates = await prisma.product.findMany({
    where: {
      AND: [
        { OR: hosts.map((h) => ({ imageUrl: { contains: h } })) },
        { imageUrl: { not: { contains: '/storage/v1/object/public/chain-images/' } } },
      ],
    },
    select: { id: true, imageUrl: true },
    take: QUERY_LIMIT,
  });
  console.log(`   ${candidates.length} catalog images to consider (cap ${QUERY_LIMIT})`);
  if (candidates.length === 0) { await prisma.$disconnect(); return; }

  // mirrorImages mutates item.imageUrl in place; remember the originals so we
  // only write back rows that actually changed.
  const items = candidates.map((p) => ({ id: p.id, imageUrl: p.imageUrl, _orig: p.imageUrl }));
  const result = await mirrorImages({
    chain: CHAIN,
    items,
    match: (u) => hosts.some((h) => u.includes(h)),
    maxNew: MIRROR_MAX_NEW,
  });

  let written = 0;
  if (!DRY_RUN) {
    for (const it of items) {
      if (it.imageUrl && it.imageUrl !== it._orig) {
        await prisma.product.update({ where: { id: it.id }, data: { imageUrl: it.imageUrl } }).catch(() => {});
        written++;
        if (written % 500 === 0) process.stdout.write(`\r   wrote ${written} Product.imageUrl…   `);
      }
    }
  }

  console.log(
    `\n🏁 catalog mirror done — uploaded=${result.mirrored} reused=${result.reused} ` +
    `failed=${result.failed} deferred=${result.skipped} → Product rows updated=${written}` +
    `${candidates.length === QUERY_LIMIT ? ' (hit QUERY_LIMIT — re-run to continue draining)' : ''}`
  );
  for (const w of result.warnings) console.log(`   ⚠️ ${w}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
