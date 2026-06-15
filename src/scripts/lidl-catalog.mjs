// Lidl Hellas catalog scraper — FULL assortment from the e-shop search API.
//
// This is the "everything" track: every product lidl-hellas.gr lists, priced,
// with its own packaging photo — discounted AND full-price. On-offer items also
// get a Discount row (with a badge) via adapters/lidl.mjs; everything else shows
// in full-catalog mode with no discount badge, exactly like the other chains.
//
// Shared discovery + pagination lives in ./lib/lidl-eshop.mjs. We previously
// scraped the HTML category pages with ?offset=N, but the server silently caps
// that at ~one page under load (a soft bot-defence), so the catalog only ever
// saw ~150 of the real assortment. The JSON search API honours offset/fetchsize
// and reports numFound, so we now page it to completion.
//
// SKU-keyed by productId (the grid exposes `ians`, not a GTIN). baseline=false
// for on-offer items so their promo price is NOT recorded as a 'normal' shelf
// price (the offers track captures it as mono/strikethrough instead).
//
// Usage: node src/scripts/lidl-catalog.mjs  [DRY_RUN=1 | LIMIT=N | LIDL_CATS=a,b]
//
// dotenv first (ESM hoist trap — DB import comes later via ingest-catalog).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { discoverCategoryNumbers, scrapeAllProducts, productId, classifyOffer } from './lib/lidl-eshop.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '150', 10);
const CATS_ENV = (process.env.LIDL_CATS || '').split(',').map((s) => s.trim()).filter(Boolean);

function toCatalogItem(p, now) {
  const price = p.price || {};
  const name = (p.fullTitle || p.keyfacts?.fullTitle || p.title || '').trim();
  const id = productId(p);
  if (!id || !name || !(price.price > 0)) return null;
  const image = (typeof p.image === 'string' && p.image) ||
    (Array.isArray(p.imageList) && p.imageList[0]) || null;
  return {
    chainItemcode: String(id),
    name,
    price: price.price,
    imageUrl: image,
    unitInfo: price.packaging?.text?.trim() || null,
    barcode: null,
    // On offer right now? Then this price is a promo — don't snapshot it as the
    // 'normal' shelf baseline (the offers track records it as mono/strikethrough).
    baseline: classifyOffer(p, now) ? false : true,
  };
}

async function run() {
  console.log(`🛒 Lidl catalog scraper (full e-shop assortment)${DRY_RUN ? ' — DRY_RUN' : ''}`);
  const now = new Date();
  const cats = await discoverCategoryNumbers(CATS_ENV);
  console.log(`   ${cats.length} category numbers to probe (empties skipped)`);

  const items = [];
  const { stats } = await scrapeAllProducts({
    cats,
    pace: PACE_MS,
    onProduct: (p) => { const it = toCatalogItem(p, now); if (it) items.push(it); },
  });

  let finalItems = items;
  if (finalItems.length > LIMIT) finalItems = finalItems.slice(0, LIMIT);
  const onOffer = finalItems.filter((it) => it.baseline === false).length;
  console.log(`   ${stats.catsWithProducts} categories had products, ${stats.unique} unique products`);
  console.log(`   ${finalItems.length} catalog products ready (${onOffer} on offer, ${finalItems.length - onOffer} full-price)`);
  if (stats.throttledCats || stats.incompleteCats) {
    console.log(`   ⚠️ Lidl API throttled: ${stats.throttledCats} categories unreadable, ${stats.incompleteCats} cut short — partial catalog, re-run later.`);
  }

  const report = await ingestCatalog({ chain: 'lidl', items: finalItems, dryRun: DRY_RUN });
  console.log(`\n✅ Lidl catalog — created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors} (of ${report.total})`);
  process.exit(0);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
