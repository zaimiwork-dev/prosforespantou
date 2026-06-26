// Sklavenitis FULL-CATALOG scraper.
//
// The offers adapter (adapters/sklavenitis.mjs) only reads /sylloges/prosfores/
// — the current-offer collection. This companion walks sklavenitis.gr's real
// category tree to collect EVERY official shelf product, including ordinary
// non-offer items, so the chain stops being "offers-only" (the owner's
// non-negotiable: own every official chain product, not just the deals).
//
// How it works:
//   1. GET /katigories/ — the server-rendered category index — and keep every
//      leaf browse category (depth-2 slug pairs, e.g. /allantika/loykanika/).
//   2. Paginate each category via ?pg=N to completion (the header reports
//      "X από τα Y προϊόντα"; stop at Y or a short page).
//   3. Feed every product card to ingestCatalog keyed by Sklavenitis' own SKU
//      (data-productsku). Non-offer cards write a kind='normal' shelf-price
//      baseline; cards flagged on-offer (`main-price--previous`) create/keep the
//      Product + SKU mapping but skip the baseline so a promo price is never
//      recorded as a normal price. Sklavenitis exposes no GTIN, so identity is
//      the chain SKU via ChainProductMapping (same shape as the offers pipeline).
//
// Usage:
//   node src/scripts/sklavenitis-catalog.mjs
//   DRY_RUN=1 ...                  # no DB writes
//   LIMIT=200 ...                  # smoke test (cap total unique products)
//   MAX_CATEGORIES=2 ...           # category smoke test
//   MAX_PAGES_PER_CATEGORY=5 ...   # cap per category
//   PACE_MS=1500 JITTER_MS=800 ... # safe autonomous pacing (default)
//   PROXY_URL=... ...              # route via proxy when IP-blocked (CI)
//   REQUIRE_PROXY=1 ...            # skip entirely if no PROXY_URL (autonomous CI)
//
// FRAGILITY: HTML scraping. The selectors mirror adapters/sklavenitis.mjs; a
// markup change at sklavenitis.gr can break both. Spot-check after running.

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { load as loadHtml } from 'cheerio';
import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { installProxyFromEnv } from './lib/proxy-fetch.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const REQUIRE_PROXY = process.env.REQUIRE_PROXY === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? parseInt(process.env.MAX_CATEGORIES, 10) : Infinity;
const MAX_PAGES_PER_CATEGORY = envInt('MAX_PAGES_PER_CATEGORY', 200);
const PAGE_SIZE = 24;
const PACE_MS = envInt('PACE_MS', 1500);
const JITTER_MS = envInt('JITTER_MS', 800);
const SITE = 'https://www.sklavenitis.gr';
const KATIGORIES = `${SITE}/katigories/`;

// Path prefixes under /katigories/ that are not product departments.
const NON_PRODUCT_PREFIXES = new Set([
  'about', 'account', 'voitheia-agoron', 'sitemap', 'sylloges', 'listes',
  'cctv', 'diagonismoi', 'anakoinoseis', 'oroi-hrisis', 'politiki-aporritou',
  'politiki-cookies', 'katigories',
]);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: `${SITE}/`,
};

function parseEur(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// "12.345 προϊόντα" → 12345
function parseGreekInt(s) {
  if (!s) return null;
  const m = String(s).match(/([0-9][0-9.]*)/);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ''), 10);
}

async function fetchHtml(url, label) {
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label, retries: 1 });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.text();
}

// Leaf browse categories from /katigories/: depth-2 slug pairs whose first
// segment is a real product department. Same raw slug pair we feed the offers
// pipeline as the native category label (see native-category-maps.ts).
async function fetchCategoryRoots() {
  const html = await fetchHtml(KATIGORIES, 'Sklavenitis category index');
  const $ = loadHtml(html);
  const byPath = new Map();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)\/$/);
    if (!m) return;
    if (NON_PRODUCT_PREFIXES.has(m[1])) return;
    const path = `/${m[1]}/${m[2]}/`;
    if (byPath.has(path)) return;
    byPath.set(path, {
      slug: `${m[1]}/${m[2]}`,
      url: `${SITE}${path}`,
    });
  });

  const categories = [...byPath.values()];
  if (categories.length === 0) throw new Error('No Sklavenitis category roots found in /katigories/');
  return Number.isFinite(MAX_CATEGORIES) ? categories.slice(0, MAX_CATEGORIES) : categories;
}

function readTotalCount(html) {
  // "24 από τα 2.895 προϊόντα"
  const m = html.match(/από\s*τα\s*([0-9][0-9.]*)\s*προϊ/);
  return m ? parseGreekInt(m[1]) : null;
}

// Each card is anchored by the wishlist icon's data-productsku. Walk up to the
// nearest ancestor holding exactly one title + a price block, then read fields.
// `main-price--previous` is Sklavenitis' on-offer marker (every offer card on
// /sylloges/prosfores/ carries it; plain `main-price` = normal shelf price).
function extractItems(html, slug) {
  const $ = loadHtml(html);
  const items = [];

  $('[data-productsku]').each((_, el) => {
    const $el = $(el);
    const sku = $el.attr('data-productsku');
    if (!sku) return;

    let $root = null;
    $el.parentsUntil('body').each((__, p) => {
      const $p = $(p);
      if ($p.find('h4.product__title').length === 1 && $p.find('.product_prices').length >= 1) {
        $root = $p;
        return false; // first (nearest) qualifying ancestor wins
      }
      return undefined;
    });
    if (!$root) return;

    const name = $root.find('h4.product__title a').first().text().trim();
    if (!name) return;

    const href = $root.find('h4.product__title a').first().attr('href') || '';

    const $price = $root.find('.product_prices .price').first();
    const price = parseEur($price.attr('data-price') || $price.text());
    if (!price || price <= 0) return;

    const isOffer = $root.find('.main-price--previous').length > 0;

    const $img = $root.find('.product__figure img').first();
    let imageUrl = $img.attr('src') || $img.attr('data-src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    if (imageUrl && imageUrl.startsWith('/')) imageUrl = SITE + imageUrl;
    // The lazy-load placeholder is not a real product image.
    if (imageUrl && imageUrl.includes('hourglass')) imageUrl = null;

    items.push({
      chainItemcode: String(sku),
      name,
      price,
      imageUrl,
      category: slug,
      // Promo price → keep the Product + mapping but don't snapshot it as a
      // normal shelf baseline. The real shelf price arrives when it's off-offer.
      baseline: !isOffer,
    });
  });

  // Dedup within a page by sku.
  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.chainItemcode)) byCode.set(it.chainItemcode, it);
  return [...byCode.values()];
}

// Keep the safer record when an SKU appears both as normal and on-offer: prefer
// the on-offer version so we never write a promo price as a normal baseline.
function upsertCatalogItem(byCode, item) {
  const existing = byCode.get(item.chainItemcode);
  if (!existing) {
    byCode.set(item.chainItemcode, item);
    return true;
  }
  if (existing.baseline !== false && item.baseline === false) {
    byCode.set(item.chainItemcode, item);
  }
  return false;
}

async function run() {
  console.log(`Sklavenitis CATALOG scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  console.log(`   pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms; max pages/category: ${MAX_PAGES_PER_CATEGORY}`);

  // sklavenitis.gr (Akamai) 403s datacenter IPs. PROXY_URL routes fetches via a
  // residential proxy in CI; no-op locally / without the secret.
  const proxy = installProxyFromEnv();
  if (REQUIRE_PROXY && !proxy.enabled) {
    const warning = 'REQUIRE_PROXY=1 but PROXY_URL is missing; Sklavenitis catalog was not fetched.';
    console.log(`   ${warning}`);
    // Record a failed catalog run instead of silently succeeding. No catalog
    // rows are deleted by ingestCatalog's zero-item safety path.
    const report = await ingestCatalog({
      chain: 'sklavenitis',
      items: [],
      dryRun: DRY_RUN,
      extraWarnings: [warning],
    });
    process.exit(report.healthOk ? 0 : 1);
  }

  const extraWarnings = [];
  if (Number.isFinite(LIMIT)) extraWarnings.push(`LIMIT=${LIMIT} active; catalog run is intentionally partial.`);
  if (Number.isFinite(MAX_CATEGORIES)) extraWarnings.push(`MAX_CATEGORIES=${MAX_CATEGORIES} active; catalog run is intentionally partial.`);

  const categories = await fetchCategoryRoots();
  console.log(`   ${categories.length} leaf categories discovered`);

  const byCode = new Map();
  let categoryIndex = 0;

  for (const category of categories) {
    categoryIndex++;
    let total = null;
    let fetchedForCategory = 0;

    try {
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        const url = `${category.url}?pg=${page}`;
        const html = await fetchHtml(url, `Sklavenitis ${category.slug} page ${page}`);
        if (page === 1) {
          total = readTotalCount(html);
          const pages = total ? Math.ceil(total / PAGE_SIZE) : null;
          if (pages && pages > MAX_PAGES_PER_CATEGORY) {
            extraWarnings.push(`${category.slug} has ~${pages} pages; capped at MAX_PAGES_PER_CATEGORY=${MAX_PAGES_PER_CATEGORY}.`);
          }
        }

        const cards = extractItems(html, category.slug);
        fetchedForCategory += cards.length;
        let added = 0;
        for (const card of cards) if (upsertCatalogItem(byCode, card)) added++;

        process.stdout.write(
          `\r   category ${categoryIndex}/${categories.length} (${category.slug}) page ${page} +${added}, unique ${byCode.size}      `,
        );

        if (byCode.size >= LIMIT) break;
        if (cards.length === 0) break;            // empty/blocked page = end
        if (total != null && page * PAGE_SIZE >= total) break;
        if (cards.length < PAGE_SIZE) break;      // short page = last page
        await pace(PACE_MS, JITTER_MS);
      }
    } catch (e) {
      const warning = `${category.slug} failed (${e.message}); partial catalog.`;
      console.log(`\n   ${warning}`);
      extraWarnings.push(warning);
    }

    if (fetchedForCategory === 0) console.log(`\n   ${category.slug} returned 0 products; continuing.`);
    if (byCode.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  let items = [...byCode.values()];
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  const baselineItems = items.filter((it) => it.baseline !== false).length;
  const promoItems = items.length - baselineItems;
  console.log(`   ${items.length} unique products ready (${baselineItems} baseline, ${promoItems} current-offer/no-baseline)`);

  const report = await ingestCatalog({ chain: 'sklavenitis', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\nDone - created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors}`);
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => {
  console.error(`\n${e.stack || e.message}`);
  process.exit(1);
});
