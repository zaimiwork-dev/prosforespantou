// Walk all 23 categories from the assortment endpoint, fetch items per category,
// and report total items / GTIN coverage. This is the recipe for full catalog ingestion.

import fs from 'fs';

const VENUE = 'masoutis-makedonias';
const HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://wolt.com',
  'Referer': 'https://wolt.com/',
};

const GREEK_GTIN = /^1?52[01]\d{10,11}$/;

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, status: res.status, json: await res.json() };
}

async function run() {
  console.log(`🌐 Getting assortment category list for venue "${VENUE}"`);
  const a = await getJson(`https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${VENUE}/assortment`);
  if (!a.ok) { console.log(`   ❌ HTTP ${a.status}`); return; }
  const cats = a.json.categories || [];
  // Flatten subcategories too
  const allCats = [];
  function walk(node) { allCats.push({ slug: node.slug, name: node.name }); (node.subcategories || []).forEach(walk); }
  cats.forEach(walk);
  console.log(`   ${allCats.length} categories+subcategories`);

  let grandTotal = 0, grandWithGtin = 0, grandGreekGtin = 0;
  const allItems = [];
  for (const c of allCats) {
    if (!c.slug) continue;
    const url = `https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${VENUE}/assortment/categories/slug/${encodeURIComponent(c.slug)}`;
    const r = await getJson(url);
    if (!r.ok) { console.log(`   ❌ ${r.status} category "${c.slug}"`); continue; }
    const items = r.json.items || [];
    let withGtin = 0, greekGtin = 0;
    for (const it of items) {
      if (it.barcode_gtin) {
        withGtin++;
        if (GREEK_GTIN.test(String(it.barcode_gtin))) greekGtin++;
      }
      allItems.push({ id: it.id, name: it.name, gtin: it.barcode_gtin, price: it.price, image: it.images?.[0]?.url, category: c.name });
    }
    grandTotal += items.length;
    grandWithGtin += withGtin;
    grandGreekGtin += greekGtin;
    console.log(`   ${String(items.length).padStart(4)} items · ${withGtin} GTIN · ${greekGtin} Greek-prefix — "${c.name}" [${c.slug}]`);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n📊 TOTAL: ${grandTotal} items across ${allCats.length} categories`);
  console.log(`   with barcode_gtin: ${grandWithGtin} (${((grandWithGtin/grandTotal)*100).toFixed(1)}%)`);
  console.log(`   with Greek-prefix GTIN: ${grandGreekGtin} (${((grandGreekGtin/grandTotal)*100).toFixed(1)}%)`);

  // Deduplicate items by id (an item may appear in multiple categories)
  const dedup = new Map();
  for (const it of allItems) dedup.set(it.id, it);
  console.log(`   unique items (by id): ${dedup.size}`);

  fs.writeFileSync('./library_data/barcode_probe_wolt/full_catalog_sample.json', JSON.stringify([...dedup.values()], null, 2));
  console.log(`\n📁 Saved ${dedup.size} unique items to full_catalog_sample.json`);
}

run().catch((e) => { console.error(e); process.exit(1); });
