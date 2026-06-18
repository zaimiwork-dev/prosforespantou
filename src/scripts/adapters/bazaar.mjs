// Bazaar adapter.
//
// Scrapes current offers from bazaar-online.gr's /prosfores collection page.
// Bazaar runs OpenCart: the offers grid is fully server-rendered, paginated
// with ?page=N (&limit=N to widen the page). See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/bazaar.mjs            # all offers
//   DRY_RUN=1 node src/scripts/adapters/bazaar.mjs  # fetch + match, no DB writes
//   LIMIT=50 node src/scripts/adapters/bazaar.mjs   # smoke test (skips deactivation)
//
// How it works:
//   1. GET /prosfores?page=N&limit=100 for N = 1..totalPages. The footer
//      reports "Εμφάνιση 1 έως X από Y" — we read Y as the total.
//   2. Each product card is `.product-thumb[data-product-id]`. Around it:
//        <h4><a href="SEO-url">NAME</a></h4>
//        <span class="price-new">1,90€</span>   (current offer price)
//        <span class="price-old">2,40€</span>   (strikethrough original; absent
//                                                 → ΜΟΝΟ-style single price)
//        <div class="priceperkg">X,XX€/κιλό</div>
//        <img src="...catalog/product-upload/5201502119435_1-264x264.jpg">
//      Bazaar embeds the product's GTIN in the image filename, so we recover a
//      real barcode for most items — that links straight to the canonical
//      catalog (no Review Queue). `data-product-id` is the stable chain SKU.
//
// FRAGILITY: HTML scraping; OpenCart markup changes can break the selectors.
// Bazaar also throttles request bursts (SSL resets), so pace politely.

import { load as loadHtml } from 'cheerio';
import { ingestOffers, printReport, normalizeBarcode } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { installProxyFromEnv } from '../lib/proxy-fetch.mjs';
import { envInt, fetchWithBackoff, pace } from '../lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const ALLOW_PARTIAL_DRY_RUN = process.env.ALLOW_PARTIAL_DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PAGE_SIZE = envInt('PAGE_SIZE', 100);
const MAX_PAGES = envInt('MAX_PAGES', 60);
const PACE_MS = envInt('PACE_MS', 1500);
const JITTER_MS = envInt('JITTER_MS', 800);
const BASE = 'https://www.bazaar-online.gr/prosfores';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: 'https://www.bazaar-online.gr/',
};

// "1,90€" / "1.234,50 €" → 1.90 / 1234.50
function parseEur(s) {
  if (!s) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// "Εμφάνιση 1 έως 16 από 199" → 199
function readTotalCount(html) {
  const m = html.match(/από\s*([0-9][0-9.]*)/);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}

// Bazaar image filenames embed the GTIN: ".../product-upload/5201502119435_1-264x264.jpg".
// Pull the first 8–14 digit run from the basename; normalizeBarcode validates
// the check digit and returns null for non-GTIN filenames.
function barcodeFromImage(url) {
  if (!url) return null;
  const base = url.split('/').pop() || '';
  const m = base.match(/(\d{8,14})/);
  return m ? normalizeBarcode(m[1]) : null;
}

function extractItems(html) {
  const $ = loadHtml(html);
  const items = [];

  $('.product-thumb[data-product-id]').each((_, el) => {
    const $card = $(el);
    const sku = $card.attr('data-product-id');
    if (!sku) return;

    const $a = $card.find('h4 a').first();
    const name = $a.text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    const price = parseEur($card.find('.price-new').first().text());
    if (!price || price <= 0) return;

    const originalPrice = parseEur($card.find('.price-old').first().text());
    const unit = $card.find('.priceperkg').first().text().replace(/\s+/g, ' ').trim() || null;

    let imageUrl = $card.find('img').first().attr('src') || $card.find('img').first().attr('data-src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    items.push({
      name,
      price,
      // Strikethrough is a trustworthy published reference price; a single price
      // is ΜΟΝΟ-style (reference hidden). Guard against a bogus old <= new.
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
      chainItemcode: String(sku),
      barcode: barcodeFromImage(imageUrl),
      unit,
      imageUrl,
      offerType: originalPrice && originalPrice > price ? 'strikethrough' : 'mono',
    });
  });

  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.chainItemcode)) byCode.set(it.chainItemcode, it);
  return [...byCode.values()];
}

async function fetchPage(page) {
  const url = `${BASE}?page=${page}&limit=${PAGE_SIZE}`;
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label: `Bazaar page ${page}`, retries: 1 });
  if (!res.ok) throw new Error(`page ${page} HTTP ${res.status}`);
  return res.text();
}

export async function runBazaarAdapter({ dryRun = DRY_RUN, limit = LIMIT } = {}) {
  console.log(`🛒 Bazaar adapter${dryRun ? ' (DRY_RUN)' : ''}`);
  console.log(`   page size: ${PAGE_SIZE}, max pages: ${MAX_PAGES}, pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms`);
  installProxyFromEnv();

  const byCode = new Map();
  let totalCount = null;
  let drained = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page);
    if (page === 1) {
      totalCount = readTotalCount(html);
      console.log(`   total reported: ${totalCount ?? '?'} offers`);
    }
    const items = extractItems(html);
    if (items.length === 0) {
      drained = true;
      process.stdout.write(`\r   page ${page} — empty, stopping       \n`);
      break;
    }
    for (const it of items) if (!byCode.has(it.chainItemcode)) byCode.set(it.chainItemcode, it);
    process.stdout.write(`\r   page ${page} — unique so far: ${byCode.size}${totalCount ? '/' + totalCount : ''}   `);

    if (byCode.size >= limit) { drained = true; break; }                 // LIMIT smoke mode
    if (totalCount != null && byCode.size >= totalCount) { drained = true; break; }
    if (items.length < PAGE_SIZE) { drained = true; break; }             // short page = end
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  let offers = [...byCode.values()];
  if (offers.length > limit) offers = offers.slice(0, limit);
  const withBarcode = offers.filter((o) => o.barcode).length;
  console.log(`   ${offers.length} offers ready for ingest (${withBarcode} with barcode)`);

  // bazaar-online.gr serves its own images; mirror to Supabase for resilience
  // (rotating CDN paths / future blocks). No-op without creds.
  let mirrorWarnings = [];
  if (!dryRun) {
    const mirror = await mirrorImages({
      chain: 'bazaar',
      items: offers,
      match: (u) => u.includes('bazaar-online.gr'),
    });
    mirrorWarnings = mirror.warnings;
  }

  // Known-incomplete scrape (hit MAX_PAGES before draining, in a full run) →
  // tell the pipeline so it skips stale deactivation. A LIMIT smoke run is also
  // partial by definition.
  const partial = Number.isFinite(limit) || !drained;
  const report = await ingestOffers({
    chain: 'bazaar',
    source: 'web',
    items: offers,
    dryRun,
    extraWarnings: mirrorWarnings,
    partial,
  });
  printReport(report);
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
if (isMain) {
  runBazaarAdapter()
    .then((report) => {
      const probeOk = DRY_RUN && ALLOW_PARTIAL_DRY_RUN && report.scrapedItems > 0 && report.errors === 0;
      process.exit(report.healthOk || probeOk ? 0 : 1);
    })
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
