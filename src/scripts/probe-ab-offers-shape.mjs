// AB offers shape probe (CI, read-only). Written 2026-09-23: from 09-18 the
// ab-offers job reads `page 1/117 — unique: 0/1169` — pagination parses, the
// hash is accepted, but no product with a `code` comes back — while
// ab-catalog, same hash and same `productList.products` path, still returns
// 11k products. This asks the PROMOTION_SEARCH listing in a few shapes and
// prints what the response actually holds, so the fix follows the evidence.
// Logs only, no DB writes (the DB is read once, for the persisted-query hash).
import 'dotenv/config';
import { AB_ENDPOINT, AB_API_HEADERS, KNOWN_PQ_HASH, resolvePqHash } from './lib/ab-persisted-query.mjs';

let hash = KNOWN_PQ_HASH;
try {
  const { default: prisma } = await import('../lib/prisma.ts');
  hash = await resolvePqHash(prisma, (m) => console.log(m));
  await prisma.$disconnect();
} catch (e) {
  console.log(`hash from DB failed (${e.message}) — using the compiled-in one`);
}

const BASE = {
  productListingType: 'PROMOTION_SEARCH', lang: 'gr',
  productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
  keywords: '', productTypes: '', lazyLoadCount: 10, pageNumber: 0,
  sort: '', searchQuery: '', hideProductsWithoutPromo: false,
  hideUnavailableProducts: true, maxItemsToDisplay: 0,
  includePotentialActivatableOffers: true,
};

function url(vars) {
  const variables = encodeURIComponent(JSON.stringify({ ...BASE, ...vars }));
  const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));
  return `${AB_ENDPOINT}?operationName=ProductList&variables=${variables}&extensions=${ext}`;
}

const VARIANTS = [
  ['as the adapter asks today', {}],
  ['activatable offers OFF', { includePotentialActivatableOffers: false }],
  ['page size 50', { lazyLoadCount: 50 }],
  ['activatable OFF + size 50', { includePotentialActivatableOffers: false, lazyLoadCount: 50 }],
  ['hideProductsWithoutPromo ON', { hideProductsWithoutPromo: true }],
  ['page 2 (pageNumber 1)', { pageNumber: 1 }],
];

for (const [label, vars] of VARIANTS) {
  console.log(`\n=== ${label} ===`);
  try {
    const res = await fetch(url(vars), { headers: AB_API_HEADERS });
    console.log(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.errors) console.log('errors:', JSON.stringify(j.errors).slice(0, 400));
    const pl = j.data?.productList;
    if (!pl) { console.log('no data.productList; data keys:', Object.keys(j.data || {})); continue; }
    console.log('productList keys:', Object.keys(pl).join(', '));
    console.log('pagination:', JSON.stringify(pl.pagination));
    const prods = pl.products;
    console.log('products:', Array.isArray(prods) ? `array(${prods.length})` : typeof prods);
    if (Array.isArray(prods) && prods.length) {
      const withCode = prods.filter((p) => p?.code != null).length;
      console.log(`with code: ${withCode}/${prods.length}`);
      console.log('first product keys:', Object.keys(prods[0] || {}).join(', '));
      console.log('first product (truncated):', JSON.stringify(prods[0]).slice(0, 700));
    }
    // Anything else array-shaped might be where the products went.
    for (const [k, v] of Object.entries(pl)) {
      if (k !== 'products' && Array.isArray(v)) console.log(`other array: ${k} (${v.length})`);
    }
  } catch (e) {
    console.log('threw:', e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
