// Kritikos canonical-catalog scraper.
// Walks Kritikos's full category tree, fetches each leaf's Next.js page JSON,
// extracts every product (offer or not), and upserts Product rows by `barcode`.
//
// Goal: grow the canonical catalog with Kritikos-specific items the Wolt
// scrape doesn't cover, so the Kritikos offers adapter can match deterministically
// on barcode and bypass the Review Queue.
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
//   - The Next.js buildId in the data URLs changes on each Kritikos deploy. We
//     scrape it fresh from the homepage HTML on every run.
//   - Some deeper category paths return Next.js SPA fallback HTML instead of
//     JSON. We detect that via content-type and skip — products under those
//     paths are usually reachable via a parent category's staticProducts (which
//     is keyed by descendant category ObjectId).

import 'dotenv/config';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '200', 10);

const CHAIN_SLUG = 'kritikos';
const STORE_NAME = 'Κρητικός';

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
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

async function getBuildId() {
  const r = await fetch(HOME + '/', { headers: { ...HEADERS, Accept: 'text/html' } });
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
  const r = await fetch(url, { headers: HEADERS });
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

async function ensureStore(prisma) {
  let store = await prisma.store.findUnique({ where: { name: STORE_NAME } });
  if (!store) {
    console.log(`   creating Store "${STORE_NAME}"`);
    store = await prisma.store.create({ data: { name: STORE_NAME } });
  }
  return store;
}

async function upsertProduct(prisma, product, storeId) {
  const barcode = pickBarcode(product.barcodes);
  if (!barcode) return { status: 'skipped-no-barcode' };

  const updatableData = {
    name: (product.name || '').trim(),
    description: (product.description || '').trim() || null,
    imageUrl: pickImageUrl(product),
    unitInfo: (product.quantity || '').trim() || null,
    brand: (product.brand || '').trim() || null,
  };

  const existing = await prisma.product.findUnique({ where: { barcode } });
  if (existing) {
    // Refresh fields but preserve original supermarket/storeId — don't
    // re-tag shared products that came in via another chain's scrape.
    await prisma.product.update({ where: { id: existing.id }, data: updatableData });
    return { status: 'updated', productId: existing.id };
  }
  const created = await prisma.product.create({
    data: { ...updatableData, barcode, storeId, supermarket: CHAIN_SLUG },
  });
  return { status: 'created', productId: created.id };
}

async function run() {
  console.log(`🛒 Kritikos canonical scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);

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
      if (errors < 5) console.log(`\n   ⚠️  ${path} — ${e.message}`);
    }
    if ((i + 1) % 20 === 0 || i === paths.length - 1) {
      process.stdout.write(`\r   path ${i + 1}/${paths.length} (d=${depth}) — unique products: ${bySku.size} | json=${jsonOk} spa=${spaFallback}    `);
    }
    if (bySku.size >= LIMIT) break;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log('');

  const products = [...bySku.values()];
  const withBarcode = products.filter((p) => pickBarcode(p.barcodes));
  console.log(`\n📦 ${products.length} unique products fetched`);
  console.log(`   with usable barcode: ${withBarcode.length} (${((withBarcode.length / Math.max(1, products.length)) * 100).toFixed(1)}%)`);
  console.log(`   no barcode (skip):   ${products.length - withBarcode.length}`);
  console.log(`   paths fetched=${fetched} jsonOk=${jsonOk} spaFallback=${spaFallback} errors=${errors}`);

  if (DRY_RUN) {
    console.log('\n🔎 DRY_RUN — sample of first 5 products that would be written:');
    withBarcode.slice(0, 5).forEach((p) => {
      const b = pickBarcode(p.barcodes);
      const img = pickImageUrl(p) ? '[img]' : '';
      console.log(`   ${b}  ${p.name}  (${p.quantity || ''})  brand=${p.brand || '?'}  ${img}`);
    });
    console.log('\n(no DB writes — set DRY_RUN=0 or remove env var to commit)');
    return;
  }

  const { default: prisma } = await import('../lib/prisma.ts');
  const store = await ensureStore(prisma);
  console.log(`   storeId=${store.id} chain="${CHAIN_SLUG}"`);

  let created = 0, updated = 0, skipped = 0, errs = 0;
  for (let i = 0; i < withBarcode.length; i++) {
    const p = withBarcode[i];
    try {
      const r = await upsertProduct(prisma, p, store.id);
      if (r.status === 'created') created++;
      else if (r.status === 'updated') updated++;
      else skipped++;
    } catch (e) {
      errs++;
      if (errs < 5) console.log(`\n   ❌ sku=${p.sku} (${p.name}) — ${e.message}`);
    }
    if ((i + 1) % 100 === 0 || i === withBarcode.length - 1) {
      process.stdout.write(`\r   ${i + 1}/${withBarcode.length}: created=${created} updated=${updated} skipped=${skipped} err=${errs}    `);
    }
  }
  console.log('');

  console.log(`\n✅ DONE`);
  console.log(`   paths walked:           ${paths.length}`);
  console.log(`   products fetched:       ${products.length}`);
  console.log(`   with barcode:           ${withBarcode.length}`);
  console.log(`   Product rows created:   ${String(created).padStart(5)}`);
  console.log(`   Product rows updated:   ${String(updated).padStart(5)}`);
  console.log(`   skipped (no barcode):   ${String(skipped).padStart(5)}`);
  console.log(`   errors:                 ${errs}`);

  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
