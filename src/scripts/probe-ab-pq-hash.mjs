// Probe: what persisted-query hash does AB's frontend currently use?
//
// Read-only, no DB, no writes. Prints ranked candidates with the surrounding
// bundle context so a human can confirm the shape before we trust discovery
// automatically. Run it in CI — www.ab.gr blocks this project's dev machine
// but serves GitHub runners:
//
//   gh workflow run scrape-chains.yml -f chain=ab-pq-probe
//
// Background in src/scripts/lib/ab-persisted-query.mjs.
import {
  discoverPersistedQueryHash,
  verifyHash,
  KNOWN_PQ_HASH,
  AB_ORIGIN,
} from './lib/ab-persisted-query.mjs';

const OPERATION = process.env.OPERATION || 'ProductList';
const ENDPOINT = `${AB_ORIGIN}/api/v1/`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'el-GR,el;q=0.9',
};
const API_HEADERS = {
  ...HEADERS,
  Accept: 'application/json',
  Origin: AB_ORIGIN,
  Referer: `${AB_ORIGIN}/search/promotions`,
  'x-apollo-operation-name': OPERATION,
  'apollo-require-preflight': 'true',
};

// One cheap page — enough to tell "hash accepted" from "PersistedQueryNotFound".
function buildUrl(hash) {
  const variables = encodeURIComponent(JSON.stringify({
    productListingType: 'PROMOTION_SEARCH', lang: 'gr',
    productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
    keywords: '', productTypes: '', lazyLoadCount: 10, pageNumber: 0,
    sort: '', searchQuery: '', hideProductsWithoutPromo: false,
    hideUnavailableProducts: true, maxItemsToDisplay: 0,
    includePotentialActivatableOffers: true,
  }));
  const ext = encodeURIComponent(JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: hash },
  }));
  return `${ENDPOINT}?operationName=${OPERATION}&variables=${variables}&extensions=${ext}`;
}

console.log(`\n=== AB persisted-query probe — operation=${OPERATION} ===\n`);

// 1. Is the currently-hardcoded hash actually dead? Say so explicitly: if it
//    still works, whatever broke the adapter is NOT the hash.
process.stdout.write(`baseline: known hash ${KNOWN_PQ_HASH.slice(0, 12)}… `);
let baselineOk = false;
try {
  baselineOk = await verifyHash({ hash: KNOWN_PQ_HASH, buildUrl, headers: API_HEADERS });
  console.log(baselineOk ? 'STILL WORKS' : 'REJECTED (PersistedQueryNotFound or errors)');
} catch (e) {
  console.log(`probe failed: ${e.message}`);
}

// 2. Read the current hash back out of the frontend bundles.
let ranked = [];
try {
  ranked = await discoverPersistedQueryHash({
    operationName: OPERATION,
    log: (m) => console.log(`  ${m}`),
    headers: HEADERS,
  });
} catch (e) {
  console.error(`\n discovery failed: ${e.message}`);
}

console.log(`\n--- ranked candidates (closest to the operation name first) ---`);
if (!ranked.length) console.log('  none found');
for (const c of ranked.slice(0, 10)) {
  console.log(`\n  ${c.hash}`);
  console.log(`    distance ${c.distance} chars${c.source ? ` · ${c.source.split('/').pop()}` : ' · inline HTML'}`);
  console.log(`    …${c.context}…`);
}

// 3. Verify each candidate against the live API, so we report a hash that
//    actually answers rather than one that merely looks plausible.
console.log(`\n--- verification against ${ENDPOINT} ---`);
let winner = null;
for (const c of ranked.slice(0, 10)) {
  process.stdout.write(`  ${c.hash.slice(0, 16)}… `);
  let ok = false;
  try { ok = await verifyHash({ hash: c.hash, buildUrl, headers: API_HEADERS }); }
  catch (e) { console.log(`error: ${e.message}`); continue; }
  console.log(ok ? 'ACCEPTED ✅' : 'rejected');
  if (ok) { winner = c.hash; break; }
}

console.log('\n=== RESULT ===');
if (winner) {
  console.log(`working hash: ${winner}`);
  console.log(winner === KNOWN_PQ_HASH
    ? 'Same as the hardcoded one — no rotation.'
    : 'DIFFERENT from the hardcoded one — the hash rotated; auto-recovery should adopt this.');
} else if (baselineOk) {
  console.log('The hardcoded hash still works; discovery found no better candidate.');
} else {
  console.log('No working hash found. Discovery needs a wider net — check the context dumps above.');
  process.exitCode = 1;
}
