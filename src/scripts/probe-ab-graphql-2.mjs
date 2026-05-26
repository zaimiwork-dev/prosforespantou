// Follow-up to probe-ab-graphql.mjs — test remaining candidate field names
// in small batches so we don't hit AB's GraphQL validation-error limit.

const ENDPOINT = 'https://www.ab.gr/api/v1/';
const KNOWN_PRODUCT_CODE = '7603950';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': UA,
  'Origin': 'https://www.ab.gr',
  'Referer': 'https://www.ab.gr/',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
};

// Untested candidates from the first probe (it hit error limit at eanCode)
const REMAINING_CANDIDATES = [
  ['barcode', 'productBarcode', 'upc'],
  ['sku', 'articleNumber', 'masterArticleNumber'],
  ['identifier', 'erpId', 'eanCodes'],
  ['baseProductCode', 'productLine', 'unitOfMeasure'],
  ['salesUnit', 'unitDescription', 'manufacturerSubBrandName'],
];

async function tryBatch(fields) {
  const query = `
    query ProbeProduct($products: String!, $lang: String!) {
      productsFromCategory(
        products: $products
        lang: $lang
        hideUnavailableProducts: true
        maxItemsToDisplay: 1
      ) {
        products {
          code
          name
          ${fields.join('\n          ')}
        }
      }
    }
  `;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables: { products: KNOWN_PRODUCT_CODE, lang: 'gr' } }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function main() {
  const found = [];
  const missing = [];

  for (const batch of REMAINING_CANDIDATES) {
    console.log(`\n→ Testing batch: ${batch.join(', ')}`);
    const r = await tryBatch(batch);
    if (!r.json) {
      console.log(`   HTTP ${r.status} — not JSON: ${r.text.slice(0, 200)}`);
      continue;
    }
    const errs = r.json.errors || [];
    const missingInBatch = new Set();
    for (const e of errs) {
      const m = (e.message || '').match(/Cannot query field "([^"]+)" on type "Product"/);
      if (m) missingInBatch.add(m[1]);
    }
    for (const f of batch) {
      if (missingInBatch.has(f)) missing.push(f);
      else if (r.json.data) {
        // Field accepted — check if data is non-null
        const products = r.json.data?.productsFromCategory?.products || [];
        const val = products[0]?.[f];
        console.log(`   ✅ "${f}" EXISTS on Product. value = ${JSON.stringify(val)}`);
        found.push({ field: f, value: val });
      }
    }
    // Print any non-field-existence errors (might reveal query shape issues)
    const otherErrs = errs.filter((e) => !/Cannot query field/i.test(e.message || ''));
    if (otherErrs.length) {
      console.log(`   other errors: ${otherErrs.slice(0, 3).map((e) => e.message.slice(0, 120)).join(' | ')}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n────────────────────────────────────────');
  console.log(`📊 Fields that EXIST on Product: ${found.length}`);
  found.forEach((f) => console.log(`   • ${f.field}: ${JSON.stringify(f.value)}`));
  console.log(`📊 Fields confirmed MISSING: ${missing.length}`);
  console.log(`   ${missing.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
