// Deep probe of Kritikos. Goal: identify the Next.js build ID, find all category
// data URLs, pull one in full, identify the EAN field name + per-item structure,
// and estimate total catalog size + EAN coverage.

import fs from 'fs';

const OUT_DIR = './library_data/barcode_probe_kritikos';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function getText(url) {
  const r = await fetch(url, { headers: HEADERS });
  return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : '' };
}

console.log('━━ Step 1: get the Next.js build ID from homepage HTML ━━');
const html = (await getText('https://www.kritikos-sm.gr/')).text;
fs.writeFileSync(`${OUT_DIR}/homepage.html`, html);

const buildIdMatch = html.match(/"buildId"\s*:\s*"([^"]+)"/);
const buildId = buildIdMatch ? buildIdMatch[1] : null;
console.log(`  buildId = ${buildId}`);

if (!buildId) { console.log('  (could not find buildId — abort)'); process.exit(1); }

console.log('\n━━ Step 2: find all categories on the homepage ━━');
const categoryLinks = [...new Set(
  [...html.matchAll(/\/categories\/([a-z0-9-]+)/gi)].map((m) => m[1])
)];
console.log(`  ${categoryLinks.length} category slugs discovered:`);
categoryLinks.slice(0, 25).forEach((c) => console.log(`    /${c}`));

console.log('\n━━ Step 3: fetch one category JSON in full, inspect structure ━━');
const sampleCat = categoryLinks.find((c) => /turokomika|allantika|fresko-kreas|manabikh|zacharoplastiki/.test(c)) || categoryLinks[0];
console.log(`  picking: ${sampleCat}`);
const catUrl = `https://www.kritikos-sm.gr/_next/data/${buildId}/categories/${sampleCat}.json`;
const catRes = await getText(catUrl);
console.log(`  HTTP ${catRes.status}, size: ${catRes.text.length} bytes`);
if (!catRes.ok) { console.log('  abort'); process.exit(1); }

const catJson = JSON.parse(catRes.text);
fs.writeFileSync(`${OUT_DIR}/sample_category_${sampleCat}.json`, JSON.stringify(catJson, null, 2));

// Walk the JSON to find product arrays and any EAN-shaped fields
function findProducts(obj, path = '') {
  const out = [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      // Heuristic: looks like a product list if any item has name+price-ish fields
      const sample = obj[0];
      const keys = Object.keys(sample);
      if (keys.length > 5 && (keys.some((k) => /name|title|product/i.test(k)) || keys.some((k) => /price|cost|amount/i.test(k)))) {
        out.push({ path, count: obj.length, sample, keys });
      }
    }
    obj.forEach((v, i) => out.push(...findProducts(v, `${path}[${i}]`)));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...findProducts(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

const productArrays = findProducts(catJson);
console.log(`\n  Product-shaped arrays found: ${productArrays.length}`);
const ranked = productArrays.sort((a, b) => b.count - a.count).slice(0, 3);
ranked.forEach((pa, i) => {
  console.log(`\n  Array #${i + 1}: ${pa.count} items at JSON path "${pa.path}"`);
  console.log(`    keys on item: ${pa.keys.join(', ')}`);
  console.log(`    sample item:`);
  console.log(JSON.stringify(pa.sample, null, 2).slice(0, 1200).split('\n').map((l) => '      ' + l).join('\n'));
});

// Look for EAN-shaped fields
const bestArray = ranked[0];
if (bestArray) {
  const items = bestArray.sample ? [bestArray.sample] : [];
  // Get the actual array from the JSON to walk all items
  const fullArray = bestArray.path.split('.').reduce((acc, key) => {
    const m = key.match(/^(.+)\[(\d+)\]$/);
    if (m) return acc?.[m[1]]?.[parseInt(m[2])];
    return acc?.[key];
  }, catJson);

  if (Array.isArray(fullArray) && fullArray.length) {
    let total = fullArray.length, withGreekEan = 0, eanFields = {};
    for (const item of fullArray) {
      const str = JSON.stringify(item);
      const m = str.match(/52[01]\d{10}/);
      if (m) withGreekEan++;
      for (const [k, v] of Object.entries(item)) {
        if (typeof v === 'string' && /^52[01]\d{10}$/.test(v)) eanFields[k] = (eanFields[k] || 0) + 1;
        if (typeof v === 'number' && /^52[01]\d{10}$/.test(String(v))) eanFields[k] = (eanFields[k] || 0) + 1;
      }
    }
    console.log(`\n  Greek-EAN coverage in this category: ${withGreekEan}/${total} (${((withGreekEan/total)*100).toFixed(1)}%)`);
    console.log(`  Fields that look like Greek EANs:`);
    for (const [k, v] of Object.entries(eanFields)) console.log(`    "${k}" → ${v}/${total}`);
  }
}
