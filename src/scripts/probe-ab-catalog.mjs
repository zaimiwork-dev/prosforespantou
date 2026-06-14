// One-shot AB catalog discovery (runs in CI — Akamai blocks dev machines).
//
// The offers adapter uses the ProductList persisted query with
// productListingType:'PROMOTION_SEARCH'. To get the FULL catalog we need the
// listing type that returns ALL products. Persisted queries accept arbitrary
// variables, so we reuse the same hash and:
//   1. send an INVALID productListingType — AB's GraphQL validation error should
//      enumerate the VALID values (that's the discovery goldmine);
//   2. try a few plausible types + report pagination.totalResults so we can see
//      which one returns ~the whole catalog (vs ~hundreds of promos);
//   3. check whether a product carries a barcode/gtin field.

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

function buildUrl(vars) {
  const variables = encodeURIComponent(JSON.stringify({
    productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
    keywords: '', productTypes: '', lazyLoadCount: 10, pageNumber: 0,
    sort: '', searchQuery: '', hideProductsWithoutPromo: false,
    hideUnavailableProducts: true, maxItemsToDisplay: 0, includePotentialActivatableOffers: true,
    lang: 'gr', ...vars,
  }));
  const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PQ_HASH } }));
  return `${ENDPOINT}?operationName=ProductList&variables=${variables}&extensions=${ext}`;
}

async function probe(label, vars) {
  try {
    const res = await fetch(buildUrl(vars), { headers: HEADERS });
    const j = await res.json().catch(() => null);
    if (j?.errors) {
      console.log(`\n[${label}] HTTP ${res.status} — errors:`);
      j.errors.slice(0, 4).forEach((e) => console.log(`   • ${(e.message || '').slice(0, 280)}`));
      return;
    }
    const pl = j?.data?.productList;
    const total = pl?.pagination?.totalResults;
    const p0 = pl?.products?.[0];
    const bc = p0 ? (p0.gtin || p0.ean || p0.barcode || p0.code) : null;
    console.log(`\n[${label}] HTTP ${res.status} — totalResults=${total ?? '?'} firstProduct=${p0?.name?.slice(0, 30) || 'none'} code=${p0?.code} barcodeish=${bc}`);
  } catch (e) {
    console.log(`\n[${label}] threw: ${e.message}`);
  }
}

async function run() {
  console.log('🔎 AB catalog discovery');
  await probe('baseline PROMOTION_SEARCH', { productListingType: 'PROMOTION_SEARCH' });
  await probe('INVALID (reveals enum)', { productListingType: 'ZZZ_INVALID_PROBE' });
  await probe('CATEGORY_SEARCH (empty cat)', { productListingType: 'CATEGORY_SEARCH' });
  await probe('SEARCH', { productListingType: 'SEARCH' });
  await probe('PROMO + show all', { productListingType: 'PROMOTION_SEARCH', hideProductsWithoutPromo: false, includePotentialActivatableOffers: false });
}

run().catch((e) => { console.error(e); process.exit(1); });
