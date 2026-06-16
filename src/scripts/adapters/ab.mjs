// AB Vasilopoulos adapter.
//
// Fetches current offers from ab.gr's GraphQL API (pure HTTP, no browser) and
// hands them to the shared ingest pipeline. See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/ab.mjs            # all real price offers
//   DRY_RUN=1 node src/scripts/adapters/ab.mjs  # fetch + match, no DB writes
//   INCLUDE_POINTS=1 ...                        # also ingest loyalty-points "offers"
//
// How it works:
//   1. Replays the ProductList GraphQL operation via Apollo persisted-query hash.
//      No full query string sent — just the SHA-256 the AB frontend uses.
//   2. Paginates pageNumber 0..N until short page or totalPages reached.
//   3. Filters to PRICE-AFFECTING promos by default. AB's PROMOTION_SEARCH
//      returns ~70% loyalty-points-only items; we skip those because they
//      aren't really discounts. Set INCLUDE_POINTS=1 to keep them.
//
// FRAGILITY NOTE: the persisted-query hash is tied to AB's frontend build. If
// AB redeploys, the hash may change and we'll get "PersistedQueryNotFound".
// Recovery is to re-capture via probe-ab-offers-capture.mjs and update PQ_HASH.

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { envInt, fetchWithBackoff, pace } from '../lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const INCLUDE_POINTS = process.env.INCLUDE_POINTS === '1';
const PACE_MS = envInt('PACE_MS', 900);
const JITTER_MS = envInt('JITTER_MS', 500);

const ENDPOINT = 'https://www.ab.gr/api/v1/';
const PQ_HASH = '1c53d86bec1b38b5767f39df2af0949e3bb90ce2a0afa177829d93cf26905800'; // ProductList
const PAGE_SIZE = 10;
const MAX_PAGES = envInt('MAX_PAGES', 200);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9',
  Origin: 'https://www.ab.gr',
  Referer: 'https://www.ab.gr/search/promotions',
  'x-apollo-operation-name': 'ProductList',
  'apollo-require-preflight': 'true',
};

// Promotion types that REALLY change the shelf price. Anything else is loyalty-only.
const PRICE_AFFECTING_PROMOS = new Set([
  'Buy X Get Percentage Off All Products',
  'Grocery Buy X get Y free',
  'Grocery Multi-buy',
  'Price Promotion',
  'percentageDiscount',
]);

function buildUrl(pageNumber) {
  const variables = encodeURIComponent(JSON.stringify({
    productListingType: 'PROMOTION_SEARCH', lang: 'gr',
    productCodes: '', categoryCode: '', excludedProductCodes: '', brands: '',
    keywords: '', productTypes: '', lazyLoadCount: PAGE_SIZE, pageNumber,
    sort: '', searchQuery: '', hideProductsWithoutPromo: false,
    hideUnavailableProducts: true, maxItemsToDisplay: 0, includePotentialActivatableOffers: true,
  }));
  const ext = encodeURIComponent(JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: PQ_HASH },
  }));
  return `${ENDPOINT}?operationName=ProductList&variables=${variables}&extensions=${ext}`;
}

async function fetchPage(pageNumber) {
  const res = await fetchWithBackoff(buildUrl(pageNumber), { headers: HEADERS }, { label: `AB offers page ${pageNumber + 1}` });
  if (!res.ok) throw new Error(`page ${pageNumber} HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors) {
    const persisted = j.errors.some((e) => /PersistedQueryNotFound/i.test(e.message || ''));
    if (persisted) throw new Error(`PersistedQueryNotFound — AB frontend hash changed. Re-run probe-ab-offers-capture.mjs and update PQ_HASH.`);
    throw new Error(`GraphQL errors: ${JSON.stringify(j.errors).slice(0, 300)}`);
  }
  return j.data?.productList;
}

// "€6,08" → 6.08
function parseEurFormatted(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// Pick a reasonable image, prefixed if relative.
function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const pref = ['respListGrid', 'small', 'zoom', 'xlarge'];
  let url = null;
  for (const f of pref) {
    const img = images.find((i) => i.format === f);
    if (img) { url = img.url; break; }
  }
  url = url || images[0].url;
  return url?.startsWith('http') ? url : `https://www.ab.gr${url}`;
}

// "31/05/2026 20:59:00" → Date (or null)
function parseAbDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, h = '00', mi = '00', ss = '00'] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+03:00`);
}

// AB product → contract OfferItem (or null to skip).
function toOfferItem(p) {
  const promos = p.potentialPromotions || [];
  if (!promos.length) return null;
  const isPriceAffecting = promos.some((pr) =>
    PRICE_AFFECTING_PROMOS.has(pr.promotionType) || pr.percentageDiscount != null
  );
  if (!isPriceAffecting && !INCLUDE_POINTS) return null;

  const regular = p.price?.value;
  const discounted = parseEurFormatted(p.price?.discountedPriceFormatted) ?? regular;
  if (!discounted || discounted <= 0) return null;
  const originalPrice = regular && regular > discounted ? regular : null;

  // Earliest endDate across promos
  const endDates = promos.map((pr) => parseAbDate(pr.endDate)).filter(Boolean);
  const validUntil = endDates.length ? new Date(Math.min(...endDates.map((d) => d.getTime()))) : null;

  const primaryType = promos.find((pr) => PRICE_AFFECTING_PROMOS.has(pr.promotionType))?.promotionType
    || promos[0].promotionType || null;

  return {
    name: p.name?.trim(),
    price: discounted,
    originalPrice,
    chainItemcode: String(p.code),
    barcode: null,
    brand: p.manufacturerName?.trim() || null,
    unit: p.price?.supplementaryPriceLabel2?.trim() || null,
    category: p.firstLevelCategory?.name?.trim() || 'Άλλο',
    imageUrl: pickImage(p.images),
    validUntil: validUntil ? validUntil.toISOString() : undefined,
    description: originalPrice ? null : primaryType,
    offerType: originalPrice ? 'strikethrough' : 'mono',
  };
}

async function run() {
  console.log(`🛒 AB adapter${DRY_RUN ? ' (DRY_RUN)' : ''}${INCLUDE_POINTS ? ' [+points]' : ''}`);

  const byCode = new Map();
  let totalResults = null, totalPages = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pl = await fetchPage(page);
    if (totalResults == null) {
      totalResults = pl?.pagination?.totalResults;
      totalPages = pl?.pagination?.totalPages;
    }
    const products = pl?.products || [];
    for (const p of products) if (p.code != null) byCode.set(String(p.code), p);
    process.stdout.write(`\r   page ${page + 1}/${totalPages ?? '?'} — unique: ${byCode.size}/${totalResults ?? '?'}   `);
    if (totalPages != null && page + 1 >= totalPages) break;
    if (products.length === 0) break;
    if (byCode.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  let items = [...byCode.values()].map(toOfferItem).filter((it) => it && it.name);
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} price-affecting offers (filtered from ${byCode.size} total promo rows)`);

  // www.ab.gr 403s every off-site image fetch (Vercel optimizer included), but
  // THIS context can reach it — mirror images to Supabase Storage and rewrite
  // imageUrl before ingest. No-op (originals kept + warning) without creds.
  let mirrorWarnings = [];
  if (!DRY_RUN) {
    const mirror = await mirrorImages({
      chain: 'ab',
      items,
      match: (u) => u.includes('www.ab.gr'),
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        'Accept-Language': HEADERS['Accept-Language'],
        Referer: HEADERS.Referer,
      },
    });
    mirrorWarnings = mirror.warnings;
  }

  const report = await ingestOffers({ chain: 'ab', source: 'web', items, dryRun: DRY_RUN, extraWarnings: mirrorWarnings });
  printReport(report);
  process.exit(report.healthOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
