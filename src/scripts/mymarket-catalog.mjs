// My Market FULL-CATALOG scraper.
//
// mymarket.gr's /offers listing actually returns the WHOLE catalogue (~5,276
// products) sorted offers-first — the offers adapter just keeps the is-on-offer
// cards. This walks every page and feeds EVERY product to the shared
// ingest-catalog layer: Product rows keyed by the chain's variant SKU (the site
// exposes no GTIN → chain-local identity), plus a 'normal' shelf-price baseline
// for the non-offer cards. An on-offer card's analytics.price is the PROMO
// price, so we create its Product but defer the shelf snapshot to a future run
// when the item is off-offer (baseline:false).
//
// Usage:
//   node src/scripts/mymarket-catalog.mjs
//   DRY_RUN=1 ...     # no DB writes
//   LIMIT=200 ...     # smoke test
//   PACE_MS=600 ...   # throttle (mymarket 429s above ~5 req/s)
//   PROXY_URL=... ... # route via residential proxy if ever IP-blocked
//
// dotenv first (ESM hoist trap — DB import comes later via ingest-catalog).
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
const PACE_MS = envInt('PACE_MS', 1200);
const JITTER_MS = envInt('JITTER_MS', 600);
const PAGE_SIZE = 35;
const MAX_PAGES = envInt('MAX_PAGES', 250);
const BASE = 'https://www.mymarket.gr/offers';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: 'https://www.mymarket.gr/',
};

const parseEurNumber = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const parseGreekInt = (s) => { const m = String(s || '').match(/([0-9][0-9.]*)/); return m ? parseInt(m[1].replace(/\./g, ''), 10) : null; };

async function fetchPage(pg) {
  const res = await fetchWithBackoff(`${BASE}?page=${pg}`, { headers: HEADERS }, { label: `My Market catalog page ${pg}` });
  if (!res.ok) throw new Error(`page ${pg} HTTP ${res.status}`);
  return res.text();
}

// Every product card on the page (offer or not) → a catalog item.
function extractCatalogItems(html) {
  const $ = loadHtml(html);
  const items = [];
  $('article[data-google-analytics-item-value]').each((_, el) => {
    const $art = $(el);
    let a = null;
    try { a = JSON.parse($art.attr('data-google-analytics-item-value') || ''); } catch { return; }
    if (!a?.name) return;

    const sku = $art.find('[data-add-to-cart-variant-value]').first().attr('data-add-to-cart-variant-value')
      || $art.attr('data-id') || String(a.id || '');
    if (!sku) return;

    const price = parseEurNumber(a.price);
    if (!Number.isFinite(price) || price <= 0) return;

    // On offer? packaged is-on-offer row OR a weighted "Αρχ. τιμή" pair. For
    // those, a.price is the promo price → defer the shelf-price snapshot.
    const onOffer = $art.find('.selling-unit-row.is-on-offer').length > 0 || /Αρχ\. τιμή/.test($art.text());

    let imageUrl = $art.find('picture img').first().attr('src') || $art.find('img').first().attr('src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    items.push({
      chainItemcode: String(sku),
      name: String(a.name).trim(),
      price,
      brand: a.brand?.trim() || null,
      imageUrl,
      baseline: !onOffer,
    });
  });
  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.chainItemcode)) byCode.set(it.chainItemcode, it);
  return [...byCode.values()];
}

async function run() {
  console.log(`🛒 My Market CATALOG scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  installProxyFromEnv();

  const byCode = new Map();
  let totalCount = null, lastPage = 0;
  const extraWarnings = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let html;
    try { html = await fetchPage(page); }
    catch (e) {
      const warning = `Page ${page} failed (${e.message}); partial catalog.`;
      console.log(`\n   ${warning}`);
      extraWarnings.push(warning);
      break;
    }
    if (page === 1) {
      const m = html.match(/([0-9][0-9.]*)\s*προϊόντα/);
      totalCount = m ? parseGreekInt(m[1]) : null;
      console.log(`   catalogue size reported: ${totalCount ?? '?'} products`);
    }
    const cards = extractCatalogItems(html);
    if (cards.length === 0) { process.stdout.write(`\r   page ${page} — empty, stopping        \n`); break; }
    lastPage = page;
    let added = 0;
    for (const c of cards) if (!byCode.has(c.chainItemcode)) { byCode.set(c.chainItemcode, c); added++; }
    process.stdout.write(`\r   page ${page} — +${added} (total ${byCode.size}${totalCount ? '/' + totalCount : ''})   `);
    if (byCode.size >= LIMIT) break;
    if (cards.length < PAGE_SIZE && page > 1) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log(`\n   ${byCode.size} catalog products across ${lastPage} pages`);

  let items = [...byCode.values()];
  if (items.length > LIMIT) items = items.slice(0, LIMIT);

  const report = await ingestCatalog({ chain: 'mymarket', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\n✅ done — created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors}`);
  process.exit(0);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
