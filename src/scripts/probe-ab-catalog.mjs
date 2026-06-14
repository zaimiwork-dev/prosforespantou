// AB catalog discovery v2 (CI). PROMOTION_SEARCH works but the full catalog
// needs a category code. Goal of this pass: find (a) the product field that
// holds category code(s), (b) any barcode/gtin field, (c) a category-code source
// (facets / breadcrumbs), then confirm CATEGORY_SEARCH returns a category's
// products. Output is everything needed to build the category-walking feeder.

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
async function call(vars) {
  const res = await fetch(buildUrl(vars), { headers: HEADERS });
  const j = await res.json().catch(() => null);
  return j?.data?.productList || null;
}

async function run() {
  console.log('🔎 AB catalog discovery v2');
  const pl = await call({ productListingType: 'PROMOTION_SEARCH' });
  if (!pl) { console.log('no productList'); return; }

  console.log('\nproductList top-level keys:', Object.keys(pl).join(', '));

  // Facets often carry the full category tree with codes + counts.
  const facets = pl.facets || pl.facetData || [];
  console.log(`\nfacets: ${Array.isArray(facets) ? facets.length : typeof facets}`);
  if (Array.isArray(facets)) {
    for (const f of facets.slice(0, 12)) {
      const code = f.code || f.name || f.key;
      const vals = (f.values || f.facetValues || []).slice(0, 4)
        .map((v) => `${v.code || v.name}=${v.code || v.query?.query?.value || ''}(${v.count ?? '?'})`).join(' ');
      console.log(`  facet ${code}: ${vals}`);
    }
  }
  if (pl.breadcrumbs) console.log('\nbreadcrumbs:', JSON.stringify(pl.breadcrumbs).slice(0, 300));
  if (pl.categories) console.log('\ncategories:', JSON.stringify(pl.categories).slice(0, 400));

  const p = pl.products?.[0];
  if (p) {
    console.log('\nproduct keys:', Object.keys(p).join(', '));
    console.log('\nfull first product:', JSON.stringify(p).slice(0, 1400));
  }

  // Try a CATEGORY_SEARCH with any category code we can find.
  let catCode = null;
  if (Array.isArray(facets)) {
    const catFacet = facets.find((f) => /categor/i.test(f.code || f.name || ''));
    catCode = catFacet?.values?.[0]?.code || catFacet?.values?.[0]?.name || null;
  }
  catCode = catCode || p?.categories?.[0]?.code || p?.firstLevelCategory?.code || p?.superCategoryCode || null;
  console.log(`\nharvested categoryCode candidate: ${catCode}`);
  if (catCode) {
    const cat = await call({ productListingType: 'CATEGORY_SEARCH', categoryCode: String(catCode) });
    console.log(`CATEGORY_SEARCH("${catCode}") → totalResults=${cat?.pagination?.totalResults ?? '?'}`);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
