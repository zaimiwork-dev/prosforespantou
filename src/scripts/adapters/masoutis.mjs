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
// How it works:
//   1. GET /api/eshop/GetCred → { Uid, Usl, Key } (anonymous credential).
//   2. POST /api/eshop/GetPromoItemWith... once per page. The body field
//      `IfWeight` is the page number; 50 items/page; stop when a page is short.
//      `Itemcode` "0,1" = weekly web offers, "0,2" = leaflet offers.

import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';

const SOURCE = process.env.SOURCE === 'leaflet' ? 'leaflet' : 'web';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

const BASE = 'https://www.masoutis.gr/api/eshop';
const ITEMCODE_FILTER = SOURCE === 'leaflet' ? '0,2' : '0,1';
const PAGE_SIZE = 50;
const MAX_PAGES = 60; // safety cap

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.masoutis.gr',
  Referer: 'https://www.masoutis.gr/categories/index/prosfores',
};

async function getCred() {
  const res = await fetch(`${BASE}/GetCred`, { headers: { ...HEADERS, authorization: 'Bearer null' } });
  if (!res.ok) throw new Error(`GetCred failed — HTTP ${res.status}`);
  const c = await res.json();
  if (!c.Uid || !c.Key) throw new Error(`GetCred returned no credential: ${JSON.stringify(c).slice(0, 200)}`);
  return { uid: c.Uid, usl: c.Usl, key: c.Key };
}

async function fetchPage(cred, page) {
  const body = {
    PassKey: 'Sc@NnSh0p',
    Itemcode: ITEMCODE_FILTER,
    ItemDescr: '0',
    IfWeight: String(page),
    ServiceResponse: '', Token: '', Zip: '', BrandName: '', TeamId: '', ExtraFilter: '',
  };
  const res = await fetch(`${BASE}/GetPromoItemWithListCouponsSubCategoriesAutoPromosv2`, {
    method: 'POST',
    headers: { ...HEADERS, uid: cred.uid, usl: cred.usl, key: cred.key },
    body: JSON.stringify(body),
  });
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
  return {
    name: (raw.ItemDescr || '').trim(),
    price,
    originalPrice: start > price ? start : null,
    chainItemcode: String(raw.Itemcode),
    barcode: null, // Masoutis offers API does not expose GTIN
    brand: (raw.BrandNameDesciption || '').trim() || null,
    unit: (raw.ItemSize || raw.ItemVolume || '').toString().trim() || null,
    category: (raw.OfferCategoryDescr || '').trim() || 'Άλλο',
    imageUrl: raw.PhotoData || raw.PhotoLink || null,
    offerType: /%/.test(offerDescr) ? 'strikethrough' : (offerDescr ? 'mono' : null),
  };
}

async function run() {
  console.log(`🛒 Masoutis adapter — source=${SOURCE}${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const cred = await getCred();
  console.log(`   credential ok (usl=${cred.usl})`);

  const byItemcode = new Map();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await fetchPage(cred, page);
    for (const r of rows) {
      if (r.Itemcode != null) byItemcode.set(String(r.Itemcode), r);
    }
    process.stdout.write(`\r   page ${page} — ${rows.length} rows — unique items: ${byItemcode.size}   `);
    if (rows.length < PAGE_SIZE) break;
    if (byItemcode.size >= LIMIT) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log('');

  let items = [...byItemcode.values()].map(toOfferItem).filter((it) => it && it.name);
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} offers ready to ingest`);

  const report = await ingestOffers({ chain: 'masoutis', source: SOURCE, items, dryRun: DRY_RUN });
  printReport(report);
  process.exit(report.healthOk ? 0 : 1);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
