// Masoutis FULL-CATALOG scraper.
//
// Uses Masoutis' own e-shop API, not Wolt:
//   1. POST GetScanNShopMenuAllLevelsAutoScheduler to discover shelf categories.
//   2. POST GetPromoItemWithListCouponsSubCategoriesAutoPromosv2 for each
//      category/page pair. Despite the endpoint name, normal category pages use
//      the same API shape and return the full shelf listing for that category.
//   3. Feed all rows to ingestCatalog, keyed by Masoutis Itemcode.
//
// Current official web/leaflet offer Itemcodes are fetched first and marked
// baseline:false, so a "MONO" promo price is never written as a normal shelf
// baseline.
//
// Usage:
//   node src/scripts/masoutis-catalog.mjs
//   DRY_RUN=1 ...
//   MAX_CATEGORIES=2 ...          # smoke test
//   LIMIT=500 ...                 # stop after N unique products
//   PACE_MS=900 JITTER_MS=400 ...

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { ingestCatalog } from './lib/ingest-catalog.mjs';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? parseInt(process.env.MAX_CATEGORIES, 10) : Infinity;
const MAX_PAGES_PER_CATEGORY = envInt('MAX_PAGES_PER_CATEGORY', 20);
const MAX_OFFER_PAGES = envInt('MAX_OFFER_PAGES', 60);
const PAGE_SIZE = 50;
const PACE_MS = envInt('PACE_MS', 900);
const JITTER_MS = envInt('JITTER_MS', 400);
const BASE = 'https://www.masoutis.gr/api/eshop';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.masoutis.gr',
  Referer: 'https://www.masoutis.gr/',
};

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getCred() {
  const res = await fetchWithBackoff(`${BASE}/GetCred`, {
    headers: { ...HEADERS, authorization: 'Bearer null' },
  }, { label: 'Masoutis catalog GetCred' });
  if (!res.ok) throw new Error(`GetCred failed - HTTP ${res.status}`);
  const c = await res.json();
  if (!c.Uid || !c.Key) throw new Error(`GetCred returned no credential: ${JSON.stringify(c).slice(0, 200)}`);
  return { uid: c.Uid, usl: c.Usl, key: c.Key };
}

async function postJson(cred, path, body, label) {
  const res = await fetchWithBackoff(`${BASE}/${path}`, {
    method: 'POST',
    headers: { ...HEADERS, uid: cred.uid, usl: cred.usl, key: cred.key },
    body: JSON.stringify(body),
  }, { label });
  if (!res.ok) throw new Error(`${label} failed - HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 120)}`);
  }
}

async function fetchMenu(cred) {
  const rows = await postJson(
    cred,
    'GetScanNShopMenuAllLevelsAutoScheduler',
    { PassKey: 'Sc@NnSh0p' },
    'Masoutis catalog menu',
  );
  if (!Array.isArray(rows)) throw new Error('Masoutis catalog menu was not an array');
  return rows;
}

function catalogCategories(menuRows) {
  const byCode = new Map();
  for (const row of menuRows) {
    const rootCode = String(row.HeaderMenuItem || '').trim();
    const subCode = String(row.MenuItemcode || '').trim();
    if (row.ItemLevel !== 2 || !rootCode || !subCode) continue;

    // Real shelf departments use the e-shop category root as HeaderMenuItem
    // (544, 568, 727, ...). Special collections/offers are small synthetic
    // roots (0, 2, 5, 6, 7, 10, 11, 13) and duplicate the same products.
    if (Number(rootCode) < 500) continue;

    const code = `${rootCode},${subCode}`;
    if (byCode.has(code)) continue;
    byCode.set(code, {
      code,
      root: String(row.HeaderMenuItemDescr || '').trim(),
      name: String(row.MenuItemDescr || '').trim(),
      href: row.MenuItemLinkDescr || null,
    });
  }
  return [...byCode.values()];
}

async function fetchRows(cred, code, page, label) {
  const rows = await postJson(
    cred,
    'GetPromoItemWithListCouponsSubCategoriesAutoPromosv2',
    {
      PassKey: 'Sc@NnSh0p',
      Itemcode: code,
      ItemDescr: '0',
      IfWeight: String(page),
      ServiceResponse: '',
      Token: '',
      Zip: '',
      BrandName: '',
      TeamId: '',
      ExtraFilter: '',
    },
    label,
  );
  return Array.isArray(rows) ? rows : (rows.items || rows.Items || []);
}

async function fetchCurrentOfferCodes(cred, sourceCode, label) {
  const out = new Set();
  for (let page = 1; page <= MAX_OFFER_PAGES; page++) {
    const rows = await fetchRows(cred, sourceCode, page, `${label} page ${page}`);
    for (const row of rows) if (row.Itemcode != null) out.add(String(row.Itemcode));
    if (rows.length < PAGE_SIZE) break;
    await pace(PACE_MS, JITTER_MS);
  }
  return out;
}

function isCurrentOffer(raw, offerCodes) {
  const code = raw.Itemcode != null ? String(raw.Itemcode) : null;
  if (code && offerCodes.has(code)) return true;
  const price = asNumber(raw.PosPrice);
  const start = asNumber(raw.StartPrice);
  if (price && start && start > price) return true;
  if (raw.CouponID || raw.CouponDiscount || raw.AmountWithCoupon) return true;
  return false;
}

function toCatalogItem(raw, category, offerCodes) {
  const price = asNumber(raw.PosPrice ?? raw.Price);
  const chainItemcode = raw.Itemcode != null ? String(raw.Itemcode) : null;
  const name = String(raw.ItemDescr || '').trim();
  if (!price || !chainItemcode || !name) return null;

  return {
    chainItemcode,
    name,
    price,
    barcode: null,
    brand: String(raw.BrandNameDesciption || '').trim() || null,
    unitInfo: String(raw.ItemSize || raw.ItemVolume || (raw.IfWeight ? 'kg' : '')).trim() || null,
    imageUrl: raw.PhotoData || raw.PhotoLink || null,
    category: `${category.root}/${category.name}`,
    baseline: !isCurrentOffer(raw, offerCodes),
  };
}

async function run() {
  console.log(`Masoutis CATALOG scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  console.log(`   pace: ${PACE_MS}ms + jitter ${JITTER_MS}ms; max pages/category: ${MAX_PAGES_PER_CATEGORY}; max offer pages: ${MAX_OFFER_PAGES}`);
  const extraWarnings = [];
  if (Number.isFinite(LIMIT)) extraWarnings.push(`LIMIT=${LIMIT} active; catalog run is intentionally partial.`);
  if (Number.isFinite(MAX_CATEGORIES)) extraWarnings.push(`MAX_CATEGORIES=${MAX_CATEGORIES} active; catalog run is intentionally partial.`);

  const cred = await getCred();
  const menu = await fetchMenu(cred);
  let categories = catalogCategories(menu);
  console.log(`   ${categories.length} shelf categories discovered`);
  if (Number.isFinite(MAX_CATEGORIES)) categories = categories.slice(0, MAX_CATEGORIES);

  const [webOffers, leafletOffers] = await Promise.all([
    fetchCurrentOfferCodes(cred, '0,1', 'Masoutis web offers'),
    fetchCurrentOfferCodes(cred, '0,2', 'Masoutis leaflet offers'),
  ]);
  const offerCodes = new Set([...webOffers, ...leafletOffers]);
  console.log(`   ${offerCodes.size} current official offer Itemcodes will skip normal baselines`);

  const byCode = new Map();
  let catIdx = 0;
  for (const category of categories) {
    catIdx++;
    let fetchedForCategory = 0;
    try {
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        const rows = await fetchRows(cred, category.code, page, `Masoutis ${category.code} page ${page}`);
        fetchedForCategory += rows.length;
        for (const row of rows) {
          const item = toCatalogItem(row, category, offerCodes);
          if (item && !byCode.has(item.chainItemcode)) byCode.set(item.chainItemcode, item);
        }
        process.stdout.write(`\r   category ${catIdx}/${categories.length} ${category.code} page ${page} - unique: ${byCode.size}      `);
        if (byCode.size >= LIMIT) break;
        if (rows.length < PAGE_SIZE) break;
        if (page === MAX_PAGES_PER_CATEGORY) {
          extraWarnings.push(`Category ${category.code} hit MAX_PAGES_PER_CATEGORY=${MAX_PAGES_PER_CATEGORY}; partial category.`);
        }
        await pace(PACE_MS, JITTER_MS);
      }
    } catch (e) {
      const warning = `Category ${category.code} failed (${e.message}); partial catalog.`;
      console.log(`\n   ${warning}`);
      extraWarnings.push(warning);
    }
    if (fetchedForCategory === 0) console.log(`\n   Category ${category.code} returned 0 rows; continuing.`);
    if (byCode.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');

  let items = [...byCode.values()];
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  const baselineItems = items.filter((it) => it.baseline !== false).length;
  const promoItems = items.length - baselineItems;
  console.log(`   ${items.length} unique products ready (${baselineItems} baseline, ${promoItems} current-offer/no-baseline)`);

  const report = await ingestCatalog({ chain: 'masoutis', items, dryRun: DRY_RUN, extraWarnings });
  console.log(`\nDone - created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors}`);
  const smokeOk = DRY_RUN && report.total > 0 && report.errors === 0;
  process.exit(report.healthOk || smokeOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n${e.stack || e.message}`); process.exit(1); });
