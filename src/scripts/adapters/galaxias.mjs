// Γαλαξίας adapter (owner 2026-11-23: «we need offers from galaksias»).
//
// Usage:
//   FEED=web     node src/scripts/adapters/galaxias.mjs   # e-shop offers
//   FEED=leaflet node src/scripts/adapters/galaxias.mjs   # the «ΦΥΛΛΑΔΙΟ» offers
//   DRY_RUN=1 …                                           # fetch + map, no DB writes
//   GALAXIAS_CACHE=/tmp/galaxias.json                     # reuse one walk per job
//
// Source: the shop's public Magento GraphQL (lib/galaxias-api — one walk of the
// whole catalogue, ~10k products, ~5 min). Offers are its promotion rules as
// its own site computes them (lib/galaxias-promos): price cuts (−15%, −1 €,
// campaign prices) with the regular price struck through, and «1+1» / «−10%
// με αγορά 2 τεμ.» deals at the one-item price with the deal as the sticker.
// Rules tagged «ΦΥΛΛΑΔΙΟ» go to the leaflet feed, the rest to the web feed
// (like Μασούτης' two feeds). Dates are the shop's own. The item code is the
// barcode (EAN-13), so offers link to products by barcode.
import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { loadProducts, athensToday, topCategory } from '../lib/galaxias-api.mjs';
import { galaxiasPrice } from '../lib/galaxias-promos.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const FEED = process.env.FEED;
if (FEED !== 'web' && FEED !== 'leaflet') {
  console.error('FEED must be "web" or "leaflet"');
  process.exit(2);
}

// The shop's dates are Greek calendar days; an offer runs to the end of its last day.
const startOf = (d) => (d ? new Date(`${d}T00:00:00+02:00`).toISOString() : undefined);
const endOf = (d) => (d ? new Date(`${d}T23:59:59+02:00`).toISOString() : undefined);

async function run() {
  console.log(`🛒 Γαλαξίας adapter — ${FEED}${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const { products, partial, total } = await loadProducts({ cachePath: process.env.GALAXIAS_CACHE });
  const today = athensToday();
  const items = [];
  for (const p of products) {
    const regular = p.price_range?.minimum_price?.regular_price?.value;
    const { offer } = galaxiasPrice(regular, p.catalog_rules, today);
    if (!offer || offer.leaflet !== (FEED === 'leaflet')) continue;
    const name = String(p.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || !(offer.price > 0)) continue;
    items.push({
      name,
      price: offer.price,
      originalPrice: offer.originalPrice,
      chainItemcode: String(p.sku),
      barcode: String(p.sku),
      category: topCategory(p) ?? 'Άλλο',
      imageUrl: p.image?.url ?? null,
      validFrom: startOf(offer.validFrom),
      validUntil: endOf(offer.validUntil),
      description: offer.label,
      offerType: offer.originalPrice ? 'strikethrough' : 'mono',
    });
  }
  console.log(`   ${items.length} ${FEED} offers today (${today}) from ${products.length}/${total} products${partial ? ' — PARTIAL walk' : ''}`);
  const report = await ingestOffers({
    chain: 'galaxias',
    source: FEED,
    items,
    dryRun: DRY_RUN,
    partial,
    extraWarnings: partial ? ['Γαλαξίας walk was partial (a page failed) — stale offers were not deactivated.'] : [],
  });
  printReport(report);
  process.exit(report.healthOk || DRY_RUN ? 0 : 1);
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
