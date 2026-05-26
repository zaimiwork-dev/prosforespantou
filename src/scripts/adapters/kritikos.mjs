// Kritikos adapter.
//
// Walks Kritikos's category tree, fetches each leaf's Next.js page JSON,
// extracts discounted products. Each product carries `barcodes: string[]`
// so matching to the canonical catalog is GTIN-based — zero LLM calls.
//
// Usage:
//   node src/scripts/adapters/kritikos.mjs           # full run
//   DRY_RUN=1 node src/scripts/adapters/kritikos.mjs # no DB writes
//   LIMIT=200 ...                                    # smoke test
//
// Sustainability notes:
//   - The Next.js buildId in the URL changes on each Kritikos deploy. We
//     scrape it fresh from the homepage HTML on every run, so the adapter
//     self-heals across redeploys.
//   - The category tree API is on a separate Heroku host. If it 404s or
//     returns nothing, we abort early so the health check trips and stale
//     data stays live (rather than wiping everything).

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '200', 10);

const HOME = 'https://www.kritikos-sm.gr';
const TREE_API = 'https://kritikos-cxm-production.herokuapp.com/api/v2/categories/tree?collectionType=900';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9',
};

async function getBuildId() {
  const r = await fetch(HOME + '/', { headers: { ...HEADERS, Accept: 'text/html' } });
  if (!r.ok) throw new Error(`homepage HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error('buildId not found in homepage HTML');
  return m[1];
}

async function getCategoryTree() {
  const r = await fetch(TREE_API, { headers: HEADERS });
  if (!r.ok) throw new Error(`tree API HTTP ${r.status}`);
  const j = await r.json();
  const cats = j.payload?.categories;
  if (!Array.isArray(cats)) throw new Error(`tree API returned no categories array`);
  return cats;
}

// Walk the tree, return [{ path: 'parent/child/leaf', offers }] for leaves with offers > 0.
function collectLeafPaths(tree) {
  const out = [];
  function walk(node, path = []) {
    const np = node.slugAscii ? [...path, node.slugAscii] : path;
    const kids = node.subCategories || [];
    if (kids.length === 0) {
      const offers = node.numberOfProductsToDisplayWithOffer || 0;
      if (offers > 0 && np.length) out.push({ path: np.join('/'), offers });
    } else {
      kids.forEach((k) => walk(k, np));
    }
  }
  tree.forEach((c) => walk(c, []));
  return out;
}

async function fetchCategoryJson(buildId, path) {
  const url = `${HOME}/_next/data/${buildId}/categories/${path}.json`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!/json/i.test(ct)) return null; // SPA fallback HTML → skip
  return r.json();
}

// staticProducts is keyed by category ObjectId → flatten
function productsFromCategoryJson(j) {
  const sp = j?.pageProps?.staticProducts;
  if (!sp || typeof sp !== 'object') return [];
  return Object.values(sp).flat().filter((p) => p && typeof p === 'object');
}

// Kritikos product → contract OfferItem (or null to skip).
function toOfferItem(p) {
  // Skip products with no real price discount AND no offer sticker — they're
  // just regular catalog items appearing in the category listing.
  const hasPriceCut = p.finalPrice > 0 && p.beginPrice > p.finalPrice;
  const hasSticker = !!(p.mobileSticker || p.webSticker);
  if (!hasPriceCut && !hasSticker) return null;
  if (!p.available || !p.enabled) return null;

  // Prices are in cents (integers). Use offerValue/bestPrice as float fallback.
  const price = p.finalPrice ? p.finalPrice / 100 : p.offerValue || null;
  const original = hasPriceCut ? p.beginPrice / 100 : null;
  if (!price || price <= 0) return null;

  const barcode = Array.isArray(p.barcodes) && p.barcodes.length ? String(p.barcodes[0]) : null;
  const img = p.images?.primary && p.images?.baseUrl
    ? `${p.images.baseUrl}${p.images.primary}`
    : null;
  const sticker = (p.webSticker || p.mobileSticker || '').trim();

  return {
    name: (p.name || '').trim(),
    price,
    originalPrice: original,
    chainItemcode: String(p.sku),
    barcode,
    brand: (p.brand || '').trim() || null,
    unit: (p.quantity || '').trim() || null,
    category: p.category?.name?.trim() || 'Άλλο',
    imageUrl: img,
    offerType: sticker || (p.offerType || null),
  };
}

async function run() {
  console.log(`🛒 Kritikos adapter${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const buildId = await getBuildId();
  console.log(`   buildId: ${buildId}`);
  const tree = await getCategoryTree();
  const leaves = collectLeafPaths(tree);
  const expectedOffers = leaves.reduce((s, l) => s + l.offers, 0);
  console.log(`   ${leaves.length} leaf categories with offers (expected ~${expectedOffers} products)`);

  const bySku = new Map();
  let errs = 0;
  for (let i = 0; i < leaves.length; i++) {
    const { path } = leaves[i];
    try {
      const j = await fetchCategoryJson(buildId, path);
      if (!j) { continue; }
      for (const p of productsFromCategoryJson(j)) {
        if (p.sku) bySku.set(String(p.sku), p);
      }
    } catch (e) {
      errs++;
      if (errs < 5) console.log(`\n   ⚠️  ${path} — ${e.message}`);
    }
    if ((i + 1) % 25 === 0 || i === leaves.length - 1) {
      process.stdout.write(`\r   leaf ${i + 1}/${leaves.length} — unique products: ${bySku.size}   `);
    }
    if (bySku.size >= LIMIT) break;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log(`\n   fetched ${bySku.size} unique products across ${leaves.length} categories (${errs} errors)`);

  let items = [...bySku.values()].map(toOfferItem).filter((it) => it && it.name);
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} real offers ready to ingest`);

  const report = await ingestOffers({ chain: 'kritikos', source: 'web', items, dryRun: DRY_RUN });
  printReport(report);
  process.exit(report.healthOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
