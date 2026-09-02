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
// PERSISTED-QUERY HASH: tied to AB's frontend build, so an AB redeploy can
// rotate it and every request then answers "PersistedQueryNotFound". That is
// not hypothetical — it rotated ~2026-08-02 and this job failed nightly for
// five weeks, taking AB from ~255 live offers to 1, because recovery meant a
// human editing a constant.
// Now: the hash is read from ScraperState (recovered from AB's own frontend by
// src/scripts/recover-ab-pq-hash.mjs) and falls back to the compiled-in value.
// On PersistedQueryNotFound this exits with code 78 so CI can run the recovery
// and retry automatically.

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import {
  KNOWN_PQ_HASH,
  buildProductListUrl,
  resolvePqHash,
  AB_PQ_STATE_KEY,
} from '../lib/ab-persisted-query.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { envInt, fetchWithBackoff, pace } from '../lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const INCLUDE_POINTS = process.env.INCLUDE_POINTS === '1';
const PACE_MS = envInt('PACE_MS', 900);
const JITTER_MS = envInt('JITTER_MS', 500);

const ENDPOINT = 'https://www.ab.gr/api/v1/';
// The hash is resolved at run time: a value recovered from AB's live
// frontend (ScraperState) wins over this compiled-in fallback, so a rotation
// heals without a deploy. See lib/ab-persisted-query.mjs.
let PQ_HASH = KNOWN_PQ_HASH; // ProductList
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

// Shared with the probe and the recovery script so all three ask in the same
// shape — a mismatch there would make a good hash look broken.
function buildUrl(pageNumber) {
  return buildProductListUrl(PQ_HASH, pageNumber, PAGE_SIZE);
}

async function fetchPage(pageNumber) {
  const res = await fetchWithBackoff(buildUrl(pageNumber), { headers: HEADERS }, { label: `AB offers page ${pageNumber + 1}` });
  if (!res.ok) throw new Error(`page ${pageNumber} HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors) {
    const persisted = j.errors.some((e) => /PersistedQueryNotFound/i.test(e.message || ''));
    if (persisted) {
      const err = new Error('PersistedQueryNotFound — AB rotated the frontend hash.');
      err.persistedQueryRotated = true;
      throw err;
    }
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

  // Prefer a hash recovered from AB's live frontend over the compiled-in one.
  // Loaded before the first request, so a rotation already healed by an earlier
  // recovery run costs this run nothing.
  {
    // '../../lib' — this file sits in src/scripts/adapters/, one level deeper
    // than the scripts that import '../lib/prisma.ts'.
    const { default: prisma } = await import('../../lib/prisma.ts');
    PQ_HASH = await resolvePqHash(prisma, (m) => console.log(`   ${m}`));
  }

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

run().catch((e) => {
  if (e.persistedQueryRotated) {
    // Distinct exit code so CI can tell "AB rotated their hash — recover and
    // retry" apart from a genuine scrape failure. Exiting 1 here every night
    // for five weeks is exactly what produced a dead chain and no signal.
    console.error(`\n❌ ${e.message}`);
    console.error(`   Recover it with: node src/scripts/recover-ab-pq-hash.mjs`);
    console.error(`   (writes ScraperState["${AB_PQ_STATE_KEY}"]; CI does this automatically)`);
    process.exit(78);
  }
  console.error(`\n❌ ${e.stack || e.message}`);
  process.exit(1);
});
