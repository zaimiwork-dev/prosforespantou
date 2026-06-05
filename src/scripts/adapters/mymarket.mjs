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

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '600', 10); // ~1.6 req/s — observed 429 above ~5 req/s
const PAGE_SIZE = 35;
const MAX_PAGES = 250;
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

const TOP_CATEGORIES = {
  'Φρούτα & Λαχανικά': 'Φρούτα & Λαχανικά',
  'Κρεοπωλείο': 'Κρέας & Ψάρι',
  'Κρεοπωλείο & Ιχθυοπωλείο': 'Κρέας & Ψάρι',
  'Ψαρικά': 'Κρέας & Ψάρι',
  'Γαλακτοκομικά': 'Γαλακτοκομικά & Είδη Ψυγείου',
  'Τυριά & Αλλαντικά': 'Τυριά & Αλλαντικά',
  'Κατεψυγμένα': 'Κατεψυγμένα',
  'Παντοπωλείο': 'Είδη Παντοπωλείου',
  'Αρτοζαχαροπλαστείο': 'Αρτοποιία',
  'Καφές & Ροφήματα': 'Πρωινό & Ροφήματα',
  'Σνακ & Γλυκά': 'Σνακ & Γλυκά',
  'Κάβα': 'Κάβα',
  'Προσωπική Φροντίδα': 'Προσωπική Φροντίδα',
  'Βρεφικά Είδη': 'Βρεφικά Είδη',
  'Φροντίδα για το Μωρό σας': 'Βρεφικά Είδη',
  'Οικιακή Φροντίδα & Χαρτικά': 'Είδη Καθαρισμού & Σπιτιού',
  'Κατοικίδια': 'Είδη Κατοικιδίων',
};

function categoryFromAnalytics(j) {
  if (!j) return 'Άλλο';
  const top = j.category;
  if (top && TOP_CATEGORIES[top]) return TOP_CATEGORIES[top];
  return 'Άλλο';
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
  const res = await fetch(`${BASE}?page=${pg}`, { headers: HEADERS });
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

    // Skip non-offer cards. The chain marks real offers with is-on-offer on the
    // selling-unit-row inside the card footer.
    const $row = $art.find('.selling-unit-row.is-on-offer').first();
    if (!$row.length) return;

    // Display price = current offer price.
    const $price = $row.find('.teaser-display-price').first();
    const whole = $price.find('.teaser-display-price-whole').first().text().trim();
    const frac = $price.find('.teaser-display-price-fraction').first().text().trim();
    let price = null;
    if (whole) price = parseFloat(`${whole}.${frac || '00'}`);
    if (!Number.isFinite(price) || price <= 0) {
      // Fallback to analytics JSON price.
      price = parseEurNumber(analytics.price);
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

    // Offer note: "SUPER ΤΙΜΗ", "ΜΟΝΟ", etc.
    const offerNote = $art.find('.offer-note').first().text().trim() || null;

    items.push({
      variantSku: String(variantSku),
      analyticsId: String(analytics.id || ''),
      name: String(analytics.name).trim(),
      price,
      brand: analytics.brand?.trim() || null,
      category: categoryFromAnalytics(analytics),
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
    originalPrice: null,
    chainItemcode: raw.variantSku,
    barcode: null,
    brand: raw.brand,
    unit: null,
    category: raw.category,
    imageUrl: raw.imageUrl,
    offerType: 'mono',
  };
}

export async function runMyMarketAdapter({ dryRun = DRY_RUN, limit = LIMIT } = {}) {
  console.log(`🛒 My Market adapter${dryRun ? ' (DRY_RUN)' : ''}`);

  const byCode = new Map();
  let totalCount = null;
  let lastNonEmptyPage = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let html;
    try {
      html = await fetchPage(page);
    } catch (err) {
      console.log(`\n   page ${page} fetch failed: ${err.message}, stopping`);
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
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log('');
  console.log(`   ${byCode.size} offers across ${lastNonEmptyPage} pages`);

  let offers = [...byCode.values()].map(toOfferItem).filter((it) => it && it.name && it.price > 0);
  if (offers.length > limit) offers = offers.slice(0, limit);

  const report = await ingestOffers({ chain: 'mymarket', source: 'web', items: offers, dryRun });
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
