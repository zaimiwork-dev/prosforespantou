// Probe AB Vassilopoulos GraphQL schema for EAN / GTIN / barcode fields on the Product type.
// Two strategies: (1) full schema introspection, (2) speculative query of a known product
// requesting all likely EAN field names — GraphQL errors will tell us which fields actually exist.

import fs from 'fs';
import path from 'path';

const ENDPOINT = 'https://www.ab.gr/api/v1/';
const OUT_DIR = './library_data/barcode_probe_ab';
const KNOWN_PRODUCT_CODE = '7603950'; // from earlier probe response
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': UA,
  'Origin': 'https://www.ab.gr',
  'Referer': 'https://www.ab.gr/',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
};

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function gql(body, label) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  fs.writeFileSync(path.join(OUT_DIR, `gql_${label}.json`), text);
  return { status: res.status, json, text };
}

// ---------- Strategy 1: introspection ----------
async function introspect() {
  console.log('🔍 Strategy 1: GraphQL introspection');
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        types {
          name
          kind
          fields {
            name
            type { name kind ofType { name kind } }
          }
        }
      }
    }
  `;
  const r = await gql({ query: introspectionQuery }, 'introspection');
  console.log(`   HTTP ${r.status}`);
  if (!r.json) { console.log(`   not JSON; first 300 chars: ${r.text.slice(0, 300)}`); return null; }
  if (r.json.errors) { console.log(`   errors: ${JSON.stringify(r.json.errors).slice(0, 400)}`); return null; }
  const types = r.json?.data?.__schema?.types || [];
  if (!types.length) { console.log('   no types returned'); return null; }
  console.log(`   ✅ introspection returned ${types.length} types`);

  const eanFields = [];
  for (const t of types) {
    if (!t.fields) continue;
    for (const f of t.fields) {
      if (/gtin|ean|barcode|sku/i.test(f.name)) {
        eanFields.push({ type: t.name, field: f.name, fieldType: f.type?.name || f.type?.ofType?.name });
      }
    }
  }
  console.log(`   🎯 EAN-shaped field matches across ALL types: ${eanFields.length}`);
  eanFields.forEach((e) => console.log(`      ${e.type}.${e.field} : ${e.fieldType}`));

  const productType = types.find((t) => t.name === 'Product' || /^Product[A-Z]/.test(t.name || ''));
  if (productType) {
    console.log(`\n   📋 Fields on type "${productType.name}":`);
    productType.fields?.forEach((f) => console.log(`      - ${f.name} : ${f.type?.name || f.type?.ofType?.name || '?'}`));
  }
  return { types, eanFields };
}

// ---------- Strategy 2: speculative field request ----------
// If GraphQL errors on unknown fields with "did you mean..." that's gold.
const CANDIDATE_FIELDS = [
  'gtin', 'gtin13', 'gtin12', 'gtin8', 'ean', 'ean13', 'eanCode',
  'barcode', 'productBarcode', 'upc', 'sku', 'unitOfMeasure', 'unitDescription',
  'salesUnit', 'baseProduct', 'manufacturerName', 'manufacturerSubBrandName',
  'productLine', 'productCode', 'identifier', 'erpId', 'masterArticleNumber',
];

async function speculativeQuery() {
  console.log('\n🔍 Strategy 2: speculative field probe on known product code');
  // Use the same operationName + variables shape we saw in the captured network call,
  // but request our speculative fields instead of PRODUCT_TILE.
  const query = `
    query ProbeProduct($products: String!, $lang: String!) {
      productsFromCategory(
        products: $products
        lang: $lang
        availableFromDays: 7
        hideUnavailableProducts: true
        maxItemsToDisplay: 1
        source: PRODUCT
        fields: PRODUCT_TILE
      ) {
        products {
          code
          name
          ${CANDIDATE_FIELDS.join('\n          ')}
        }
      }
    }
  `;
  const r = await gql(
    { query, variables: { products: KNOWN_PRODUCT_CODE, lang: 'gr' } },
    'speculative'
  );
  console.log(`   HTTP ${r.status}`);
  if (!r.json) { console.log(`   not JSON; first 300 chars: ${r.text.slice(0, 300)}`); return; }
  if (r.json.errors) {
    console.log(`   GraphQL errors (this is informative — shows which fields don't exist):`);
    r.json.errors.slice(0, 30).forEach((e) => {
      console.log(`      • ${(e.message || '').slice(0, 200)}`);
    });
  }
  if (r.json.data) {
    console.log(`\n   ✅ data returned:`);
    console.log(JSON.stringify(r.json.data, null, 2).slice(0, 1500));
  }
}

async function main() {
  const intro = await introspect();
  await speculativeQuery();

  console.log('\n📁 Raw responses saved to:');
  console.log(`   ${path.join(OUT_DIR, 'gql_introspection.json')}`);
  console.log(`   ${path.join(OUT_DIR, 'gql_speculative.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
