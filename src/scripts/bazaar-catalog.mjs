// Bazaar FULL-CATALOG scraper.
//
// The offers adapter (adapters/bazaar.mjs) only reads /prosfores. This companion
// walks bazaar-online.gr's category tree to collect EVERY official shelf product,
// including ordinary non-offer items, so the chain gets kind='normal' shelf-price
// baselines (owner's non-negotiable: own every official product, not just deals).
//
// Bazaar runs OpenCart with SEO category URLs. How it works:
//   1. GET the homepage and read the 16 top-level departments from the megamenu
//      (`<li class="dropdown level-1"><a href="SEO-slug">NAME`).
//   2. Paginate each department via ?page=N&limit=100 to completion (the footer
//      reports "... από Y"; stop at Y or a short page).
//   3. Feed every product card to ingestCatalog. Bazaar embeds the GTIN in the
//      image filename, so identity is the real barcode when present (dedupes
//      cross-chain) else the OpenCart product id (data-product-id) via
//      ChainProductMapping. On-offer cards (price-new + price-old) set
//      baseline:false so a promo price is never written as kind='normal'.
//
// Usage:
//   node src/scripts/bazaar-catalog.mjs
//   DRY_RUN=1 ...                  # no DB writes
//   LIMIT=200 ...                  # smoke test (cap total unique products)
//   MAX_CATEGORIES=2 ...           # category smoke test
//   MAX_PAGES_PER_CATEGORY=5 ...   # cap per category
//   PACE_MS=2000 JITTER_MS=1000 ...# safe autonomous pacing (Bazaar throttles bursts)
//
// FRAGILITY: HTML scraping. Selectors mirror adapters/bazaar.mjs.

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { load as loadHtml } from 'cheerio';
import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { normalizeBarcode } from './lib/ingest-offers.mjs';
import { installProxyFromEnv } from './lib/proxy-fetch.mjs';
import { envInt, fetchWithBackoff, pace, sleep } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? parseInt(process.env.MAX_CATEGORIES, 10) : Infinity;
const MAX_PAGES_PER_CATEGORY = envInt('MAX_PAGES_PER_CATEGORY', 80);
const PAGE_SIZE = envInt('PAGE_SIZE', 100);
const PACE_MS = envInt('PACE_MS', 4000);
const JITTER_MS = envInt('JITTER_MS', 2000);
// Bazaar soft-blocks request bursts by serving a 200 with NO product cards
// (not a 4xx/5xx, so fetchWithBackoff can't catch it). When a page comes back
// empty while we still expect products, cool down and retry; never silently
// treat a throttle as "end of category" — that would undercount the catalog.
const BLOCK_COOLDOWN_MS = envInt('BLOCK_COOLDOWN_MS', 30000);
const BLOCK_RETRIES = envInt('BLOCK_RETRIES', 4);
const SITE = 'https://www.bazaar-online.gr';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: `${SITE}/`,
};

// "ΠΡΟΪΟΝΤΑ ΦΥΛΛΑΔΙΟΥ" / special collections that aren't product departments.
const NON_DEPARTMENT_SLUGS = new Set(['proionta-fylladioy', 'prosfores']);

function parseEur(s) {
  if (!s) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function readTotalCount(html) {
  const m = html.match(/από\s*([0-9][0-9.]*)/);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}

function barcodeFromImage(url) {
  if (!url) return null;
  const base = url.split('/').pop() || '';
  const m = base.match(/(\d{8,14})/);
  return m ? normalizeBarcode(m[1]) : null;
}

async function fetchHtml(url, label) {
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label, retries: 1 });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.text();
}

// Top-level departments from the megamenu (present in every page header).
async function fetchCategoryRoots() {
  const html = await fetchHtml(`${SITE}/`, 'Bazaar homepage menu');
  const entries = [...html.matchAll(
    /<li class="dropdown level-1"[^>]*>\s*<a href="https:\/\/www\.bazaar-online\.gr\/([a-z0-9-]+)"[^>]*>([^<]+)/g,
  )];
  const bySlug = new Map();
  for (const [, slug, name] of entries) {
    if (NON_DEPARTMENT_SLUGS.has(slug)) continue;
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: name.replace(/\s+/g, ' ').trim(), url: `${SITE}/${slug}` });
  }
  const categories = [...bySlug.values()];
  if (categories.length === 0) throw new Error('No Bazaar departments found in the megamenu');
  return Number.isFinite(MAX_CATEGORIES) ? categories.slice(0, MAX_CATEGORIES) : categories;
}

// Read every product card. Non-offer card: a single `.price`. On-offer card:
// `.price-new` (current) + `.price-old` (original) → baseline:false.
function extractItems(html, slug) {
  const $ = loadHtml(html);
  const items = [];

  $('.product-thumb[data-product-id]').each((_, el) => {
    const $card = $(el);
    const sku = $card.attr('data-product-id');
    if (!sku) return;

    const name = $card.find('h4 a').first().text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    // Offer card: `.price-new` (current) + `.price-old` (was). Non-offer card:
    // the price sits as plain text in `.price_wrapper` (no -new/-old spans).
    const $new = $card.find('.price-new').first();
    const isOffer = $new.length > 0;
    const price = isOffer ? parseEur($new.text()) : parseEur($card.find('.price_wrapper').first().text());
    if (!price || price <= 0) return;

    let imageUrl = $card.find('img').first().attr('src') || $card.find('img').first().attr('data-src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    items.push({
      chainItemcode: String(sku),
      name,
      price,
      barcode: barcodeFromImage(imageUrl),
      imageUrl,
      category: slug,
      baseline: !isOffer, // promo price → keep Product + mapping, skip baseline
    });
  });

  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.chainItemcode)) byCode.set(it.chainItemcode, it);
  // rawCount = product tiles present before our name/price filtering. Pagination
  // and block-detection must key off this, NOT the filtered item count — a full
  // page can have a few unparseable tiles (banners) and still NOT be the last.
  return { items: [...byCode.values()], rawCount: $('.product-thumb[data-product-id]').length };
}

function upsertCatalogItem(byCode, item) {
  const existing = byCode.get(item.chainItemcode);
  if (!existing) {
    byCode.set(item.chainItemcode, item);
    return true;
  }
  // Prefer the on-offer version so we never write a promo price as a baseline.
  if (existing.baseline !== false && item.baseline === false) byCode.set(item.chainItemcode, item);
  return false;
}

async function run() {
  console.log(`Bazaar CATALOG scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  console.log(`   page size: ${PAGE_SIZE}, pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms; max pages/category: ${MAX_PAGES_PER_CATEGORY}`);
  installProxyFromEnv();

  const extraWarnings = [];
  if (Number.isFinite(LIMIT)) extraWarnings.push(`LIMIT=${LIMIT} active; catalog run is intentionally partial.`);
  if (Number.isFinite(MAX_CATEGORIES)) extraWarnings.push(`MAX_CATEGORIES=${MAX_CATEGORIES} active; catalog run is intentionally partial.`);

  const categories = await fetchCategoryRoots();
  console.log(`   ${categories.length} departments discovered`);

  const byCode = new Map();
  let categoryIndex = 0;

  for (const category of categories) {
    categoryIndex++;
    let total = null;
    let fetchedForCategory = 0;

    try {
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        const url = `${category.url}?page=${page}&limit=${PAGE_SIZE}`;

        // Fetch with soft-block awareness: a 200 with 0 product tiles while we
        // still expect products means we were throttled, not that the category
        // ended. Key off rawCount (tiles present), not filtered items.
        let cards = [];
        let rawCount = 0;
        let blocked = false;
        for (let attempt = 0; attempt <= BLOCK_RETRIES; attempt++) {
          const html = await fetchHtml(url, `Bazaar ${category.slug} page ${page}`);
          if (page === 1 && total === null) {
            total = readTotalCount(html);
            const pages = total ? Math.ceil(total / PAGE_SIZE) : null;
            if (pages && pages > MAX_PAGES_PER_CATEGORY) {
              extraWarnings.push(`${category.slug} has ~${pages} pages; capped at MAX_PAGES_PER_CATEGORY=${MAX_PAGES_PER_CATEGORY}.`);
            }
          }
          ({ items: cards, rawCount } = extractItems(html, category.slug));
          const expectMore = total === null ? page === 1 : (page - 1) * PAGE_SIZE < total;
          if (rawCount > 0 || !expectMore) { blocked = false; break; }
          blocked = true;
          if (attempt < BLOCK_RETRIES) {
            process.stdout.write(`\n   ${category.slug} p${page}: 0 tiles but expecting more — throttled, cooldown ${BLOCK_COOLDOWN_MS / 1000}s (try ${attempt + 1}/${BLOCK_RETRIES})\n`);
            await sleep(BLOCK_COOLDOWN_MS);
          }
        }
        if (blocked) {
          const w = `${category.slug} page ${page} stayed empty after ${BLOCK_RETRIES} retries (throttled?); category partial.`;
          console.log(`\n   ${w}`);
          extraWarnings.push(w);
          break;
        }

        fetchedForCategory += cards.length;
        let added = 0;
        for (const card of cards) if (upsertCatalogItem(byCode, card)) added++;

        process.stdout.write(
          `\r   category ${categoryIndex}/${categories.length} (${category.slug}) page ${page} +${added}, unique ${byCode.size}      `,
        );

        if (byCode.size >= LIMIT) break;
        if (rawCount === 0) break;                              // genuinely empty / end
        if (total != null && page * PAGE_SIZE >= total) break;  // drained per reported total
        if (rawCount < PAGE_SIZE) break;                        // short page (raw) = last
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
  const withBarcode = items.filter((it) => it.barcode).length;
  console.log(`   ${items.length} unique products ready (${baselineItems} baseline, ${items.length - baselineItems} current-offer/no-baseline, ${withBarcode} with barcode)`);

  const report = await ingestCatalog({ chain: 'bazaar', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\nDone - created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors}`);
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => {
  console.error(`\n${e.stack || e.message}`);
  process.exit(1);
});
