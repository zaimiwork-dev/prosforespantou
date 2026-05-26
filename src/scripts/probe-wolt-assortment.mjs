// Fetch the Wolt assortment endpoint directly and inspect structure.
import fs from 'fs';

const URL = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/masoutis-makedonias/assortment';

const res = await fetch(URL, {
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://wolt.com',
    'Referer': 'https://wolt.com/',
  },
});

console.log(`HTTP ${res.status}`);
if (!res.ok) { console.log(await res.text()); process.exit(1); }

const data = await res.json();
fs.writeFileSync('./library_data/barcode_probe_wolt/assortment_full.json', JSON.stringify(data, null, 2));
console.log(`Saved assortment_full.json (${JSON.stringify(data).length} bytes)`);

// Top-level keys
console.log('\nTop-level keys:', Object.keys(data));

// Items
const items = data.items || [];
console.log(`\nTotal items: ${items.length}`);

// Show the structure of the first item
if (items.length) {
  console.log('\nFirst item keys:', Object.keys(items[0]));
  console.log('\nFirst item (full):');
  console.log(JSON.stringify(items[0], null, 2));
}

// Hunt for any field that looks GTIN-shaped across all items
const fieldStats = {};
for (const item of items) {
  for (const [k, v] of Object.entries(item)) {
    if (!fieldStats[k]) fieldStats[k] = { populated: 0, sampleValues: new Set() };
    if (v !== null && v !== undefined && v !== '') {
      fieldStats[k].populated++;
      if (fieldStats[k].sampleValues.size < 3) fieldStats[k].sampleValues.add(JSON.stringify(v).slice(0, 80));
    }
  }
}
console.log(`\nField population across ${items.length} items:`);
for (const [k, v] of Object.entries(fieldStats)) {
  const pct = ((v.populated / items.length) * 100).toFixed(0);
  console.log(`  ${k.padEnd(30)} ${String(v.populated).padStart(5)}/${items.length} (${pct}%)  samples: ${[...v.sampleValues].slice(0, 2).join(' | ').slice(0, 120)}`);
}

// Count items with EAN/GTIN-shaped fields
const gtinFieldCandidates = ['gtin', 'gtins', 'ean', 'eans', 'barcode', 'barcodes', 'gtin13'];
for (const cand of gtinFieldCandidates) {
  const populated = items.filter((i) => i[cand]).length;
  if (populated) console.log(`\n✅ items with non-empty "${cand}": ${populated}/${items.length}`);
}
