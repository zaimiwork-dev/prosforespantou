// Lidl adapter — structured e-shop OFFERS (replaces the old flyer-OCR pipeline).
//
// We were OCR'ing the weekly leaflet's page images with Groq vision, which
// produced ~15% garbled Greek names (homoglyphs, transliteration). lidl-hellas.gr
// exposes the SAME weekly offers as clean structured data through its product
// search API — real names, prices, dates, own packaging photos. So we drop OCR
// entirely. Shared fetching/pagination lives in ../lib/lidl-eshop.mjs; this file
// is just the OFFER classifier + mapping. See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/lidl.mjs            # all departments
//   DRY_RUN=1 node src/scripts/adapters/lidl.mjs  # fetch + match, no DB writes
//   LIMIT=N node src/scripts/adapters/lidl.mjs    # smoke test (first N offers)
//   LIDL_CATS=10068374 node ...                   # override category numbers
//
// What counts as an OFFER (discounted, shown with a badge): a published
// strikethrough (price.oldPrice>0), a "ΜΟΝΟ ΓΙΑ ΛΙΓΟ" promo
// (price.discount.discountText), or an in-store date badge active TODAY
// (IN_STORE_TODAY_DATE_RANGE / IN_STORE_FROM_DATE_TODAY). EXPIRED (past) and
// UPCOMING (future) badges are excluded — upcoming deals aren't live yet, and no
// other chain shows them. Full-price products are NOT offers; they surface via
// the catalog track (lidl-catalog.mjs) without a discount badge.
//
// chainItemcode is the Lidl productId, so offers auto-link to the Lidl catalog
// Product (lidl-catalog.mjs keys Products by the same id) via ChainProductMapping;
// imageUrl is Lidl's own packaging photo. No Groq / sharp / cheerio / backfill.

// Load env before any module touches process.env (DB url lives in .env.local).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { discoverCategoryNumbers, scrapeAllProducts, productId, classifyOffer } from '../lib/lidl-eshop.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '500', 10);
const CATS_ENV = (process.env.LIDL_CATS || '').split(',').map((s) => s.trim()).filter(Boolean);

function toOfferItem(p, cls) {
  const price = p.price || {};
  const name = (p.fullTitle || p.keyfacts?.fullTitle || p.title || '').trim();
  const image = (typeof p.image === 'string' && p.image) ||
    (Array.isArray(p.imageList) && p.imageList[0]) || null;
  const size = price.packaging?.text?.trim() || null; // "675 ml" → UI fallback badge
  return {
    name,
    price: Number(price.price),
    originalPrice: cls.originalPrice,
    chainItemcode: String(productId(p)),
    barcode: null,
    brand: null,
    category: null, // grid 'category' is the useless literal "A PRODUCT" → keyword-categorize
    imageUrl: image,
    validFrom: cls.validFrom.toISOString(),
    validUntil: cls.validUntil.toISOString(),
    offerType: cls.offerType,
    description: size,
  };
}

export async function runLidlAdapter({ dryRun = DRY_RUN, limit = LIMIT } = {}) {
  console.log(`🛒 Lidl adapter (structured e-shop offers)${dryRun ? ' — DRY_RUN' : ''}`);
  const now = new Date();

  const cats = await discoverCategoryNumbers(CATS_ENV);
  console.log(`   ${cats.length} category numbers to probe (empties skipped)`);

  const offers = [];
  const counts = { strikethrough: 0, mono: 0 };
  const { stats } = await scrapeAllProducts({
    cats,
    pace: PACE_MS,
    onProduct: (p) => {
      const cls = classifyOffer(p, now);
      if (!cls) return;
      const item = toOfferItem(p, cls);
      if (!item.name) return;
      offers.push(item);
      counts[cls.offerType]++;
    },
  });

  let finalOffers = offers;
  if (finalOffers.length > limit) finalOffers = finalOffers.slice(0, limit);
  console.log(`   ${stats.catsWithProducts} categories had products, ${stats.unique} unique products seen`);
  console.log(`   ${finalOffers.length} current offers (strikethrough=${counts.strikethrough} mono=${counts.mono})`);

  // A throttled scrape is a PARTIAL scrape — record it so the run is flagged and
  // (via ingest-offers' size check) stale offers aren't wrongly deactivated.
  const extraWarnings = [];
  const partial = !!(stats.throttledCats || stats.incompleteCats);
  if (partial) {
    extraWarnings.push(
      `Lidl API throttled: ${stats.throttledCats} categories unreadable, ${stats.incompleteCats} cut short — ` +
      `this run is partial. Re-run later; stale offers will NOT be deactivated.`
    );
    console.log(`   ⚠️ ${extraWarnings[0]}`);
  }

  if (process.env.LIDL_DEBUG) {
    console.log('\n   sample offers:');
    for (const o of finalOffers.slice(0, 12)) {
      const d = `${o.validFrom.slice(5, 10)}→${o.validUntil.slice(5, 10)}`;
      console.log(`   ${o.offerType.padEnd(13)} ${String(o.price).padStart(6)} was=${String(o.originalPrice ?? '').padStart(5)}  ${d}  img=${o.imageUrl ? 'Y' : 'N'}  ${o.name}`);
    }
  }

  // Self-host offer images on the Supabase mirror so Lidl photos survive even if
  // schwarz's CDN rotates its (signed) URLs or blocks us. Mutates item.imageUrl
  // in place → mirror URL; HEAD-reuses anything the catalog already uploaded.
  // No-op (originals kept + warning) without SUPABASE creds.
  if (!dryRun) {
    const mirror = await mirrorImages({
      chain: 'lidl', items: finalOffers,
      match: (u) => u.includes('assets.schwarz') || u.includes('lidl-hellas.gr'),
      maxNew: 500, paceMs: 60,
    });
    extraWarnings.push(...mirror.warnings);
  }

  // showUnmatched ON: names/prices/images are clean structured data, safe to
  // publish even before a Product match. chainItemcode is the Lidl productId, so
  // anything the catalog already ingested links straight through.
  const report = await ingestOffers({ chain: 'lidl', source: 'leaflet', items: finalOffers, dryRun, showUnmatched: true, extraWarnings, partial });
  printReport(report);
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
if (isMain) {
  runLidlAdapter()
    .then((report) => process.exit(report.healthOk ? 0 : 1))
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
