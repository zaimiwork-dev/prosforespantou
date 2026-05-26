// Fetch a Wolt category and analyze how MONO-style offers (no strikethrough,
// just "ΜΟΝΟ X.XX€") are signaled — beyond `original_price > price`.

import fs from 'fs';

const VENUE = 'masoutis-makedonias';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://wolt.com',
  Referer: 'https://wolt.com/',
};
const BASE = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1';

async function get(url) {
  const r = await fetch(url, { headers: HEADERS });
  return r.json();
}

// Use the "Προσφορές Φυλλαδίου" category — should be FULL of MONO-style offers
const assortment = await get(`${BASE}/venues/slug/${VENUE}/assortment`);
const cats = [];
function walk(node) { if (node.slug) cats.push({ slug: node.slug, name: node.name }); (node.subcategories || []).forEach(walk); }
(assortment.categories || []).forEach(walk);

// Skip empty virtual categories — pick a real product category with items
let offerCat = null;
const tryCats = ['turokomika', 'allantika', 'galaktokomika', 'manabikh', 'fresko-kreas', 'zacharoplastiki'].map((slug) => cats.find((c) => c.slug?.includes(slug))).filter(Boolean);
for (const c of tryCats.concat(cats)) {
  const test = await get(`${BASE}/venues/slug/${VENUE}/assortment/categories/slug/${encodeURIComponent(c.slug)}`);
  if ((test.items || []).length > 10) { offerCat = c; break; }
}
console.log(`Using category: "${offerCat.name}" (slug=${offerCat.slug})`);

const data = await get(`${BASE}/venues/slug/${VENUE}/assortment/categories/slug/${encodeURIComponent(offerCat.slug)}`);
const items = data.items || [];
console.log(`${items.length} items in this category`);

// Classify each item
const classes = {
  'original > price (real discount)': 0,
  'original == price (no discount)': 0,
  'original is null': 0,
  'price == 0 / weird': 0,
};
const signalFields = {};

for (const it of items) {
  if (!it.price) { classes['price == 0 / weird']++; continue; }
  if (it.original_price === null || it.original_price === undefined) classes['original is null']++;
  else if (it.original_price > it.price) classes['original > price (real discount)']++;
  else classes['original == price (no discount)']++;

  // Tally non-null fields that might indicate an offer
  for (const k of ['item_price_discount_validity_period', 'advertising_badge', 'advertising_info', 'advertising_metadata', 'lowest_price', 'lowest_price_v2', 'tags', 'promo_badges']) {
    if (it[k] !== null && it[k] !== undefined && (typeof it[k] !== 'object' || (Array.isArray(it[k]) ? it[k].length > 0 : Object.keys(it[k]).length > 0))) {
      signalFields[k] = (signalFields[k] || 0) + 1;
    }
  }
}

console.log('\nPrice classifications:');
for (const [k, v] of Object.entries(classes)) console.log(`  ${k}: ${v}`);

console.log('\nNon-null promo-signal fields:');
for (const [k, v] of Object.entries(signalFields)) console.log(`  ${k}: ${v}/${items.length}`);

// Find items where original is null/equal but there might be a MONO offer signal
const candidates = items.filter((it) => {
  const noStrike = it.original_price === null || it.original_price === undefined || it.original_price === it.price;
  return noStrike && (it.item_price_discount_validity_period || it.advertising_badge || it.advertising_info || (it.tags && it.tags.length));
});
console.log(`\nItems with NO strikethrough but A promo signal: ${candidates.length}`);
candidates.slice(0, 5).forEach((it) => {
  console.log(`\n  ${it.name}`);
  console.log(`    price=${it.price} original_price=${it.original_price}`);
  console.log(`    item_price_discount_validity_period: ${JSON.stringify(it.item_price_discount_validity_period)}`);
  console.log(`    advertising_badge: ${JSON.stringify(it.advertising_badge)}`);
  console.log(`    advertising_info: ${JSON.stringify(it.advertising_info)?.slice(0, 200)}`);
  console.log(`    tags: ${JSON.stringify(it.tags)}`);
});

// Save full first item for inspection
fs.writeFileSync('./library_data/barcode_probe_wolt/mono_sample.json', JSON.stringify(items.slice(0, 5), null, 2));
console.log(`\n📁 saved first 5 items full structure to mono_sample.json`);
