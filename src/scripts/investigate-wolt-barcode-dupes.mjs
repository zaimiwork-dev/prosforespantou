// Re-fetch Masoutis assortment and analyze: for each barcode_gtin value that
// appears on multiple wolt item ids, dump the item names so we can tell whether
// they're true duplicates of the same product or different products sharing a code.

import fs from 'fs';

const VENUE = 'masoutis-makedonias';
const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://wolt.com',
  Referer: 'https://wolt.com/',
};
const BASE = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1';

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const assortment = await getJson(`${BASE}/venues/slug/${VENUE}/assortment`);
const cats = [];
function walk(node) { if (node.slug) cats.push({ slug: node.slug, name: node.name }); (node.subcategories || []).forEach(walk); }
(assortment.categories || []).forEach(walk);
console.log(`${cats.length} categories`);

const itemsById = new Map();
let i = 0;
for (const c of cats) {
  i++;
  try {
    const d = await getJson(`${BASE}/venues/slug/${VENUE}/assortment/categories/slug/${encodeURIComponent(c.slug)}`);
    for (const it of d.items || []) {
      if (!itemsById.has(it.id)) itemsById.set(it.id, { ...it, _category: c.name });
    }
    process.stdout.write(`\r  cat ${i}/${cats.length} — ${itemsById.size} items        `);
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
console.log('');

const items = [...itemsById.values()].filter((it) => it.barcode_gtin);
console.log(`\n${items.length} items with barcode_gtin`);

// Group by barcode
const byBarcode = new Map();
for (const it of items) {
  const b = String(it.barcode_gtin);
  if (!byBarcode.has(b)) byBarcode.set(b, []);
  byBarcode.get(b).push({ id: it.id, name: it.name, category: it._category, image: it.images?.[0]?.url });
}
console.log(`${byBarcode.size} unique barcodes`);
console.log(`Avg items per barcode: ${(items.length / byBarcode.size).toFixed(2)}`);

// Distribution of items-per-barcode
const dist = {};
for (const [, arr] of byBarcode) {
  dist[arr.length] = (dist[arr.length] || 0) + 1;
}
console.log('\nDistribution (items-per-barcode → barcode count):');
Object.keys(dist).sort((a, b) => +a - +b).forEach((k) => console.log(`  ${k} items/barcode → ${dist[k]} barcodes`));

// Sample some heavy collisions
console.log('\n10 sample barcodes with most duplicates:');
const sorted = [...byBarcode.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
for (const [barcode, arr] of sorted) {
  console.log(`\n  BARCODE ${barcode}  (${arr.length} items)`);
  arr.slice(0, 8).forEach((x) => console.log(`    [${x.category}] ${x.name}`));
}

// Sample a few barcodes where the names DIFFER significantly (potential bad dupes)
console.log('\n\n10 random barcode groups (to eyeball whether collisions are real duplicates):');
const dupBarcodes = [...byBarcode.entries()].filter(([, a]) => a.length >= 2);
const sampleSet = new Set();
while (sampleSet.size < Math.min(10, dupBarcodes.length)) sampleSet.add(Math.floor(Math.random() * dupBarcodes.length));
for (const idx of sampleSet) {
  const [barcode, arr] = dupBarcodes[idx];
  console.log(`\n  BARCODE ${barcode}  (${arr.length} items)`);
  arr.forEach((x) => console.log(`    [${x.category}] ${x.name}`));
}

fs.writeFileSync('./library_data/barcode_probe_wolt/dupe_analysis.json', JSON.stringify({ totalItems: items.length, uniqueBarcodes: byBarcode.size, dist, sampleHeavy: sorted }, null, 2));
