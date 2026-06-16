// My Market adapter.
//
// Scrapes current offers from mymarket.gr's `/offers?page=N` listing and hands
// them to the shared ingest pipeline. See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/mymarket.mjs            # all is-on-offer items
//   DRY_RUN=1 node src/scripts/adapters/mymarket.mjs  # fetch + match, no DB writes
//   LIMIT=50 node src/scripts/adapters/mymarket.mjs   # smoke test (skips deactivation)
//
// How it works:
//   1. GET https://www.mymarket.gr/offers?page=N for N = 1..ceil(total/35).
//      Page header: <span class="current-page">X από τα Y προϊόντα</span> — Y
//      uses Greek "." as thousands separator. 35 product cards per page.
//   2. The /offers landing also mixes in non-offer items (sorted offers-first).
//      Each card's selling-unit-row carries either `is-on-offer` (real offer) or
//      `!gap-[9px]` (regular price). We KEEP only is-on-offer cards.
//   3. Each card has a `data-google-analytics-item-param` JSON blob with
//      `{ id, name, price, brand, category, category2, category3 }`. That's
//      structured data — much more reliable than scraping the visual price.
//      The display price (teaser-display-price-whole + -fraction) confirms it.
//   4. Variant SKU = `data-product="<n>"` on the wishlist trigger. Use that as
//      chainItemcode (stable identity for this catalogue position).
//
// No GTIN is exposed on the listing or product detail page — matching depends on
// the chain-agnostic LLM resolver, same as AB and Sklavenitis.
//
// FRAGILITY: HTML scrape. Any change to the offer-card structure / class names
// can break the extractor. Spot-check the report's "matched + review" counts
// after every workflow run.

import { load as loadHtml } from 'cheerio';
import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { envInt, fetchWithBackoff, pace } from '../lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = envInt('PACE_MS', 1200); // mymarket 429s above ~5 req/s; autonomous runs stay gentler
const JITTER_MS = envInt('JITTER_MS', 600);
const PAGE_SIZE = 35;
const MAX_PAGES = envInt('MAX_PAGES', 250);
const BASE = 'https://www.mymarket.gr/offers';

// NOTE: mymarket.gr returns 429 for older Chrome UA strings (Chrome 120 was
// blocked as of 2026-06-05). Keep this UA recent — if you start seeing 429s
// on every request, that's the first thing to update.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  Referer: 'https://www.mymarket.gr/',
};

// Most-specific native category the analytics blob carries. Kept verbatim as
// the Discount.subcategory; the shared categorizer (lib/categories.ts) derives
// the top-level department from name + this hint. We no longer pre-bucket here
// (the old TOP_CATEGORIES map only mapped the coarse top level and dropped 41%
// of items into "Άλλο").
function nativeCategoryFromAnalytics(j) {
  if (!j) return null;
  return (j.category3 || j.category2 || j.category || '').trim() || null;
}

function parseGreekInt(s) {
  if (!s) return null;
  const m = String(s).match(/([0-9][0-9.]*)/);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ''), 10);
}

function parseEurNumber(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(pg) {
  const res = await fetchWithBackoff(`${BASE}?page=${pg}`, { headers: HEADERS }, { label: `My Market page ${pg}` });
  if (!res.ok) throw new Error(`page ${pg} HTTP ${res.status}`);
  return res.text();
}

function readTotalCount(html) {
  // "5.276 προϊόντα" with Greek thousands separator.
  const m = html.match(/([0-9][0-9.]*)\s*προϊόντα/);
  return m ? parseGreekInt(m[1]) : null;
}

function extractItemsFromHtml(html) {
  const $ = loadHtml(html);
  const items = [];

  // Each offer's article carries a data-google-analytics-item-value JSON blob
  // (one per card root). We pick the article and then walk inside for the
  // is-on-offer flag, display price and variant SKU.
  $('article[data-google-analytics-item-value]').each((_, el) => {
    const $art = $(el);
    let analytics = null;
    try {
      analytics = JSON.parse($art.attr('data-google-analytics-item-value') || '');
    } catch {
      return;
    }
    if (!analytics?.name) return;

    // Two kinds of My Market offer:
    //   (a) PACKAGED — `.selling-unit-row.is-on-offer`, headline teaser price.
    //   (b) WEIGHTED (meat/produce/deli) — row is `selling-unit-row !gap-[9px]`
    //       (NOT is-on-offer) but it carries an "Αρχ. τιμή κιλού / Τελ. τιμή
    //       κιλού" pair, i.e. a struck original → it IS on offer. The old
    //       is-on-offer-only filter silently dropped this whole class (the
    //       leaflet's entire fresh-food ΠΡΟΣΦΟΡΑ section).
    const $row = $art.find('.selling-unit-row.is-on-offer').first();

    // Parse the per-kilo "Αρχ./Τελ. τιμή" pair if present (weighted offers).
    let archi = null, teli = null;
    $art.find('.measure-label-wrapper').each((_i, w) => {
      const t = $(w).text();
      if (/Αρχ\. τιμή/.test(t)) archi = parseEurNumber(t);
      else if (/Τελ\. τιμή/.test(t)) teli = parseEurNumber(t);
    });
    const hasArchTeli = Number.isFinite(archi) && Number.isFinite(teli) && archi > teli && teli > 0;
    const isWeightedOffer = !$row.length && hasArchTeli;
    const offerNote = $art.find('.offer-note').first().text().trim() || null;
    const printedOfferText = [
      offerNote,
      $art.find('[class*="badge"], [class*="label"], [class*="sticker"]').text(),
    ].filter(Boolean).join(' ');
    const hasPrintedOfferSignal = /super|mono|μόνο|δωρ|δώρ|προσφ|χαμηλ/i.test(printedOfferText);

    // Keep only real offers; a plain regular-price row (no is-on-offer, no
    // struck original) is skipped.
    if (!$row.length && !isWeightedOffer) return;

    let price = null;
    let originalPrice = null;

    if ($row.length) {
      // PACKAGED: headline teaser price.
      const $price = $row.find('.teaser-display-price').first();
      const whole = $price.find('.teaser-display-price-whole').first().text().trim();
      const frac = $price.find('.teaser-display-price-fraction').first().text().trim();
      if (whole) price = parseFloat(`${whole}.${frac || '00'}`);
      if (!Number.isFinite(price) || price <= 0) price = parseEurNumber(analytics.price);
      if (!Number.isFinite(price) || price <= 0) return;

      // Original price via discount PERCENT (scale-invariant), back-applied to
      // the displayed price — the two scales don't always line up.
      let pct = null;
      if (hasArchTeli) {
        pct = 1 - teli / archi;
      } else {
        const orig = parseEurNumber($art.find('span.line-through').first().text().trim());
        if (Number.isFinite(orig) && orig > price && orig / price <= 3) pct = 1 - price / orig;
      }
      if (pct != null && pct > 0.01 && pct < 0.95) {
        originalPrice = Math.round((price / (1 - pct)) * 100) / 100;
      }
      if (!originalPrice && !hasPrintedOfferSignal) return;
    } else {
      // WEIGHTED: per-kilo final + original come straight from the label pair.
      price = teli;
      originalPrice = archi;
    }
    if (!Number.isFinite(price) || price <= 0) return;

    // Variant SKU. The wishlist trigger holds data-product="<id>". The article
    // sometimes has a separate `data-id` but the variant id from the cart form
    // is what stays stable across re-renders.
    const variantSku =
      $art.find('[data-add-to-cart-variant-value]').first().attr('data-add-to-cart-variant-value') ||
      $art.attr('data-id') ||
      String(analytics.id);

    // Image
    let imageUrl = $art.find('picture img').first().attr('src') || $art.find('img').first().attr('src') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    items.push({
      variantSku: String(variantSku),
      analyticsId: String(analytics.id || ''),
      name: String(analytics.name).trim(),
      price,
      originalPrice,
      brand: analytics.brand?.trim() || null,
      category: nativeCategoryFromAnalytics(analytics),
      imageUrl,
      offerNote,
    });
  });

  // Dedup by variant SKU within the page.
  const byCode = new Map();
  for (const it of items) if (!byCode.has(it.variantSku)) byCode.set(it.variantSku, it);
  return [...byCode.values()];
}

function toOfferItem(raw) {
  return {
    name: raw.name,
    price: raw.price,
    originalPrice: raw.originalPrice ?? null,
    chainItemcode: raw.variantSku,
    barcode: null,
    brand: raw.brand,
    unit: null,
    category: raw.category,
    imageUrl: raw.imageUrl,
    description: raw.offerNote,
    offerType: raw.originalPrice ? 'strikethrough' : 'mono',
  };
}

export async function runMyMarketAdapter({ dryRun = DRY_RUN, limit = LIMIT } = {}) {
  console.log(`🛒 My Market adapter${dryRun ? ' (DRY_RUN)' : ''}`);

  const byCode = new Map();
  let totalCount = null;
  let lastNonEmptyPage = 0;
  let partial = false;
  const extraWarnings = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    let html;
    try {
      html = await fetchPage(page);
    } catch (err) {
      const warning = `Page ${page} fetch failed (${err.message}); treating run as partial.`;
      console.log(`\n   ${warning}`);
      extraWarnings.push(warning);
      partial = true;
      break;
    }
    if (page === 1) {
      totalCount = readTotalCount(html);
      console.log(`   catalogue size reported: ${totalCount ?? '?'} products (offers are a subset)`);
    }
    const cards = extractItemsFromHtml(html);
    const cardsThisPage = (html.match(/data-product="[0-9]+"/g) || []).length;
    if (cardsThisPage === 0) {
      process.stdout.write(`\r   page ${page} — empty page, stopping       \n`);
      break;
    }
    lastNonEmptyPage = page;

    let added = 0;
    for (const c of cards) if (!byCode.has(c.variantSku)) { byCode.set(c.variantSku, c); added++; }
    process.stdout.write(`\r   page ${page} — +${added} offers (page ${cards.length}/${cardsThisPage} on-offer) — total: ${byCode.size}   `);

    if (byCode.size >= limit) break;
    // End of pagination: short page (fewer than PAGE_SIZE cards = last page).
    if (cardsThisPage < PAGE_SIZE && page > 1) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');
  console.log(`   ${byCode.size} offers across ${lastNonEmptyPage} pages`);

  let offers = [...byCode.values()].map(toOfferItem).filter((it) => it && it.name && it.price > 0);
  if (offers.length > limit) offers = offers.slice(0, limit);

  // cdn.mymarket.gr serves browsers but refuses the Vercel optimizer's
  // datacenter IPs (verified 2026-06-12: URLs 200 from a residential
  // connection while prod cards showed placeholders) — mirror to Supabase
  // like AB. Mirror the `original` style so the stored copy is sharp on the
  // offer page too; next/image downsizes it for cards.
  let mirrorWarnings = [];
  if (!dryRun) {
    const mirror = await mirrorImages({
      chain: 'mymarket',
      items: offers,
      match: (u) => u.includes('cdn.mymarket.gr'),
      rewrite: (u) => u.replace(/\/images\/styles\/(?:thumbnail|alt_thumbnail|medium)\//, '/images/styles/original/'),
    });
    mirrorWarnings = mirror.warnings;
  }

  const report = await ingestOffers({ chain: 'mymarket', source: 'web', items: offers, dryRun, extraWarnings: [...extraWarnings, ...mirrorWarnings], partial });
  printReport(report);
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
if (isMain) {
  runMyMarketAdapter()
    .then((report) => process.exit(report.healthOk ? 0 : 1))
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
