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

import { ingestOffers, printReport, ingestBaseline } from '../lib/ingest-offers.mjs';

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

// Walk the tree and return EVERY node's path (all depths). We can't filter to
// "leaves with offers" up-front because deep leaves often return SPA-fallback
// HTML — products under those leaves are still reachable via a 2-level parent's
// staticProducts (keyed by descendant ObjectId). The per-product offer filter
// (toOfferItem) removes non-offers later.
function collectAllPaths(tree) {
  const out = [];
  function walk(node, parents = []) {
    if (!node.slugAscii) return;
    const path = [...parents, node.slugAscii];
    out.push({ path: path.join('/'), depth: path.length });
    (node.subCategories || []).forEach((k) => walk(k, path));
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
  if (!p.available || !p.enabled) return null;

  // Primary offer signal: every product carries `offerType`, with "none" for
  // regular catalog items. Real offer types observed: "amount" (single price
  // cut), "percentage" (% off), "super" (multibuy / X-for-Y). Anything other
  // than "none" / falsy is a genuine offer.
  const isOnOffer = p.offerType && p.offerType !== 'none';
  // Belt-and-braces: also treat any direct price cut or sticker as an offer,
  // in case Kritikos adds new offerType values we don't know about yet.
  const hasPriceCut = p.finalPrice > 0 && p.beginPrice > p.finalPrice;
  const hasSticker = !!(p.mobileSticker || p.webSticker);
  if (!isOnOffer && !hasPriceCut && !hasSticker) return null;

  // Prices are in cents (integers). Fall back to offerValue (already a float)
  // when finalPrice is missing.
  const price = p.finalPrice ? p.finalPrice / 100 : (p.offerValue || null);
  // beginPrice is only meaningful as an "originalPrice" when it's strictly
  // higher than finalPrice — for multibuy super offers, they're often equal.
  const original = hasPriceCut ? p.beginPrice / 100 : null;
  if (!price || price <= 0) return null;

  const barcode = Array.isArray(p.barcodes) && p.barcodes.length ? String(p.barcodes[0]) : null;
  const img = p.images?.primary && p.images?.baseUrl
    ? `${p.images.baseUrl}${p.images.primary}`
    : null;

  // Kritikos's offerType is the label the chain itself renders on the card:
  //   "super"      → "SUPER ΤΙΜΗ" (most common — no strikethrough, just a
  //                  bold red bar saying "SUPER ΤΙΜΗ" in their UI)
  //   "amount"     → strikethrough price cut in euros
  //   "percentage" → strikethrough price cut as a percent
  // For amount/percentage the strikethrough math already produces a -X% badge,
  // so we leave description null and let DiscountCard render the percent. For
  // super we surface the actual Kritikos label so it doesn't fall back to a
  // generic ΜΟΝΟ. webSticker / mobileSticker are absent in their API; the
  // "SUPER ΤΙΜΗ" text is rendered by the chain frontend purely off offerType.
  let description = null;
  if (p.offerType === 'super') description = 'SUPER ΤΙΜΗ';

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
    description,
    offerType: (p.offerType && p.offerType !== 'none') ? p.offerType : null,
  };
}

// Phase 9: a NON-offer catalog product at its shelf price → 'normal' baseline.
// We already fetched every product to find the offers, so this is free data.
function toBaselineItem(p) {
  if (!p.available || !p.enabled) return null;
  const price = p.finalPrice ? p.finalPrice / 100 : null;
  if (!price || price <= 0) return null;
  const barcode = Array.isArray(p.barcodes) && p.barcodes.length ? String(p.barcodes[0]) : null;
  return { name: (p.name || '').trim(), price, chainItemcode: String(p.sku), barcode };
}

async function run() {
  console.log(`🛒 Kritikos adapter${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const buildId = await getBuildId();
  console.log(`   buildId: ${buildId}`);
  const tree = await getCategoryTree();
  const paths = collectAllPaths(tree);
  console.log(`   ${paths.length} category paths total (all depths)`);

  const bySku = new Map();
  let errs = 0, jsonOk = 0, spaFallback = 0;
  for (let i = 0; i < paths.length; i++) {
    const { path } = paths[i];
    try {
      const j = await fetchCategoryJson(buildId, path);
      if (!j) { spaFallback++; continue; }
      jsonOk++;
      for (const p of productsFromCategoryJson(j)) {
        if (p.sku) bySku.set(String(p.sku), p);
      }
    } catch (e) {
      errs++;
      if (errs < 5) console.log(`\n   ⚠️  ${path} — ${e.message}`);
    }
    if ((i + 1) % 25 === 0 || i === paths.length - 1) {
      process.stdout.write(`\r   path ${i + 1}/${paths.length} — unique products: ${bySku.size} | json=${jsonOk} spa=${spaFallback}   `);
    }
    if (bySku.size >= LIMIT) break;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log(`\n   fetched ${bySku.size} unique products (${jsonOk} json paths, ${spaFallback} SPA-fallback, ${errs} errors)`);

  let items = [...bySku.values()].map(toOfferItem).filter((it) => it && it.name);
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} real offers ready to ingest`);

  const report = await ingestOffers({ chain: 'kritikos', source: 'web', items, dryRun: DRY_RUN });

  // Phase 9 baseline (opt-in BASELINE=1): snapshot the NON-offer products we
  // already have in hand at their shelf price. Excludes anything that ingested
  // as an offer (its price is the promo price, captured there). Secondary +
  // best-effort — a failure here never fails the offer run.
  if (process.env.BASELINE === '1') {
    try {
      const offerSkus = new Set(items.map((it) => String(it.chainItemcode)));
      let baseline = [...bySku.values()]
        .filter((p) => p.sku && !offerSkus.has(String(p.sku)))
        .map(toBaselineItem)
        .filter(Boolean);
      if (baseline.length > LIMIT) baseline = baseline.slice(0, LIMIT);
      console.log(`   ${baseline.length} non-offer catalog items for baseline`);
      await ingestBaseline({ chain: 'kritikos', items: baseline, dryRun: DRY_RUN });
    } catch (e) {
      console.log(`   ⚠️ baseline pass failed (non-fatal): ${e.message}`);
    }
  }

  printReport(report);
  process.exit(report.healthOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
