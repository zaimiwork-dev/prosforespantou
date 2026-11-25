// Market In full catalogue → Products + regular shelf prices (daily).
// Walks every department of www.market-in.gr (lib/marketin-api). The shop has
// no barcodes, so each item becomes a product by its own item code; the
// nightly cross-store linker (item_links step) then links it to the same
// product at the other stores by name.
//
// An item that is in today's offer listings shows its OFFER price in the
// catalogue too (the shop publishes one price), so it is mapped but gets no
// shelf-price snapshot (baseline:false) — its regular price arrives on a later
// run, once the offer ends.
//
//   node src/scripts/marketin-catalog.mjs
//   DRY_RUN=1 node src/scripts/marketin-catalog.mjs
//   MARKETIN_CACHE=/tmp/marketin-walk.json   # reuse one walk
//
// dotenv first (ESM hoist trap) — ingestCatalog imports prisma itself.
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';

async function run() {
  const { ingestCatalog } = await import('./lib/ingest-catalog.mjs');
  const { loadCatalog, loadOffers } = await import('./lib/marketin-api.mjs');
  console.log(`🗂️ Market In catalogue${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const { items: listed, stated, partial } = await loadCatalog({ cachePath: process.env.MARKETIN_CACHE });
  const onOffer = new Set();
  for (const feed of ['leaflet', 'web']) {
    const r = await loadOffers(feed);
    for (const it of r.items) onOffer.add(it.id);
  }
  const items = listed.map((it) => ({
    chainItemcode: it.id,
    name: it.name,
    price: it.price,
    imageUrl: it.imageUrl,
    brand: it.brand,
    baseline: !onOffer.has(it.id),
  }));
  console.log(`   ${items.length} items (departments state ${stated}), ${onOffer.size} on offer today`);
  const warnings = partial ? [`partial walk: a department listed fewer items than it states (${items.length} vs ${stated})`] : [];
  const report = await ingestCatalog({ chain: 'marketin', items, dryRun: DRY_RUN, extraWarnings: warnings });
  console.log(`\nDone — created=${report.created} existing=${report.existing} snapshots=${report.snapshots} err=${report.errors}`);
  process.exit(report.healthOk || DRY_RUN ? 0 : 1);
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
