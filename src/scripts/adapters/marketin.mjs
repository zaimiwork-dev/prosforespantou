// Market In adapter (owner 2026-11-23: «market in literally has an online shop»).
//
// Usage:
//   FEED=leaflet node src/scripts/adapters/marketin.mjs   # «ΦΥΛΛΑΔΙΟ ΠΡΟΣΦΟΡΩΝ»
//   FEED=web     node src/scripts/adapters/marketin.mjs   # «WEB ONLY ΠΡΟΣΦΟΡΕΣ»
//   DRY_RUN=1 …                                           # fetch + map, no DB writes
//
// Source: the shop's own offer listings (lib/marketin-api). The shop publishes
// one price per offer — the old price is hidden in its HTML — so these are
// single-price offers (offerType 'mono', no «Αρχική»). The listing gives no
// dates, so the cards say «Σε ισχύ · ελέγχθηκε …» like other date-less feeds.
// Item code = the shop's product id; the daily catalogue run maps every id to
// a product first, so offers link without a name match.
import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { loadOffers, largeImage, isThumb, sleep, PACE_MS } from '../lib/marketin-api.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const FEED = process.env.FEED;
if (FEED !== 'web' && FEED !== 'leaflet') {
  console.error('FEED must be "web" or "leaflet"');
  process.exit(2);
}

async function run() {
  console.log(`🛒 Market In adapter — ${FEED}${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const { items: listed, total, complete } = await loadOffers(FEED);
  console.log(`   listing: ${listed.length} of ${total ?? '?'} stated${complete ? '' : ' — INCOMPLETE'}`);

  // The shop itself says this listing is empty (the web-only list often is):
  // that is «no offers today», not a broken scrape. Switch off yesterday's
  // ones (soft delete) instead of reporting a failure.
  if (total === 0 && listed.length === 0) {
    if (DRY_RUN) { console.log('   the shop lists no offers here today (DRY_RUN — nothing changed)'); return; }
    const { default: prisma } = await import('../../lib/prisma.ts');
    const r = await prisma.discount.updateMany({
      where: { supermarket: 'marketin', source: FEED, isActive: true },
      data: { isActive: false },
    });
    console.log(`   the shop lists no offers here today — ${r.count} earlier ones switched off`);
    await prisma.$disconnect();
    return;
  }

  // The 800×800 photo instead of the listing's 200×200 thumbnail: reuse the
  // one an earlier run found for the item, read the product page only for the
  // rest (~520 pages on the first run, then the day's new offers).
  const { default: prisma } = await import('../../lib/prisma.ts');
  const known = new Map();
  for (const d of await prisma.discount.findMany({
    where: { supermarket: 'marketin', chainItemcode: { in: listed.map((it) => it.id) }, imageUrl: { not: null } },
    select: { chainItemcode: true, imageUrl: true },
  })) if (d.imageUrl && !isThumb(d.imageUrl)) known.set(d.chainItemcode, d.imageUrl);
  let fetched = 0;
  let failed = 0;
  for (const it of listed) {
    if (known.has(it.id)) { it.imageUrl = known.get(it.id); continue; }
    try {
      const big = await largeImage(it.url);
      if (big) it.imageUrl = big;
      fetched++;
    } catch {
      failed++; // keep the thumbnail
    }
    await sleep(PACE_MS);
  }
  console.log(`   photos: ${known.size} reused, ${fetched} product pages read, ${failed} failed (thumbnail kept)`);

  const items = listed.map((it) => ({
    name: it.name,
    price: it.price,
    originalPrice: null,
    chainItemcode: it.id,
    category: it.department ?? 'Άλλο',
    imageUrl: it.imageUrl,
    offerType: 'mono',
  }));
  const report = await ingestOffers({
    chain: 'marketin',
    source: FEED,
    items,
    dryRun: DRY_RUN,
    partial: !complete,
    siteTotal: total ?? null,
    extraWarnings: complete ? [] : [`Market In ${FEED} listing incomplete (${listed.length} of ${total}) — stale offers were not deactivated.`],
  });
  printReport(report);
  process.exit(report.healthOk || DRY_RUN ? 0 : 1);
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
