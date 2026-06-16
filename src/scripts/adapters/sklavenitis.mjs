// Sklavenitis adapter.
//
// Scrapes current offers from sklavenitis.gr's HTML offers collection page
// (Knockout.js front-end, but the offer cards are server-rendered) and hands
// them to the shared ingest pipeline. See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/sklavenitis.mjs            # all offers
//   DRY_RUN=1 node src/scripts/adapters/sklavenitis.mjs  # fetch + match, no DB writes
//   LIMIT=50 node src/scripts/adapters/sklavenitis.mjs   # smoke test (skips deactivation)
//   DRY_RUN=1 LIMIT=24 MAX_PAGES=1 node ...              # one-page unblock probe
//
// How it works:
//   1. GET /sylloges/prosfores/?pg=N for N = 1..totalPages.
//      The header HTML reports "X από τα Y προϊόντα" — we read totalCount from there.
//   2. Each product card is identified by `data-productsku="<sku>"`. Around it:
//        <h4 class="product__title"><a href="...">NAME</a></h4>
//        <div class="price" data-price="1,39">1,39 €<span>/τεμ.</span></div>
//        <div class="priceKil">1,85 €<span>/κιλό</span></div>  (optional unit price)
//        <img alt="NAME" src="https://s1.sklavenitis.gr/...">
//      Sklavenitis offer pages do NOT render a strikethrough originalPrice on the
//      grid — every offer card is a single ΜΟΝΟ-style price. originalPrice=null.
//      No GTIN is exposed on either the grid or the product detail page, so
//      matching depends on the existing AB-style waterfall (ChainProductMapping →
//      MatchCache → PendingMatch for the LLM resolver).
//
// FRAGILITY: the offer page is HTML scraping, so any markup change at
// sklavenitis.gr can break the selectors. Spot-check after running.

import { load as loadHtml } from 'cheerio';
import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { installProxyFromEnv } from '../lib/proxy-fetch.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const ALLOW_PARTIAL_DRY_RUN = process.env.ALLOW_PARTIAL_DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PAGE_SIZE = 24;
const MAX_PAGES = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : 200;
const PACE_MS = process.env.PACE_MS ? parseInt(process.env.PACE_MS, 10) : 1200;
const JITTER_MS = process.env.JITTER_MS ? parseInt(process.env.JITTER_MS, 10) : 600;
const BASE = 'https://www.sklavenitis.gr/sylloges/prosfores/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: 'https://www.sklavenitis.gr/',
};

function parseEur(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// "12.345 προϊόντα" / "12 προϊόντα" → 12345 / 12
function parseGreekInt(s) {
  if (!s) return null;
  const m = String(s).match(/([0-9][0-9.]*)/);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ''), 10);
}

// "/trofima-pantopoleioy/ntomatika/ntomata-passata/-8494791/" →
// "trofima-pantopoleioy/ntomatika" — the RAW slug pair, passed through as the
// chain's native category label. The per-chain map in
// src/lib/native-category-maps.ts translates it to a department.
//
// Lesson learned the hard way: a hardcoded slug→department map here went
// STALE when sklavenitis renamed its taxonomy — unknown slugs silently fell to
// keyword guessing and frozen Μπάρμπα Στάθης surfaced under Φρούτα. Emitting
// the raw slug means an unmapped one now raises an ingest-report warning
// (admin Υγεία tab) instead of rotting silently.
function categoryFromHref(href) {
  if (!href) return null;
  const parts = href.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

async function fetchPage(pg) {
  const url = `${BASE}?pg=${pg}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`page ${pg} HTTP ${res.status}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pace() {
  if (PACE_MS <= 0) return;
  const jitter = JITTER_MS > 0 ? Math.floor(Math.random() * JITTER_MS) : 0;
  await sleep(PACE_MS + jitter);
}

function extractItemsFromHtml(html) {
  const $ = loadHtml(html);
  const items = [];

  // Each offer card has the wishlist icon with data-productsku; from there walk
  // up to the product container, then read name/price/image.
  $('[data-productsku]').each((_, el) => {
    const $el = $(el);
    const sku = $el.attr('data-productsku');
    if (!sku) return;

    // The card root isn't named consistently, so just walk up until we find
    // both the title and price within reach.
    const $card = $el.closest('article, .product, li, div').last().parents().addBack().filter((__, p) => {
      const $p = $(p);
      return $p.find('h4.product__title').length > 0 && $p.find('.product_prices').length > 0;
    }).last();

    // Fallback: nearest ancestor containing both title and price.
    let $root = $card.length ? $card : $el.parentsUntil('body').filter((__, p) => {
      const $p = $(p);
      return $p.find('h4.product__title').length > 0 && $p.find('.product_prices').length > 0;
    }).first();

    if (!$root.length) return;

    const $titleA = $root.find('h4.product__title a').first();
    const name = $titleA.text().trim();
    if (!name) return;

    const href = $titleA.attr('href') || '';

    // First .price element inside the card holds the current offer price.
    const $price = $root.find('.product_prices .price').first();
    const priceAttr = $price.attr('data-price');
    const price = parseEur(priceAttr || $price.text());
    if (!price || price <= 0) return;

    // No strikethrough originalPrice is rendered on Sklavenitis offer cards.
    // Per CONTEXT.md §4.1 we leave it null rather than synthesising.
    const unit = $root.find('.priceKil').first().text().replace(/\s+/g, ' ').trim() || null;

    const $img = $root.find('.product__figure img').first();
    let imageUrl = $img.attr('src') || $img.attr('data-src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    items.push({
      sku: String(sku),
      name,
      price,
      unit,
      href,
      imageUrl,
    });
  });

  // Dedup by sku — the same wishlist trigger can appear twice in some layouts.
  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.sku)) byCode.set(it.sku, it);
  return [...byCode.values()];
}

function readTotalCount(html) {
  // "24 από τα 2.895 προϊόντα"
  const m = html.match(/από\s*τα\s*([0-9][0-9.]*)\s*προϊ/);
  return m ? parseGreekInt(m[1]) : null;
}

function toOfferItem(raw) {
  return {
    name: raw.name,
    price: raw.price,
    originalPrice: null,
    chainItemcode: raw.sku,
    barcode: null,
    brand: null,
    unit: raw.unit,
    category: categoryFromHref(raw.href),
    imageUrl: raw.imageUrl,
    offerType: 'mono',
  };
}

export async function runSklavenitisAdapter({ dryRun = DRY_RUN, limit = LIMIT } = {}) {
  console.log(`🛒 Sklavenitis adapter${dryRun ? ' (DRY_RUN)' : ''}`);
  console.log(`   max pages: ${MAX_PAGES}, pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms`);

  // sklavenitis.gr (Akamai) 403s datacenter IPs (GitHub Actions, Vercel) but
  // serves residential ones. In CI, PROXY_URL routes the global fetch — page
  // scrapes AND the s1.sklavenitis.gr image-mirror downloads — through a
  // residential proxy. No-op locally / without the secret. See lib/proxy-fetch.mjs.
  installProxyFromEnv();

  const byCode = new Map();
  let totalCount = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page);
    if (page === 1) {
      totalCount = readTotalCount(html);
      console.log(`   total reported: ${totalCount ?? '?'} offers`);
    }
    const items = extractItemsFromHtml(html);
    if (items.length === 0) {
      process.stdout.write(`\r   page ${page} — empty, stopping       \n`);
      break;
    }
    for (const it of items) if (!byCode.has(it.sku)) byCode.set(it.sku, it);
    process.stdout.write(`\r   page ${page} — unique so far: ${byCode.size}${totalCount ? '/' + totalCount : ''}   `);

    if (byCode.size >= limit) break;
    if (totalCount != null && byCode.size >= totalCount) break;
    if (items.length < PAGE_SIZE && page > 1) break; // short page = end
    await pace();
  }
  console.log('');

  let offers = [...byCode.values()].map(toOfferItem).filter((it) => it && it.name && it.price > 0);
  if (offers.length > limit) offers = offers.slice(0, limit);
  console.log(`   ${offers.length} offers ready for ingest`);

  // s1.sklavenitis.gr serves browsers but refuses the Vercel optimizer's
  // datacenter IPs (verified 2026-06-12, same class as AB) — mirror to
  // Supabase and rewrite imageUrl before ingest. No-op without creds.
  let mirrorWarnings = [];
  if (!dryRun) {
    const mirror = await mirrorImages({
      chain: 'sklavenitis',
      items: offers,
      match: (u) => u.includes('sklavenitis.gr'),
    });
    mirrorWarnings = mirror.warnings;
  }

  const report = await ingestOffers({ chain: 'sklavenitis', source: 'web', items: offers, dryRun, extraWarnings: mirrorWarnings });
  printReport(report);
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
if (isMain) {
  runSklavenitisAdapter()
    .then((report) => {
      const probeOk = DRY_RUN && ALLOW_PARTIAL_DRY_RUN && report.scrapedItems > 0 && report.errors === 0;
      if (probeOk && !report.healthOk) {
        console.log('   probe passed despite partial-run health warning (ALLOW_PARTIAL_DRY_RUN=1)');
      }
      process.exit(report.healthOk || probeOk ? 0 : 1);
    })
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
