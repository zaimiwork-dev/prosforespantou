// Kritikos canonical-catalog scraper.
// Walks Kritikos's full category tree, fetches each leaf's Next.js page JSON,
// extracts every product (offer or not), and hands them to the shared
// ingestCatalog writer.
//
// Goal: grow the canonical catalog with Kritikos-specific items the Wolt
// scrape doesn't cover, so the Kritikos offers adapter can match deterministically
// on barcode and bypass the Review Queue.
//
// 2026-09-15: this script used to write Products itself (a direct
// create/update keyed on barcode). That bypassed EVERY rail the other catalog
// scrapers get — no IngestRun row (so the Υγεία tab and the watchdog could not
// see the feed at all), no ChainProductMapping (so Kritikos' own SKUs never
// linked offers to products from here), and no volume guard. It now goes
// through ingestCatalog like ab/bazaar/lidl/masoutis/mymarket/sklavenitis.
//
// Usage:
//   node src/scripts/kritikos-canonical-scraper.mjs
//
// Env:
//   DRY_RUN=1   → don't write to DB; just count + sample
//   LIMIT=N     → stop after N unique products (smoke test)
//   PACE_MS=200 → throttle between category fetches (default 200)
//
// Notes:
//   - Discounts are NOT written here. The Kritikos offers adapter writes those
//     via the shared ingest-offers pipeline (safety rules + ChainProductMapping).
//   - baseline:false on every item. Kritikos' shelf-price series (kind='normal')
//     is written nightly by the offers run with BASELINE=1, which knows which
//     SKUs are currently on offer and excludes them; the prices on this Sunday
//     walk include promo prices, so snapshotting them here would poison the
//     very baseline the comparison relies on.
//   - refreshFields:true keeps the old behaviour of refreshing
//     name/description/image/brand/unitInfo on products we already have; this
//     walk is our richest source of Kritikos unitInfo and brand.
//   - The Next.js buildId in the data URLs changes on each Kritikos deploy. We
//     scrape it fresh from the homepage HTML on every run.
//   - Some deeper category paths return Next.js SPA fallback HTML instead of
//     JSON. We detect that via content-type and skip — products under those
//     paths are usually reachable via a parent category's staticProducts (which
//     is keyed by descendant category ObjectId).

import 'dotenv/config';
import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = envInt('PACE_MS', 750);
const JITTER_MS = envInt('JITTER_MS', 350);

const CHAIN_SLUG = 'kritikos';

const HOME = 'https://www.kritikos-sm.gr';
const TREE_API = 'https://kritikos-cxm-production.herokuapp.com/api/v2/categories/tree?collectionType=900';

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// GTIN-13 check digit (mod-10 weighted sum, positions alternate ×1 ×3 from left).
// Kept identical to wolt-canonical-scraper.mjs + lib/ingest-offers.mjs so a
// barcode from any source normalizes to the same canonical key.
function gtin13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(twelve[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function normalizeBarcode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 14 && /^[01]/.test(s)) {
    const twelve = s.slice(1, 13);
    return twelve + gtin13CheckDigit(twelve);
  }
  return s;
}

// Pick the first barcode from the array that normalizes successfully.
function pickBarcode(barcodes) {
  if (!Array.isArray(barcodes)) return null;
  for (const b of barcodes) {
    const n = normalizeBarcode(b);
    if (n) return n;
  }
  return null;
}

async function getJson(url) {
  const r = await fetchWithBackoff(url, { headers: HEADERS }, { label: `Kritikos JSON ${url}` });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

async function getBuildId() {
  const r = await fetchWithBackoff(HOME + '/', { headers: { ...HEADERS, Accept: 'text/html' } }, { label: 'Kritikos canonical homepage' });
  if (!r.ok) throw new Error(`homepage HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error('buildId not found in homepage HTML');
  return m[1];
}

async function getCategoryTree() {
  const j = await getJson(TREE_API);
  const cats = j.payload?.categories;
  if (!Array.isArray(cats)) throw new Error('tree API returned no categories array');
  return cats;
}

// Walk the tree and return EVERY node's path (not just leaves with offers).
// We want full catalog coverage — both leaf and intermediate paths, since
// staticProducts at an intermediate level often contains all descendant
// products keyed by their sub-category ObjectId.
function collectAllPaths(tree) {
  const out = [];
  function walk(node, parents = []) {
    if (!node.slugAscii) return;
    const path = [...parents, node.slugAscii];
    out.push({ path: path.join('/'), name: node.name || node.slugAscii, depth: path.length });
    (node.subCategories || []).forEach((k) => walk(k, path));
  }
  tree.forEach((c) => walk(c, []));
  return out;
}

async function fetchCategoryJson(buildId, path) {
  const url = `${HOME}/_next/data/${buildId}/categories/${path}.json`;
  const r = await fetchWithBackoff(url, { headers: HEADERS }, { label: `Kritikos canonical category ${path}`, retries: 1 });
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!/json/i.test(ct)) return null; // SPA fallback HTML
  return r.json();
}

// staticProducts is an object keyed by category MongoDB ObjectId → product[].
function productsFromCategoryJson(j) {
  const sp = j?.pageProps?.staticProducts;
  if (!sp || typeof sp !== 'object') return [];
  return Object.values(sp).flat().filter((p) => p && typeof p === 'object' && p.sku);
}

function pickImageUrl(p) {
  if (p.images?.primary && p.images?.baseUrl) {
    return `${p.images.baseUrl}${p.images.primary}`;
  }
  return null;
}

// Kritikos prices are integer cents. `finalPrice` is the shelf/current price;
// the adapter falls back to `offerValue` (already a float) when it is missing.
// The price is only used as a validity signal here (baseline:false means it is
// never snapshotted), but ingestCatalog requires one, so items without a
// readable price are dropped and counted.
function priceOf(p) {
  const cents = Number(p.finalPrice);
  if (Number.isFinite(cents) && cents > 0) return cents / 100;
  const offer = Number(p.offerValue);
  return Number.isFinite(offer) && offer > 0 ? offer : null;
}

// One Kritikos catalog product → an ingestCatalog item. Identity is the GTIN
// (cross-chain) AND the chain's own SKU (ChainProductMapping), which is what
// lets the nightly offers run hit step 1 of the match waterfall.
function toCatalogItem(p) {
  const barcode = pickBarcode(p.barcodes);
  const price = priceOf(p);
  if (!barcode || !price) return null;
  return {
    chainItemcode: String(p.sku),
    name: (p.name || '').trim(),
    price,
    barcode,
    description: (p.description || '').trim() || null,
    imageUrl: pickImageUrl(p),
    brand: (p.brand || '').trim() || null,
    unitInfo: (p.quantity || '').trim() || null,
    // The nightly BASELINE=1 offers run owns the kind='normal' series.
    baseline: false,
  };
}

async function run() {
  console.log(`🛒 Kritikos canonical scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  const extraWarnings = [];
  if (Number.isFinite(LIMIT)) extraWarnings.push(`LIMIT=${LIMIT} active; catalog run is intentionally partial.`);

  const buildId = await getBuildId();
  console.log(`   buildId: ${buildId}`);

  const tree = await getCategoryTree();
  const paths = collectAllPaths(tree);
  console.log(`   ${paths.length} category paths total (all depths)`);

  // Walk every path; collect unique products by sku.
  const bySku = new Map();
  let fetched = 0, jsonOk = 0, spaFallback = 0, errors = 0;
  for (let i = 0; i < paths.length; i++) {
    const { path, depth } = paths[i];
    fetched++;
    try {
      const j = await fetchCategoryJson(buildId, path);
      if (!j) { spaFallback++; }
      else {
        jsonOk++;
        for (const p of productsFromCategoryJson(j)) {
          if (!bySku.has(String(p.sku))) bySku.set(String(p.sku), p);
        }
      }
    } catch (e) {
      errors++;
      const warning = `${path} failed (${e.message}); partial catalog.`;
      if (errors < 5) console.log(`\n   ⚠️  ${warning}`);
      if (extraWarnings.length < 10) extraWarnings.push(warning);
    }
    if ((i + 1) % 20 === 0 || i === paths.length - 1) {
      process.stdout.write(`\r   path ${i + 1}/${paths.length} (d=${depth}) — unique products: ${bySku.size} | json=${jsonOk} spa=${spaFallback}    `);
    }
    if (bySku.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  const products = [...bySku.values()];
  const withBarcode = products.filter((p) => pickBarcode(p.barcodes));
  const noPrice = withBarcode.filter((p) => !priceOf(p));
  console.log(`\n📦 ${products.length} unique products fetched`);
  console.log(`   with usable barcode: ${withBarcode.length} (${((withBarcode.length / Math.max(1, products.length)) * 100).toFixed(1)}%)`);
  console.log(`   no barcode (skip):   ${products.length - withBarcode.length}`);
  console.log(`   no price (skip):     ${noPrice.length}`);
  console.log(`   paths fetched=${fetched} jsonOk=${jsonOk} spaFallback=${spaFallback} errors=${errors}`);

  // A handful of price-less rows is normal (withdrawn/placeholder SKUs); a big
  // share means the JSON shape moved and the walk is quietly losing products.
  if (noPrice.length > Math.max(20, withBarcode.length * 0.02)) {
    extraWarnings.push(`${noPrice.length}/${withBarcode.length} barcode-bearing products had no readable price and were skipped.`);
  }

  const items = products.map(toCatalogItem).filter(Boolean);
  console.log(`   ${items.length} catalog items ready (barcode + price)`);

  if (DRY_RUN) {
    console.log('\n🔎 DRY_RUN — sample of first 5 items that would be written:');
    items.slice(0, 5).forEach((it) => {
      console.log(`   ${it.barcode}  sku=${it.chainItemcode}  ${it.name}  (${it.unitInfo || ''})  €${it.price}  brand=${it.brand || '?'}  ${it.imageUrl ? '[img]' : ''}`);
    });
  }

  // requireBarcode:true — Kritikos exposes a GTIN on ~99% of its catalog, so a
  // barcode-less row here is an oddity, not an identity we want to invent.
  const report = await ingestCatalog({
    chain: CHAIN_SLUG,
    items,
    dryRun: DRY_RUN,
    extraWarnings,
    writeMappings: true,
    requireBarcode: true,
    refreshFields: true,
  });

  console.log(`\n✅ DONE`);
  console.log(`   paths walked:           ${paths.length}`);
  console.log(`   products fetched:       ${products.length}`);
  console.log(`   with barcode:           ${withBarcode.length}`);
  console.log(`   Products created:       ${String(report.created).padStart(5)}`);
  console.log(`   Products existing:      ${String(report.existing).padStart(5)} (+${report.mapped} newly mapped, ${report.refreshed} refreshed)`);
  console.log(`   provenance stamped:     ${String(report.stamped).padStart(5)} 'barcode', ${report.rebound} rebound`);
  console.log(`   skipped before ingest:  ${String(products.length - items.length).padStart(5)} (no barcode / no price)`);
  console.log(`   skipped by ingest:      ${String(report.skipped).padStart(5)}`);
  console.log(`   errors:                 ${report.errors}`);
  if (report.warnings.length) report.warnings.forEach((w) => console.log(`   ⚠️  ${w}`));
  console.log(report.healthOk ? '   health: ✅ OK' : '   health: ⚠️  TRIPPED');

  // Same convention as the other catalog scripts: a tripped health flag fails
  // the job so a truncated Sunday walk is a red run, not a silent one. A dry
  // smoke run that fetched something and errored on nothing still exits 0.
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
