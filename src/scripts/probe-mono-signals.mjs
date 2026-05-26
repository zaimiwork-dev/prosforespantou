// Search Wolt's full Masoutis catalog for items where original_price is null
// but SOMETHING else flags an offer. If found, we have a ΜΟΝΟ signal.

import fs from 'fs';

const VENUE = 'masoutis-makedonias';
const BASE = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://wolt.com', Referer: 'https://wolt.com/',
};
async function getJson(url) { const r = await fetch(url, { headers: HEADERS }); return r.json(); }

const a = await getJson(`${BASE}/venues/slug/${VENUE}/assortment`);
const cats = [];
function walk(n) { if (n.slug) cats.push(n.slug); (n.subcategories || []).forEach(walk); }
(a.categories || []).forEach(walk);
console.log(`${cats.length} categories — scanning ALL items for ΜΟΝΟ signals\n`);

const itemsById = new Map();
let c = 0;
for (const slug of cats) {
  c++;
  try {
    const d = await getJson(`${BASE}/venues/slug/${VENUE}/assortment/categories/slug/${encodeURIComponent(slug)}`);
    for (const it of d.items || []) if (!itemsById.has(it.id)) itemsById.set(it.id, it);
    process.stdout.write(`\r  cat ${c}/${cats.length} — ${itemsById.size} items        `);
  } catch {}
  await new Promise((r) => setTimeout(r, 80));
}
console.log('');
const items = [...itemsById.values()];
console.log(`Total items: ${items.length}`);

const stats = {
  total: items.length,
  hasOriginalPriceStrikethrough: 0,            // original_price > price (clear strikethrough)
  hasValidityPeriodNoStrikethrough: 0,         // item_price_discount_validity_period set, no strikethrough
  hasLowestPriceNoStrikethrough: 0,            // lowest_price/v2 set, no strikethrough
  hasOfferTagNoStrikethrough: 0,               // tags contain "discount"/"offer"/etc, no strikethrough
  hasAdvertisingNoStrikethrough: 0,            // advertising_* fields set, no strikethrough
  neitherStrikethroughNorAnySignal: 0,
};

const monoSuspects = [];

for (const it of items) {
  const hasStrikethrough = it.original_price && it.original_price > it.price;
  if (hasStrikethrough) { stats.hasOriginalPriceStrikethrough++; continue; }
  const hasValidity = it.item_price_discount_validity_period;
  const hasLowest = it.lowest_price || it.lowest_price_v2;
  const tags = Array.isArray(it.tags) ? it.tags : [];
  const hasOfferTag = tags.some((t) => /discount|offer|deal|sale|prosfor/i.test(JSON.stringify(t)));
  const hasAdv = it.advertising_badge || it.advertising_info || it.advertising_metadata;
  if (hasValidity) stats.hasValidityPeriodNoStrikethrough++;
  if (hasLowest) stats.hasLowestPriceNoStrikethrough++;
  if (hasOfferTag) stats.hasOfferTagNoStrikethrough++;
  if (hasAdv) stats.hasAdvertisingNoStrikethrough++;
  if (!hasValidity && !hasLowest && !hasOfferTag && !hasAdv) {
    stats.neitherStrikethroughNorAnySignal++;
  } else {
    monoSuspects.push({
      name: it.name,
      price: it.price,
      original_price: it.original_price,
      validity: it.item_price_discount_validity_period,
      lowest: it.lowest_price || it.lowest_price_v2,
      tags: tags.map((t) => t.id || t.label || JSON.stringify(t).slice(0, 50)),
      adv_info: it.advertising_info,
      adv_badge: it.advertising_badge,
    });
  }
}

console.log('\nClassification:');
for (const [k, v] of Object.entries(stats)) {
  console.log(`  ${k.padEnd(40)} ${String(v).padStart(5)} (${((v / stats.total) * 100).toFixed(1)}%)`);
}

console.log(`\n🔍 ${monoSuspects.length} items have NO strikethrough but at least ONE other promo signal. Samples:`);
monoSuspects.slice(0, 15).forEach((s) => {
  console.log(`\n  ${s.name}`);
  console.log(`    price=${s.price} validity=${JSON.stringify(s.validity)?.slice(0, 100)}`);
  console.log(`    lowest=${JSON.stringify(s.lowest)?.slice(0, 100)}`);
  console.log(`    tags=${JSON.stringify(s.tags)}`);
  console.log(`    adv=${JSON.stringify(s.adv_info || s.adv_badge)?.slice(0, 100)}`);
});

fs.writeFileSync('./library_data/barcode_probe_wolt/mono_signals.json', JSON.stringify({ stats, monoSuspects: monoSuspects.slice(0, 50) }, null, 2));
