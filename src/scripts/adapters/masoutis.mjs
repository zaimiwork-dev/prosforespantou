// Masoutis adapter.
//
// Fetches current offers straight from masoutis.gr's JSON API (no browser) and
// hands them to the shared ingest pipeline. See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/masoutis.mjs              # web offers (Προσφορές Εβδομάδας)
//   SOURCE=leaflet node src/scripts/adapters/masoutis.mjs   # leaflet offers (Φυλλαδίου)
//   DRY_RUN=1 node src/scripts/adapters/masoutis.mjs    # fetch + match, no DB writes
//
// Programmatic (e.g. from a cron route):
//   import { runMasoutisAdapter } from '@/scripts/adapters/masoutis.mjs';
//   const report = await runMasoutisAdapter({ source: 'web', dryRun: false });
//
// How it works:
//   1. GET /api/eshop/GetCred → { Uid, Usl, Key } (anonymous credential).
//   2. POST /api/eshop/GetPromoItemWith... once per page. The body field
//      `IfWeight` is the page number; 50 items/page; stop when a page is short.
//      `Itemcode` "0,1" = weekly web offers, "0,2" = leaflet offers.

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { mirrorImages } from '../lib/mirror-images.mjs';
import { envInt, fetchWithBackoff, pace } from '../lib/polite-http.mjs';

const BASE = 'https://www.masoutis.gr/api/eshop';
const PAGE_SIZE = 50;
const MAX_PAGES = envInt('MAX_PAGES', 120); // safety cap (6,000 rows)
const PACE_MS = envInt('PACE_MS', 650);
const JITTER_MS = envInt('JITTER_MS', 300);

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.masoutis.gr',
  Referer: 'https://www.masoutis.gr/categories/index/prosfores',
};

async function getCred() {
  const res = await fetchWithBackoff(`${BASE}/GetCred`, {
    headers: { ...HEADERS, authorization: 'Bearer null' },
  }, { label: 'Masoutis GetCred' });
  if (!res.ok) throw new Error(`GetCred failed — HTTP ${res.status}`);
  const c = await res.json();
  if (!c.Uid || !c.Key) throw new Error(`GetCred returned no credential: ${JSON.stringify(c).slice(0, 200)}`);
  return { uid: c.Uid, usl: c.Usl, key: c.Key };
}

async function fetchPage(cred, page, itemcodeFilter) {
  const body = {
    PassKey: 'Sc@NnSh0p',
    Itemcode: itemcodeFilter,
    ItemDescr: '0',
    IfWeight: String(page),
    ServiceResponse: '', Token: '', Zip: '', BrandName: '', TeamId: '', ExtraFilter: '',
  };
  const res = await fetchWithBackoff(`${BASE}/GetPromoItemWithListCouponsSubCategoriesAutoPromosv2`, {
    method: 'POST',
    headers: { ...HEADERS, uid: cred.uid, usl: cred.usl, key: cred.key },
    body: JSON.stringify(body),
  }, { label: `Masoutis promo page ${page}` });
  if (!res.ok) throw new Error(`promo page ${page} failed — HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items || data.Items || []);
}

// Masoutis raw offer → OfferItem (the contract shape).
function toOfferItem(raw) {
  const price = Number(raw.PosPrice);
  const start = Number(raw.StartPrice);
  if (!price || price <= 0) return null; // unpriced row — skip
  const offerDescr = (raw.OfferDescr || raw.Discount || '').trim();
  const originalPrice = start > price ? start : null;
  return {
    name: (raw.ItemDescr || '').trim(),
    price,
    originalPrice,
    chainItemcode: String(raw.Itemcode),
    barcode: null, // Masoutis offers API does not expose GTIN
    brand: (raw.BrandNameDesciption || '').trim() || null,
    unit: (raw.ItemSize || raw.ItemVolume || '').toString().trim() || null,
    category: (raw.OfferCategoryDescr || '').trim() || 'Άλλο',
    imageUrl: raw.PhotoData || raw.PhotoLink || null,
    offerType: originalPrice ? 'strikethrough' : (offerDescr ? 'mono' : null),
  };
}

// Programmatic entry — return the ingest report instead of exiting.
export async function collectMasoutisOffers({ source = 'web', limit = Infinity, log = console.log } = {}) {
  const itemcodeFilter = source === 'leaflet' ? '0,2' : '0,1';
  const cred = await getCred();
  log(`   credential ok (usl=${cred.usl})`);

  const byItemcode = new Map();
  let stoppedOnShortPage = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await fetchPage(cred, page, itemcodeFilter);
    for (const r of rows) {
      if (r.Itemcode != null) byItemcode.set(String(r.Itemcode), r);
    }
    log(`   page ${page} — ${rows.length} rows — unique items: ${byItemcode.size}`);
    if (rows.length < PAGE_SIZE) {
      stoppedOnShortPage = true;
      break;
    }
    if (byItemcode.size >= limit) break;
    await pace(PACE_MS, JITTER_MS);
  }

  let items = [...byItemcode.values()].map(toOfferItem).filter((it) => it && it.name);
  if (items.length > limit) items = items.slice(0, limit);
  log(`   ${items.length} offers ready to ingest`);

  // Masoutis promo URLs ROTATE weekly (root cause of the 06-12 image
  // regression) — mirror to Supabase so the copy we show never dies. This
  // adapter runs inside the Vercel cron's 300s budget, so cap fresh downloads
  // per run: HEAD-reuses are free, and the backlog drains across a few runs.
  // No-op (originals kept + report warning) without SUPABASE creds in Vercel.
  // A full final page at MAX_PAGES means the feed may continue beyond our
  // safety cap. Mark the run partial so stale deactivation is forbidden.
  // Likewise, any finite LIMIT is an intentional partial run.
  const partial = Number.isFinite(limit) || !stoppedOnShortPage;
  return { items, partial };
}

// Programmatic entry — return the ingest report instead of exiting.
export async function runMasoutisAdapter({ source = 'web', dryRun = false, limit = Infinity, log = console.log } = {}) {
  log(`🛒 Masoutis adapter — source=${source}${dryRun ? ' (DRY_RUN)' : ''}`);
  const { items, partial } = await collectMasoutisOffers({ source, limit, log });

  // Mirror rotating promo images only during a real ingest. The read-only
  // coverage audit deliberately skips this write-side work.
  let mirrorWarnings = [];
  if (!dryRun) {
    const mirror = await mirrorImages({
      chain: 'masoutis',
      items,
      match: (u) => u.includes('masoutisimagesneu.blob.core.windows.net'),
      maxNew: 120,
      paceMs: 60,
    });
    mirrorWarnings = mirror.warnings;
  }

  return await ingestOffers({
    chain: 'masoutis',
    source,
    items,
    dryRun,
    extraWarnings: mirrorWarnings,
    partial,
  });
}

// CLI behavior — only when this file is invoked directly via `node`.
const isMain = process.argv[1] && /[\\/]masoutis\.mjs$/.test(process.argv[1]);
if (isMain) {
  const source = process.env.SOURCE === 'leaflet' ? 'leaflet' : 'web';
  const dryRun = process.env.DRY_RUN === '1';
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
  runMasoutisAdapter({ source, dryRun, limit })
    .then((report) => { printReport(report); process.exit(report.healthOk ? 0 : 1); })
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
