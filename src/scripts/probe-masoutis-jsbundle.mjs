// Pull the offers page, find ALL .js scripts referenced, fetch each one,
// then grep them for /api/eshop/ paths and EAN-related string literals.
// Once we have a real list of API paths, probe each.

import fs from 'fs';
import path from 'path';

const OUT_DIR = './library_data/barcode_probe_masoutis_deep2';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://www.masoutis.gr',
  'Referer': 'https://www.masoutis.gr/',
};

const GREEK_EAN = /(?<!\d)52[01]\d{10}(?!\d)/g;

async function get(url, opts = {}) {
  const res = await fetch(url, { headers: HEADERS, ...opts });
  return { status: res.status, ct: res.headers.get('content-type') || '', text: await res.text() };
}

function findEanFields(obj, hits = [], path = '') {
  if (obj === null || obj === undefined) return hits;
  if (Array.isArray(obj)) { obj.forEach((v, i) => findEanFields(v, hits, `${path}[${i}]`)); return hits; }
  if (typeof obj !== 'object') return hits;
  for (const [k, v] of Object.entries(obj)) {
    if (/ean|gtin|barcode|bcode/i.test(k)) hits.push({ path: path ? `${path}.${k}` : k, key: k, value: v });
    findEanFields(v, hits, path ? `${path}.${k}` : k);
  }
  return hits;
}

async function run() {
  console.log('━━ Step 1: fetch index, find every .js URL ━━');
  const html = (await get('https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=1&subdescr=prosfores-ebdomadas')).text;
  fs.writeFileSync(path.join(OUT_DIR, 'offers_index.html'), html);
  const jsUrls = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) jsUrls.add(m[1]);
  console.log(`  ${jsUrls.size} .js URLs referenced in HTML`);

  const apiPaths = new Set();
  const eanLabels = new Set();
  const eanFieldLiterals = new Set();

  for (const src of jsUrls) {
    const full = src.startsWith('http') ? src : src.startsWith('/') ? `https://www.masoutis.gr${src}` : `https://www.masoutis.gr/${src}`;
    console.log(`  fetching ${full.replace('https://www.masoutis.gr', '')}`);
    try {
      const r = await get(full);
      if (r.status !== 200) { console.log(`    HTTP ${r.status}`); continue; }
      const txt = r.text;
      [...txt.matchAll(/\/api\/eshop\/[A-Za-z0-9_-]+/g)].forEach((m) => apiPaths.add(m[0]));
      // Strict word matches only — avoid false positives like "lean", "mean"
      [...txt.matchAll(/['"`](barcode|Barcode|BARCODE|ean|EAN|gtin|GTIN|bcode|BCode|productBarcode|itemBarcode|eanCode|barCode|Παγκόσμιος)['"`]/g)]
        .forEach((m) => eanFieldLiterals.add(m[1]));
      [...txt.matchAll(/[a-zA-Z_]*(?:barcode|gtin|ean|bcode)[a-zA-Z_]*/gi)].forEach((m) => {
        const w = m[0];
        if (w.length >= 4 && w.length <= 30 && !/lean|mean|jean|clean|wean|been|seen|bean/i.test(w)) eanLabels.add(w);
      });
    } catch (e) { console.log(`    ERR ${e.message}`); }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n━━ Step 2: discovered ${apiPaths.size} unique /api/eshop/ paths ━━`);
  [...apiPaths].sort().forEach((p) => console.log(`  ${p}`));

  console.log(`\n━━ Step 3: ${eanFieldLiterals.size} EXACT EAN-related string-literal field names ━━`);
  [...eanFieldLiterals].sort().forEach((l) => console.log(`  "${l}"`));

  console.log(`\n━━ Step 4: ${eanLabels.size} EAN-related identifiers (variables, types, functions) ━━`);
  [...eanLabels].sort().slice(0, 60).forEach((l) => console.log(`  ${l}`));

  fs.writeFileSync(path.join(OUT_DIR, 'discovered_api_paths.json'), JSON.stringify([...apiPaths].sort(), null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'discovered_ean_labels.json'), JSON.stringify([...eanLabels].sort(), null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'discovered_ean_literals.json'), JSON.stringify([...eanFieldLiterals].sort(), null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
