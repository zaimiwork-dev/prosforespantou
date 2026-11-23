// Γαλαξίας full catalogue → Products + regular shelf prices (daily).
// Same walk as the offers adapter (lib/galaxias-api; GALAXIAS_CACHE reuses it).
// Every item's code is its barcode (EAN-13), so the catalogue links to the
// other stores' products by barcode and records it in item_barcodes
// (lib/item-barcodes, via ingestCatalog).
//
//   node src/scripts/galaxias-catalog.mjs
//   DRY_RUN=1 node src/scripts/galaxias-catalog.mjs
//
// dotenv first (ESM hoist trap) — ingestCatalog imports prisma itself.
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';

async function run() {
  const { ingestCatalog } = await import('./lib/ingest-catalog.mjs');
  const { loadProducts, athensToday } = await import('./lib/galaxias-api.mjs');
  const { galaxiasPrice } = await import('./lib/galaxias-promos.mjs');
  console.log(`🗂️ Γαλαξίας catalogue${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const { products, partial, total } = await loadProducts({ cachePath: process.env.GALAXIAS_CACHE });
  const today = athensToday();
  const items = products.map((p) => {
    const regular = Number(p.price_range?.minimum_price?.regular_price?.value);
    const { offer } = galaxiasPrice(regular, p.catalog_rules, today);
    return {
      chainItemcode: String(p.sku),
      barcode: String(p.sku),
      name: String(p.name ?? '').replace(/\s+/g, ' ').trim(),
      // Magento's regular price; the promotions are never part of it.
      price: regular,
      imageUrl: p.image?.url ?? null,
      unitInfo: p.unit_measurement ?? null,
      // An item on a price-cut offer still has its regular price here, so the
      // snapshot is a real shelf price either way.
      baseline: true,
      _offer: Boolean(offer),
    };
  });
  const warnings = partial ? [`partial walk: ${products.length} of ${total} products`] : [];
  const report = await ingestCatalog({ chain: 'galaxias', items, dryRun: DRY_RUN, extraWarnings: warnings });
  console.log(`\nDone — created=${report.created} existing=${report.existing} snapshots=${report.snapshots} err=${report.errors}`);
  process.exit(report.healthOk || DRY_RUN ? 0 : 1);
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
