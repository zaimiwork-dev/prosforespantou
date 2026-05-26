// Try various Wolt items-endpoint patterns to find the one that returns
// product details including GTIN. We have the venue slug "masoutis-makedonias"
// and a known item ID "63b2d1bcd933777ec2e073e7" (Kris Kris bread).

import fs from 'fs';

const VENUE_SLUG = 'masoutis-makedonias';
const ITEM_ID = '63b2d1bcd933777ec2e073e7';
const ASSORTMENT_ID = '639b03123b75ae8b6fdeff22'; // from previous probe

const CANDIDATES = [
  // Standard consumer-api patterns
  `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${VENUE_SLUG}/items/${ITEM_ID}`,
  `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/assortments/${ASSORTMENT_ID}/items/${ITEM_ID}`,
  `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/items/${ITEM_ID}`,
  `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${VENUE_SLUG}/items`,
  `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${VENUE_SLUG}/menu`,
  // order-xp variants (the one we saw in browser probe with GTINs)
  `https://consumer-api.wolt.com/order-xp/web/v1/venue/slug/${VENUE_SLUG}/items/${ITEM_ID}`,
  `https://consumer-api.wolt.com/order-xp/web/v1/venue/slug/${VENUE_SLUG}/item/${ITEM_ID}`,
  `https://consumer-api.wolt.com/order-xp/web/v1/venue/slug/${VENUE_SLUG}/dynamic/?selected_delivery_method=homedelivery`,
  // Older v3/v4 patterns
  `https://restaurant-api.wolt.com/v4/venues/slug/${VENUE_SLUG}/menu`,
  `https://consumer-api.wolt.com/consumer-api/venue-content-api/v3/web/venue-content/slug/${VENUE_SLUG}`,
];

const HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://wolt.com',
  'Referer': 'https://wolt.com/',
};

function findGtinFields(obj, path = '', hits = []) {
  if (obj === null || obj === undefined) return hits;
  if (Array.isArray(obj)) { obj.forEach((v, i) => findGtinFields(v, `${path}[${i}]`, hits)); return hits; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/gtin|^ean$|barcode/i.test(k)) hits.push({ path: path ? `${path}.${k}` : k, key: k, value: v });
      findGtinFields(v, path ? `${path}.${k}` : k, hits);
    }
  }
  return hits;
}

function findGreekGtins(obj, hits = new Set()) {
  if (obj === null || obj === undefined) return hits;
  if (typeof obj === 'string' && /^52[01]\d{10}$/.test(obj)) hits.add(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => findGreekGtins(v, hits));
  else if (typeof obj === 'object') Object.values(obj).forEach((v) => findGreekGtins(v, hits));
  return hits;
}

async function probe(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    if (!res.ok) return { url, status: res.status, size: text.length, error: text.slice(0, 120) };
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!json) return { url, status: res.status, size: text.length, note: 'not-json' };
    const gtinFields = findGtinFields(json);
    const greekGtins = [...findGreekGtins(json)];
    return { url, status: res.status, size: text.length, gtinFields: gtinFields.length, gtinFieldsSample: gtinFields.slice(0, 5), greekGtinCount: greekGtins.length, greekGtinsSample: greekGtins.slice(0, 5), json };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function run() {
  for (const url of CANDIDATES) {
    const r = await probe(url);
    const tag = r.error ? '❌' : r.status === 200 ? '✅' : '⚠️ ';
    console.log(`\n${tag} ${r.status || 'ERR'} (${r.size || 0} bytes) ${url}`);
    if (r.error) { console.log(`   ${r.error}`); continue; }
    if (r.note) console.log(`   ${r.note}`);
    if (r.gtinFields) {
      console.log(`   🎯 ${r.gtinFields} GTIN-named fields found.`);
      r.gtinFieldsSample.forEach((f) => console.log(`     ${f.path} = ${JSON.stringify(f.value).slice(0, 80)}`));
    }
    if (r.greekGtinCount) {
      console.log(`   🇬🇷 ${r.greekGtinCount} Greek GTINs (520/521 prefix) found in body.`);
      console.log(`     samples: ${r.greekGtinsSample.join(', ')}`);
    }
    // For the most promising hit, also save the full response
    if (r.gtinFields > 0 && r.json) {
      const fileName = url.replace(/[^a-z0-9]+/gi, '_').slice(-80) + '.json';
      fs.writeFileSync(`./library_data/barcode_probe_wolt/${fileName}`, JSON.stringify(r.json, null, 2));
      console.log(`   📁 saved full response to ${fileName}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
