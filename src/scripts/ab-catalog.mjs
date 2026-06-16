// AB Vasilopoulos FULL-CATALOG scraper (CI only — Akamai 403s dev machines).
//
// Discovered via probe-ab-catalog: the full catalog is the ProductList persisted
// query with productListingType:'CATEGORY' + a root categoryCode, paginated.
// The rootCategoryFacet lists the ~14 departments that cover the whole store
// (~10k products). AB exposes no GTIN → SKU-keyed Products (code) via
// ingestCatalog. `price.value` is the regular shelf price (current promos are
// captured separately by the offers adapter), so every category product yields
// a 'normal' baseline.
//
// Usage (runs in CI):
//   node src/scripts/ab-catalog.mjs
//   DRY_RUN=1 / LIMIT=N for smoke tests.
//
// dotenv first (ESM hoist trap — DB import comes later via ingest-catalog).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { mirrorImages } from './lib/mirror-images.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = envInt('PACE_MS', 900);
const JITTER_MS = envInt('JITTER_MS', 500);
const PAGE_SIZE = 50;
const MAX_PAGES = envInt('MAX_PAGES', 400);

const ENDPOINT = 'https://www.ab.gr/api/v1/';
const PQ_HASH = '1c53d86bec1b38b5767f39df2af0949e3bb90ce2a0afa177829d93cf26905800';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9',
  Origin: 'https://www.ab.gr',
  Referer: 'https://www.ab.gr/search',
  'x-apollo-operation-name': 'ProductList',
  'apollo-require-preflight': 'true',
};
// Fallback if the rootCategoryFacet ever comes back empty (departments rarely change).
const FALLBACK_ROOTS = ['001','002','003','004','005','006','007','008','009','010','011','012','013','014'];

function buildUrl(vars) {
  const variables = encodeURIComponent(JSON.stringify({
    productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
    keywords: '', productTypes: '', lazyLoadCount: PAGE_SIZE, pageNumber: 0,
    sort: '', searchQuery: '', hideProductsWithoutPromo: false,
    hideUnavailableProducts: true, maxItemsToDisplay: 0, includePotentialActivatableOffers: false,
    lang: 'gr', ...vars,
  }));
  const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PQ_HASH } }));
  return `${ENDPOINT}?operationName=ProductList&variables=${variables}&extensions=${ext}`;
}

async function fetchList(vars) {
  const res = await fetchWithBackoff(buildUrl(vars), { headers: HEADERS }, {
    label: `AB catalog ${vars.categoryCode || vars.productListingType || 'roots'} p${vars.pageNumber ?? 0}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data?.productList || null;
}

function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const pref = ['respListGrid', 'small', 'zoom', 'xlarge'];
  let url = null;
  for (const f of pref) { const img = images.find((i) => i.format === f); if (img) { url = img.url; break; } }
  url = url || images[0].url;
  return url?.startsWith('http') ? url : `https://www.ab.gr${url}`;
}

function toCatalogItem(p) {
  const price = p.price?.value;
  if (!p.code || !p.name || !(price > 0)) return null;
  return {
    chainItemcode: String(p.code),
    name: p.name.trim(),
    price,                                   // regular shelf price
    imageUrl: pickImage(p.images),
    brand: p.manufacturerName?.trim() || null,
    barcode: null,                           // AB exposes no GTIN
    baseline: true,
  };
}

async function getRoots() {
  try {
    const pl = await fetchList({ productListingType: 'PROMOTION_SEARCH' });
    const f = (pl?.facets || []).find((x) => /rootCategor/i.test(x.code || x.name || ''));
    const roots = (f?.values || []).map((v) => v.code || v.name).filter(Boolean);
    if (roots.length) return roots;
  } catch { /* fall through */ }
  return FALLBACK_ROOTS;
}

async function run() {
  console.log(`🛒 AB catalog scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const roots = await getRoots();
  console.log(`   ${roots.length} root categories: ${roots.join(',')}`);

  const byCode = new Map();
  const extraWarnings = [];
  for (const code of roots) {
    let total = null, pages = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      let pl;
      try { pl = await fetchList({ productListingType: 'CATEGORY', categoryCode: String(code), pageNumber: page }); }
      catch (e) {
        const warning = `Category ${code} page ${page} failed (${e.message}); skipped rest of category.`;
        console.log(`\n   ${warning}`);
        extraWarnings.push(warning);
        break;
      }
      if (total == null) { total = pl?.pagination?.totalResults; pages = pl?.pagination?.totalPages; }
      const prods = pl?.products || [];
      for (const p of prods) if (p.code != null) byCode.set(String(p.code), p);
      process.stdout.write(`\r   cat ${code}: p${page + 1}/${pages ?? '?'} — unique total ${byCode.size}     `);
      if (pages != null && page + 1 >= pages) break;
      if (prods.length === 0) break;
      if (byCode.size >= LIMIT) break;
      await pace(PACE_MS, JITTER_MS);
    }
    console.log('');
    if (byCode.size >= LIMIT) break;
  }

  let items = [...byCode.values()].map(toCatalogItem).filter(Boolean);
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} catalog products ready`);

  // Self-host AB images — OFF by default: with ~8k products the per-item writes
  // already fill the job budget, and inline mirroring (1k+ slow uploads) timed
  // the run out. Images drain separately/incrementally via mirror-catalog
  // (CHAIN=ab). Set MIRROR_IMAGES=1 to mirror inline (bounded by MIRROR_MAX_NEW).
  if (!DRY_RUN && process.env.MIRROR_IMAGES === '1') {
    await mirrorImages({
      chain: 'ab',
      items,
      match: (u) => u.includes('www.ab.gr'),
      maxNew: parseInt(process.env.MIRROR_MAX_NEW || '800', 10),
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        'Accept-Language': HEADERS['Accept-Language'],
        Referer: HEADERS.Referer,
      },
    });
  }

  const report = await ingestCatalog({ chain: 'ab', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\n✅ AB catalog — created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors} (of ${report.total})`);
  process.exit(0);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
