// Wolt supplemental catalog/barcode enrichment.
//
// Wolt is NOT the authoritative offer source for a supermarket. Direct chain
// scrapers own official offers/prices. This script only walks a Wolt venue's
// assortment to enrich canonical Products by barcode_gtin and, when explicitly
// enabled, write supplemental normal baselines for non-promo Wolt rows.
//
// A chain's GTINs live on Wolt, not on the chain's own site (masoutis, ab,
// mymarket and sklavenitis all expose SKU-only feeds — see each adapter's
// header). One venue is one STORE, not the chain: measured 2026-09-03, the
// Masoutis Makedonias and Grand Masoutis Kavala venues are each 100%
// barcode-backed but overlap only ~60%, so walking several venues and unioning
// by GTIN is what actually grows canonical coverage. Hence a venue LIST.
//
// Usage:
//   node src/scripts/wolt-canonical-scraper.mjs <venue-slug>[,<venue-slug>...] [chain-slug]
//
// Examples:
//   node src/scripts/wolt-canonical-scraper.mjs masoutis-makedonias masoutis
//   node src/scripts/wolt-canonical-scraper.mjs masoutis-makedonias,grand-masoutis-kavala masoutis
//
// Env:
//   DRY_RUN=1        no DB writes
//   LIMIT=N          stop after N unique Wolt items (across all venues)
//   WOLT_BASELINE=1  write kind='normal' snapshots for non-promo Wolt rows.
//                    REFUSED with more than one venue: prices are per-store, so
//                    unioning them would file one store's price as the chain's
//                    shelf baseline.
//   MIN_GTIN_RATE    fail the run when the share of items carrying a GTIN falls
//                    below this (default 0.5). Wolt silently stopped exposing
//                    barcode_gtin for Sklavenitis somewhere before 2026-08-23
//                    (34 of 3,516 items) and the weekly job stayed green for
//                    months, which is exactly what this gate exists to catch.
//   PACE_MS=750      throttle between category fetches

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';
import { evaluateGtinRate, formatGtinRate } from '../lib/gtin-coverage.ts';

const VENUE_SLUGS = (process.argv[2] || process.env.WOLT_VENUES || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (!VENUE_SLUGS.length) {
  console.error('Usage: node src/scripts/wolt-canonical-scraper.mjs <venue-slug>[,<venue-slug>...] [chain-slug]');
  process.exit(1);
}
// Inferring the chain from the slug only works for single-venue runs, and even
// then only when the venue is named after the chain.
const CHAIN_SLUG = process.argv[3] || VENUE_SLUGS[0].split('-')[0];

const DRY_RUN = process.env.DRY_RUN === '1';
const WOLT_BASELINE = process.env.WOLT_BASELINE === '1';
const MIN_GTIN_RATE = process.env.MIN_GTIN_RATE !== undefined ? Number(process.env.MIN_GTIN_RATE) : 0.5;
if (WOLT_BASELINE && VENUE_SLUGS.length > 1) {
  console.error("WOLT_BASELINE=1 refuses a multi-venue run: Wolt prices are per-store, so a union would file one store's price as the whole chain's shelf baseline. Run one venue at a time for baselines.");
  process.exit(1);
}
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = envInt('PACE_MS', 750);
const JITTER_MS = envInt('JITTER_MS', 350);
const BASE = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1';

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://wolt.com',
  Referer: 'https://wolt.com/',
};

function gtin13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(twelve[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function normalizeBarcode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return s;
  if (s.length === 14 && /^[01]/.test(s)) {
    const twelve = s.slice(1, 13);
    return twelve + gtin13CheckDigit(twelve);
  }
  return s;
}

async function getJson(url) {
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label: `Wolt ${url}` });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${url} - ${text.slice(0, 200)}`);
  }
  return res.json();
}

function flattenCategories(categories) {
  const out = [];
  function walk(node) {
    if (node.slug) out.push({ slug: node.slug, name: node.name });
    (node.subcategories || []).forEach(walk);
  }
  (categories || []).forEach(walk);
  return out;
}

async function fetchVenueItems(venueSlug, itemsByKey) {
  console.log(`Wolt supplemental catalog venue=${venueSlug}`);
  const assortment = await getJson(`${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment`);
  const cats = flattenCategories(assortment.categories);
  console.log(`   ${cats.length} categories+subcategories`);

  const warnings = [];
  const before = itemsByKey.size;
  let seen = 0;
  let withGtin = 0;
  let failedCats = 0;
  let catIdx = 0;
  for (const c of cats) {
    catIdx++;
    try {
      const url = `${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment/categories/slug/${encodeURIComponent(c.slug)}`;
      const data = await getJson(url);
      for (const it of data.items || []) {
        seen++;
        if (it.barcode_gtin) withGtin++;
        // Key by NORMALIZED GTIN so the same product in several stores
        // collapses to one canonical row; fall back to the Wolt item id so
        // barcode-less rows still dedupe within a venue. Normalising matters:
        // measured 2026-09-03, masoutis-makedonias returns GTIN-13 while the
        // other Masoutis venues return GTIN-14 (leading zero), giving 0/70 raw
        // overlap on a sample — keying on the raw value made two stores of the
        // same chain look completely disjoint.
        const bc = normalizeBarcode(it.barcode_gtin);
        const key = bc ? `gtin:${bc}` : `id:${it.id}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, { ...it, _category: c.name, _venue: venueSlug });
      }
      process.stdout.write(`\r   category ${catIdx}/${cats.length} - unique items: ${itemsByKey.size}        `);
    } catch (e) {
      // Logged, not escalated: a single category blip costs a handful of items
      // out of thousands, and the aggregate ratio in run() is what actually says
      // whether the walk is unreliable. ingestCatalog treats ANY extraWarning as
      // unhealthy, and 4 venues x ~245 categories is ~1,000 fetches per run.
      failedCats++;
      console.log(`\n   Wolt category "${c.slug}" failed (${e.message}); skipped.`);
    }
    if (itemsByKey.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');
  console.log(`   ${venueSlug}: ${seen} items seen, ${withGtin} with GTIN (${formatGtinRate(seen, withGtin)}), +${itemsByKey.size - before} new to this run`);
  if (Number.isFinite(LIMIT)) warnings.push(`LIMIT=${LIMIT} active; Wolt enrichment run is intentionally partial.`);
  if (failedCats) console.log(`   ${failedCats}/${cats.length} categories failed on ${venueSlug}`);
  return { warnings, seen, withGtin, failedCats, totalCats: cats.length };
}

function pickImageUrl(item) {
  return (item.images || [])[0]?.url || null;
}

function isWoltPromo(item) {
  return item.original_price && item.original_price > item.price;
}

function toCatalogItem(item) {
  const price = Number(item.price) / 100;
  const barcode = normalizeBarcode(item.barcode_gtin);
  if (!item.id || !item.name || !price || !barcode) return null;
  return {
    // Required for ingest shape only. writeMappings:false prevents this Wolt id
    // from becoming a fake chain SKU mapping.
    chainItemcode: `wolt:${item._venue}:${item.id}`,
    name: item.name,
    price,
    barcode,
    imageUrl: pickImageUrl(item),
    unitInfo: item.unit_info || null,
    baseline: WOLT_BASELINE && !isWoltPromo(item),
  };
}

async function run() {
  console.log(`Wolt enrichment -> chain="${CHAIN_SLUG}" venues=${VENUE_SLUGS.length}${DRY_RUN ? ' (DRY_RUN)' : ''}${WOLT_BASELINE ? ' (baseline enabled)' : ''}`);

  // One shared map across venues: dedupe happens by GTIN, so a product carried
  // by five stores is ingested once.
  const itemsByKey = new Map();
  const warnings = [];
  let seen = 0;
  let withGtin = 0;
  let failedCats = 0;
  let totalCats = 0;
  const deadVenues = [];
  const failedVenues = [];
  for (const venue of VENUE_SLUGS) {
    try {
      const r = await fetchVenueItems(venue, itemsByKey);
      warnings.push(...r.warnings);
      seen += r.seen;
      withGtin += r.withGtin;
      failedCats += r.failedCats;
      totalCats += r.totalCats;
      // A venue that answers but exposes no barcodes contributes nothing
      // canonical — name it, so a per-store regression is visible even when the
      // chain-wide rate still passes.
      if (r.seen > 0 && r.withGtin === 0) deadVenues.push(venue);
    } catch (e) {
      // One dead venue must not lose the other venues' items, and a single
      // store being briefly unavailable is ordinary. Escalated below only when
      // most of the venue list is down.
      failedVenues.push(venue);
      console.log(`   Wolt venue "${venue}" failed (${e.message}); continuing with the remaining venues.`);
    }
    if (itemsByKey.size >= LIMIT) break;
  }

  const items = [...itemsByKey.values()];
  const withBarcode = items.map(toCatalogItem).filter(Boolean);
  const skipped = items.length - withBarcode.length;
  const baselineCount = withBarcode.filter((it) => it.baseline !== false).length;
  const coverage = evaluateGtinRate(seen, withGtin, MIN_GTIN_RATE);
  console.log(`\n   ${items.length} unique Wolt items across ${VENUE_SLUGS.length} venue(s), ${withBarcode.length} barcode-backed, ${skipped} skipped`);
  console.log(`   GTIN rate ${formatGtinRate(seen, withGtin)} of ${seen} items seen (floor ${(MIN_GTIN_RATE * 100).toFixed(0)}%) -> ${coverage}`);
  console.log(`   ${baselineCount} supplemental baselines enabled`);
  for (const v of deadVenues) warnings.push(`Venue "${v}" returned items but ZERO GTINs — Wolt is no longer exposing barcodes for that store.`);
  // Escalate breadth, not individual blips: a tenth of the category tree, or
  // half the venue list, going missing means the walk itself is unreliable.
  if (totalCats > 0 && failedCats / totalCats > 0.1) {
    warnings.push(`${failedCats}/${totalCats} Wolt categories failed (>10%) — enrichment is materially incomplete.`);
  } else if (failedCats > 0) {
    console.log(`   ${failedCats}/${totalCats} categories failed overall (under the 10% escalation threshold)`);
  }
  if (failedVenues.length > VENUE_SLUGS.length / 2) {
    warnings.push(`${failedVenues.length}/${VENUE_SLUGS.length} Wolt venues failed outright: ${failedVenues.join(', ')}.`);
  }

  // The gate this script exists for. Wolt dropped barcode_gtin for Sklavenitis
  // at some point before 2026-08-23 and the weekly job kept reporting success
  // on 34 of 3,516 items, so coverage rotted invisibly. A rate below the floor
  // is a data-source regression, not a scrape failure, and must be loud.
  if (coverage === 'below-floor') {
    warnings.push(`GTIN rate ${formatGtinRate(seen, withGtin)} is below the ${(MIN_GTIN_RATE * 100).toFixed(0)}% floor — Wolt has stopped exposing barcodes for ${CHAIN_SLUG}.`);
    console.error(`::error::Wolt GTIN rate for ${CHAIN_SLUG} is ${formatGtinRate(seen, withGtin)} (floor ${(MIN_GTIN_RATE * 100).toFixed(0)}%)`);
  }

  const report = await ingestCatalog({
    chain: CHAIN_SLUG,
    items: withBarcode,
    dryRun: DRY_RUN,
    extraWarnings: warnings,
    writeMappings: false,
    requireBarcode: true,
    sourceLabel: 'wolt',
  });
  console.log(`\nDone - created=${report.created} existing=${report.existing} snapshots=${report.snapshots} err=${report.errors}`);
  const gateOk = coverage !== 'below-floor';
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit((report.healthOk || smokeOk) && gateOk ? 0 : 1);
}

run().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
