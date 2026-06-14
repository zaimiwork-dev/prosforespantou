// AB catalog discovery v3 (CI). v2 found: category codes are 3-digit
// (firstLevelCategory.code "005" = Κατεψυγμένα, url /c/005), rootCategoryFacet
// lists roots. CATEGORY_SEARCH("006") gave 0 — but the sample product lives in
// 005. Pin down the working listing-type + categoryCode + flag combo, then dump
// the rootCategoryFacet codes so the feeder can walk every department.

const ENDPOINT = 'https://www.ab.gr/api/v1/';
const PQ_HASH = '1c53d86bec1b38b5767f39df2af0949e3bb90ce2a0afa177829d93cf26905800';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json', 'Accept-Language': 'el-GR,el;q=0.9',
  Origin: 'https://www.ab.gr', Referer: 'https://www.ab.gr/search',
  'x-apollo-operation-name': 'ProductList', 'apollo-require-preflight': 'true',
};
function buildUrl(vars) {
  const variables = encodeURIComponent(JSON.stringify({
    productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
    keywords: '', productTypes: '', lazyLoadCount: 24, pageNumber: 0,
    sort: '', searchQuery: '', hideProductsWithoutPromo: false,
    hideUnavailableProducts: true, maxItemsToDisplay: 0, includePotentialActivatableOffers: true,
    lang: 'gr', ...vars,
  }));
  const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PQ_HASH } }));
  return `${ENDPOINT}?operationName=ProductList&variables=${variables}&extensions=${ext}`;
}
async function total(label, vars) {
  try {
    const res = await fetch(buildUrl(vars), { headers: HEADERS });
    const j = await res.json().catch(() => null);
    if (j?.errors) { console.log(`  ${label}: ERROR ${(j.errors[0]?.message||'').slice(0,120)}`); return; }
    const pl = j?.data?.productList;
    console.log(`  ${label}: total=${pl?.pagination?.totalResults ?? '?'} got=${pl?.products?.length ?? 0}`);
  } catch (e) { console.log(`  ${label}: threw ${e.message}`); }
}

async function run() {
  console.log('🔎 AB catalog discovery v3 — category-walk combos');
  // Dump root category codes (departments) for the feeder.
  const res = await fetch(buildUrl({ productListingType: 'PROMOTION_SEARCH' }), { headers: HEADERS });
  const pl = (await res.json())?.data?.productList;
  const rootFacet = (pl?.facets || []).find((f) => /rootCategor/i.test(f.code || f.name || ''));
  const roots = (rootFacet?.values || []).map((v) => v.code || v.name);
  console.log(`rootCategoryFacet codes: ${roots.join(', ') || 'none'}\n`);

  for (const code of ['005', '006', '010']) {
    console.log(`categoryCode ${code}:`);
    await total('CATEGORY_SEARCH +promoFlags', { productListingType: 'CATEGORY_SEARCH', categoryCode: code });
    await total('CATEGORY_SEARCH cleanFlags', { productListingType: 'CATEGORY_SEARCH', categoryCode: code, hideProductsWithoutPromo: false, includePotentialActivatableOffers: false });
    await total('CATEGORY (no _SEARCH)', { productListingType: 'CATEGORY', categoryCode: code });
    await total('no type, categoryCode only', { categoryCode: code });
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
