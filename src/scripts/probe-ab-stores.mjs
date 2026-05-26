// Probe all 6 AB Vassilopoulos Wolt stores and count items per venue.
// Whichever has the most items is the one to use as canonical.

import fs from 'fs';

const HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://wolt.com',
  'Referer': 'https://wolt.com/',
};

// Names visible in screenshot — slugify each into multiple plausible patterns
const STORES = [
  'agias-sofias',
  'mpotsari',
  'toumpa',
  'pylaia',
  'evosmos',
  'polixni-mauromix',
  'polixni',
  'polixni-mauromixali',
];

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, json: await res.json() };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function countCatalog(slug) {
  const a = await getJson(`https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${slug}/assortment`);
  if (!a.ok) return { slug, ok: false, status: a.status };

  const cats = [];
  function walk(node) { cats.push(node.slug); (node.subcategories || []).forEach(walk); }
  (a.json.categories || []).forEach(walk);

  let total = 0, withGtin = 0;
  let sampleItem = null;
  for (const c of cats) {
    if (!c) continue;
    const r = await getJson(`https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/${slug}/assortment/categories/slug/${encodeURIComponent(c)}`);
    if (!r.ok) continue;
    const items = r.json.items || [];
    total += items.length;
    for (const it of items) {
      if (it.barcode_gtin) withGtin++;
      if (!sampleItem && it.barcode_gtin) sampleItem = { name: it.name, gtin: it.barcode_gtin };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { slug, ok: true, categories: cats.length, total, withGtin, gtinPct: total ? ((withGtin/total)*100).toFixed(1) : '0', sampleItem };
}

async function run() {
  const SLUG_PATTERNS = [];
  for (const s of STORES) {
    SLUG_PATTERNS.push(`ab-vasilopoulos-${s}`);
    SLUG_PATTERNS.push(`ab-vassilopoulos-${s}`);
  }
  console.log(`Probing ${SLUG_PATTERNS.length} slug candidates...\n`);

  const results = [];
  for (const slug of SLUG_PATTERNS) {
    process.stdout.write(`  ${slug.padEnd(45)} ... `);
    const r = await countCatalog(slug);
    if (!r.ok) { console.log(`❌ HTTP ${r.status}`); continue; }
    results.push(r);
    console.log(`✅ ${r.total} items (${r.withGtin} with GTIN, ${r.gtinPct}%)`);
  }

  console.log('\n────────────────────────────────────────');
  console.log('📊 Summary (sorted by item count):\n');
  results.sort((a, b) => b.total - a.total);
  for (const r of results) {
    console.log(`  ${String(r.total).padStart(5)} items · ${String(r.withGtin).padStart(5)} GTIN (${r.gtinPct}%) · ${r.categories} cats — ${r.slug}`);
    if (r.sampleItem) console.log(`         sample: ${r.sampleItem.name} | gtin=${r.sampleItem.gtin}`);
  }

  if (results.length) {
    const winner = results[0];
    console.log(`\n🏆 BIGGEST AB STORE: ${winner.slug}`);
    console.log(`   URL: https://wolt.com/el/grc/thessaloniki/venue/${winner.slug}`);
  } else {
    console.log('\n⚠️  no slug matched. Need to check pattern.');
  }

  fs.writeFileSync('./library_data/barcode_probe_wolt/ab_stores_compared.json', JSON.stringify(results, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
