// Wolt supplemental catalog/barcode enrichment.
//
// Wolt is NOT the authoritative offer source for a supermarket. Direct chain
// scrapers own official offers/prices. This script only walks a Wolt venue's
// assortment to enrich canonical Products by barcode_gtin and, when explicitly
// enabled, write supplemental normal baselines for non-promo Wolt rows.
//
// Usage:
//   node src/scripts/wolt-canonical-scraper.mjs <venue-slug> [chain-slug]
//
// Examples:
//   node src/scripts/wolt-canonical-scraper.mjs masoutis-makedonias masoutis
//   node src/scripts/wolt-canonical-scraper.mjs sklavenitis-gerakas sklavenitis
//
// Env:
//   DRY_RUN=1        no DB writes
//   LIMIT=N          stop after N unique Wolt items
//   WOLT_BASELINE=1  write kind='normal' snapshots for non-promo Wolt rows
//   PACE_MS=750      throttle between category fetches

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const VENUE_SLUG = process.argv[2];
if (!VENUE_SLUG) {
  console.error('Usage: node src/scripts/wolt-canonical-scraper.mjs <venue-slug> [chain-slug]');
  process.exit(1);
}
const CHAIN_SLUG = process.argv[3] || VENUE_SLUG.split('-')[0];

const DRY_RUN = process.env.DRY_RUN === '1';
const WOLT_BASELINE = process.env.WOLT_BASELINE === '1';
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

async function fetchVenueItems(venueSlug) {
  console.log(`Wolt supplemental catalog venue=${venueSlug}`);
  const assortment = await getJson(`${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment`);
  const cats = flattenCategories(assortment.categories);
  console.log(`   ${cats.length} categories+subcategories`);

  const itemsById = new Map();
  const warnings = [];
  let catIdx = 0;
  for (const c of cats) {
    catIdx++;
    try {
      const url = `${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment/categories/slug/${encodeURIComponent(c.slug)}`;
      const data = await getJson(url);
      for (const it of data.items || []) {
        if (!itemsById.has(it.id)) itemsById.set(it.id, { ...it, _category: c.name });
      }
      process.stdout.write(`\r   category ${catIdx}/${cats.length} - unique items: ${itemsById.size}        `);
    } catch (e) {
      const warning = `Wolt category "${c.slug}" failed (${e.message}); partial enrichment.`;
      console.log(`\n   ${warning}`);
      warnings.push(warning);
    }
    if (itemsById.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');
  if (Number.isFinite(LIMIT)) warnings.push(`LIMIT=${LIMIT} active; Wolt enrichment run is intentionally partial.`);
  return { items: [...itemsById.values()], warnings };
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
    chainItemcode: `wolt:${VENUE_SLUG}:${item.id}`,
    name: item.name,
    price,
    barcode,
    imageUrl: pickImageUrl(item),
    unitInfo: item.unit_info || null,
    baseline: WOLT_BASELINE && !isWoltPromo(item),
  };
}

async function run() {
  console.log(`Wolt enrichment -> chain="${CHAIN_SLUG}"${DRY_RUN ? ' (DRY_RUN)' : ''}${WOLT_BASELINE ? ' (baseline enabled)' : ''}`);
  const { items, warnings } = await fetchVenueItems(VENUE_SLUG);
  const withBarcode = items.map(toCatalogItem).filter(Boolean);
  const skipped = items.length - withBarcode.length;
  const baselineCount = withBarcode.filter((it) => it.baseline !== false).length;
  console.log(`   ${items.length} Wolt items, ${withBarcode.length} barcode-backed, ${skipped} skipped`);
  console.log(`   ${baselineCount} supplemental baselines enabled`);

  const report = await ingestCatalog({
    chain: CHAIN_SLUG,
    items: withBarcode,
    dryRun: DRY_RUN,
    extraWarnings: warnings,
    writeMappings: false,
    requireBarcode: true,
  });
  console.log(`\nDone - created=${report.created} existing=${report.existing} snapshots=${report.snapshots} err=${report.errors}`);
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
