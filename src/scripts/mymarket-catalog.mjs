// My Market FULL-CATALOG scraper.
//
// Uses mymarket.gr's category sitemap, not the /offers listing. The offers
// listing is no longer a reliable full-catalog baseline because it is heavily
// offer-first and currently yields only a tiny number of normal shelf prices.
//
// This crawler:
//   1. GETs /sitemap/categories-tree and keeps the top product departments.
//   2. Paginates every department page to completion.
//   3. Feeds every product card to ingestCatalog keyed by My Market's variant
//      SKU. Non-offer cards write kind='normal' shelf-price baselines; current
//      offer cards create/keep the Product + SKU mapping but skip the baseline
//      so a promo price is never recorded as a normal price.
//
// Usage:
//   node src/scripts/mymarket-catalog.mjs
//   DRY_RUN=1 ...                  # no DB writes
//   LIMIT=200 ...                  # smoke test
//   MAX_CATEGORIES=2 ...           # category smoke test
//   MAX_PAGES_PER_CATEGORY=5 ...   # cap per category
//   PACE_MS=1200 JITTER_MS=600 ... # safe autonomous pacing
//   PROXY_URL=... ...              # route via proxy if ever IP-blocked

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { load as loadHtml } from 'cheerio';
import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { installProxyFromEnv } from './lib/proxy-fetch.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? parseInt(process.env.MAX_CATEGORIES, 10) : Infinity;
const MAX_PAGES_PER_CATEGORY = envInt('MAX_PAGES_PER_CATEGORY', 120);
const PACE_MS = envInt('PACE_MS', 1200);
const JITTER_MS = envInt('JITTER_MS', 600);
const SITE = 'https://www.mymarket.gr';
const SITEMAP = `${SITE}/sitemap/categories-tree`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: `${SITE}/`,
};

const parseEurNumber = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function absoluteUrl(raw) {
  if (!raw) return null;
  try {
    return new URL(raw, SITE).href;
  } catch {
    return null;
  }
}

function pageUrl(categoryUrl, page) {
  const url = new URL(categoryUrl);
  url.searchParams.set('page', String(page));
  return url.href;
}

async function fetchHtml(url, label) {
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.text();
}

async function fetchCategoryRoots() {
  const html = await fetchHtml(SITEMAP, 'My Market category sitemap');
  const $ = loadHtml(html);
  const byPath = new Map();

  $('h2 a[href]').each((_, el) => {
    const $a = $(el);
    const url = absoluteUrl($a.attr('href'));
    if (!url) return;
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    if (u.origin !== SITE) return;
    if (u.pathname.replace(/\/+$/, '') === '/offers') return;

    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (byPath.has(path)) return;
    byPath.set(path, {
      name: $a.text().replace(/\s+/g, ' ').trim() || path.slice(1),
      url: `${SITE}${path}`,
    });
  });

  const categories = [...byPath.values()];
  if (categories.length === 0) throw new Error('No My Market category roots found in sitemap');
  return Number.isFinite(MAX_CATEGORIES) ? categories.slice(0, MAX_CATEGORIES) : categories;
}

function readMaxPage(html, categoryUrl) {
  const $ = loadHtml(html);
  const pages = [1];
  $('a[href*="page="]').each((_, el) => {
    try {
      const n = Number(new URL($(el).attr('href'), categoryUrl).searchParams.get('page'));
      if (Number.isInteger(n) && n > 0) pages.push(n);
    } catch {
      // Ignore malformed pagination links.
    }
  });
  return Math.max(...pages);
}

function cardIsCurrentOffer($, $art) {
  const hasOfferRow = $art.find('.selling-unit-row.is-on-offer').length > 0;
  const hasStrikePrice = $art.find('.line-through, span.line-through, [class*="line-through"]').length > 0;
  const hasOfferNote = $art.find('.offer-note').filter((_, el) => {
    const cls = $(el).attr('class') || '';
    return !cls.includes('placeholder') && $(el).text().trim().length > 0;
  }).length > 0;
  return hasOfferRow || hasStrikePrice || hasOfferNote;
}

function readCardPrice($, $art, analytics) {
  const fromAnalytics = parseEurNumber(analytics?.price);
  if (Number.isFinite(fromAnalytics) && fromAnalytics > 0) return fromAnalytics;

  const $price = $art.find('.teaser-display-price').first();
  const whole = $price.find('.teaser-display-price-whole').first().text().trim();
  const fraction = $price.find('.teaser-display-price-fraction').first().text().trim();
  if (!whole) return null;
  return parseEurNumber(`${whole}.${fraction || '00'}`);
}

function extractCatalogItems(html, category) {
  const $ = loadHtml(html);
  const items = [];

  $('article[data-google-analytics-item-value]').each((_, el) => {
    const $art = $(el);
    let analytics = null;
    try {
      analytics = JSON.parse($art.attr('data-google-analytics-item-value') || '');
    } catch {
      return;
    }
    if (!analytics?.name) return;

    const sku =
      $art.find('[data-add-to-cart-variant-value]').first().attr('data-add-to-cart-variant-value') ||
      $art.attr('data-id') ||
      String(analytics.id || '');
    if (!sku) return;

    const price = readCardPrice($, $art, analytics);
    if (!Number.isFinite(price) || price <= 0) return;

    const rawImage =
      $art.find('picture img').first().attr('src') ||
      $art.find('picture source').first().attr('srcset')?.split(/\s+/)[0] ||
      $art.find('img').first().attr('src') ||
      null;

    items.push({
      chainItemcode: String(sku),
      name: String(analytics.name).trim(),
      price,
      brand: analytics.brand?.trim() || null,
      imageUrl: absoluteUrl(rawImage),
      category: category.name,
      baseline: !cardIsCurrentOffer($, $art),
    });
  });

  const byCode = new Map();
  for (const item of items) {
    const existing = byCode.get(item.chainItemcode);
    if (!existing || (existing.baseline !== false && item.baseline === false)) {
      byCode.set(item.chainItemcode, item);
    }
  }
  return [...byCode.values()];
}

function upsertCatalogItem(byCode, item) {
  const existing = byCode.get(item.chainItemcode);
  if (!existing) {
    byCode.set(item.chainItemcode, item);
    return true;
  }

  // If a duplicate appears both as normal and on-offer, keep the safer
  // on-offer version so we do not write the promo price as a normal baseline.
  if (existing.baseline !== false && item.baseline === false) {
    byCode.set(item.chainItemcode, item);
  }
  return false;
}

async function run() {
  console.log(`My Market CATALOG scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  console.log(`   pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms; max pages/category: ${MAX_PAGES_PER_CATEGORY}`);
  installProxyFromEnv();

  const extraWarnings = [];
  if (Number.isFinite(LIMIT)) extraWarnings.push(`LIMIT=${LIMIT} active; catalog run is intentionally partial.`);
  if (Number.isFinite(MAX_CATEGORIES)) extraWarnings.push(`MAX_CATEGORIES=${MAX_CATEGORIES} active; catalog run is intentionally partial.`);

  const categories = await fetchCategoryRoots();
  console.log(`   ${categories.length} product departments discovered`);

  const byCode = new Map();
  let categoryIndex = 0;

  for (const category of categories) {
    categoryIndex++;
    let categoryPages = null;
    let fetchedForCategory = 0;

    try {
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        const url = pageUrl(category.url, page);
        const html = await fetchHtml(url, `My Market ${category.name} page ${page}`);
        if (page === 1) {
          categoryPages = readMaxPage(html, category.url);
          if (categoryPages > MAX_PAGES_PER_CATEGORY) {
            extraWarnings.push(`${category.name} has ${categoryPages} pages; capped at MAX_PAGES_PER_CATEGORY=${MAX_PAGES_PER_CATEGORY}.`);
          }
        }

        const cards = extractCatalogItems(html, category);
        fetchedForCategory += cards.length;
        let added = 0;
        for (const card of cards) if (upsertCatalogItem(byCode, card)) added++;

        process.stdout.write(
          `\r   category ${categoryIndex}/${categories.length} page ${page}/${categoryPages || '?'} - +${added}, unique ${byCode.size}      `,
        );

        if (byCode.size >= LIMIT) break;
        if (cards.length === 0) break;
        if (categoryPages && page >= categoryPages) break;
        await pace(PACE_MS, JITTER_MS);
      }
    } catch (e) {
      const warning = `${category.name} failed (${e.message}); partial catalog.`;
      console.log(`\n   ${warning}`);
      extraWarnings.push(warning);
    }

    if (fetchedForCategory === 0) console.log(`\n   ${category.name} returned 0 products; continuing.`);
    if (byCode.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  let items = [...byCode.values()];
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  const baselineItems = items.filter((it) => it.baseline !== false).length;
  const promoItems = items.length - baselineItems;
  console.log(`   ${items.length} unique products ready (${baselineItems} baseline, ${promoItems} current-offer/no-baseline)`);

  const report = await ingestCatalog({ chain: 'mymarket', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\nDone - created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors}`);
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => {
  console.error(`\n${e.stack || e.message}`);
  process.exit(1);
});
