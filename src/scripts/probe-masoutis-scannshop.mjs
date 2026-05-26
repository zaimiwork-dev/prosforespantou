// Deeper search for EAN/GTIN on masoutis.gr.
// Strategies:
//   (1) Re-fetch all known /api/eshop/* endpoints we observed; walk full JSON for any GTIN-shaped value.
//   (2) Probe the Scan-N-Shop endpoint family (their barcode-scanner feature must use EANs).
//   (3) Probe likely search/lookup endpoints with a known Itemcode and a known Greek EAN.
//   (4) Pull the Angular main.js bundle and grep it for /api/eshop/ paths we haven't tried.

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

const EAN13 = /(?<!\d)\d{13}(?!\d)/g;
const GREEK_EAN = /(?<!\d)52[01]\d{10}(?!\d)/g;

function findEanFields(obj, hits = [], path = '') {
  if (obj === null || obj === undefined) return hits;
  if (Array.isArray(obj)) { obj.forEach((v, i) => findEanFields(v, hits, `${path}[${i}]`)); return hits; }
  if (typeof obj !== 'object') return hits;
  for (const [k, v] of Object.entries(obj)) {
    if (/ean|gtin|barcode|bcode|^code$/i.test(k)) hits.push({ path: path ? `${path}.${k}` : k, key: k, value: v });
    findEanFields(v, hits, path ? `${path}.${k}` : k);
  }
  return hits;
}

async function tryEndpoint(url, opts = {}) {
  try {
    const res = await fetch(url, { headers: HEADERS, ...opts });
    const text = await res.text();
    const ct = res.headers.get('content-type') || '';
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const eanFields = json ? findEanFields(json) : [];
    const greekEans = [...new Set([...text.matchAll(GREEK_EAN)].map((m) => m[0]))];
    const allEan13 = [...new Set([...text.matchAll(EAN13)].map((m) => m[0]))];
    return { url, status: res.status, ct, size: text.length, json, eanFields, greekEans, allEan13, text };
  } catch (e) { return { url, error: e.message }; }
}

function reportEndpoint(r, fullDumpDir) {
  if (r.error) { console.log(`  ❌ ERR ${r.url} — ${r.error}`); return; }
  const tag = r.status === 200 ? '✅' : r.status >= 400 ? '❌' : '⚠️ ';
  const ctShort = (r.ct || '').slice(0, 25).padEnd(25);
  console.log(`  ${tag} ${r.status} ${ctShort} ${r.size}b  ${r.url.replace('https://www.masoutis.gr', '')}`);
  if (r.eanFields?.length) {
    console.log(`     🎯 ${r.eanFields.length} EAN/GTIN/Barcode-named fields:`);
    r.eanFields.slice(0, 8).forEach((h) => console.log(`       ${h.path} = ${JSON.stringify(h.value).slice(0, 80)}`));
  }
  if (r.greekEans?.length) {
    console.log(`     🇬🇷 ${r.greekEans.length} Greek-prefix EANs in body — samples: ${r.greekEans.slice(0, 5).join(', ')}`);
  } else if (r.allEan13?.length && r.allEan13.length < 30) {
    console.log(`     13-digit hits (no Greek prefix): ${r.allEan13.slice(0, 5).join(', ')}`);
  }
  if (r.eanFields?.length || r.greekEans?.length) {
    const safe = r.url.replace(/[^a-z0-9]+/gi, '_').slice(-80) + '.json';
    fs.writeFileSync(path.join(fullDumpDir, safe), r.text || JSON.stringify(r.json));
  }
}

// ---- (1) re-fetch known endpoints, this time walking the full JSON ----
async function pass1KnownEndpoints() {
  console.log('\n━━ Pass 1: re-fetch all observed /api/eshop/* endpoints, walk full JSON ━━');
  const endpoints = [
    'https://www.masoutis.gr/api/eshop/GetCred',
    'https://www.masoutis.gr/api/eshop/GetScanNShopMenuAllLevelsAutoScheduler',
    'https://www.masoutis.gr/api/eshop/GetPromoSubLevelsNBrandsNew',
  ];
  for (const url of endpoints) {
    const r = await tryEndpoint(url);
    reportEndpoint(r, OUT_DIR);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ---- (2) probe Scan-N-Shop endpoint family ----
async function pass2ScanNShop() {
  console.log('\n━━ Pass 2: Scan-N-Shop endpoint family ━━');
  const knownItemcode = '2160844';
  const knownGreekEan = '5201054002094'; // ΦΑΓΕ Total — verified Greek EAN earlier
  const candidates = [
    // Common Scan-N-Shop API shapes
    `https://www.masoutis.gr/api/eshop/GetScanNShopItem?barcode=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetScanNShopItem?ean=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetScanNShopItem?Barcode=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetScanNShopItem/${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetItemByBarcode/${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetItemByEan/${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetItemByEAN?ean=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/SearchByBarcode?barcode=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/ScanProduct?barcode=${knownGreekEan}`,
    `https://www.masoutis.gr/api/eshop/GetItemDataByBarcode?barcode=${knownGreekEan}`,
    // Itemcode lookups
    `https://www.masoutis.gr/api/eshop/GetItem?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetItemFull?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetItemDetails?itemcode=${knownItemcode}`,
    // Search endpoints
    `https://www.masoutis.gr/api/eshop/Search?q=${encodeURIComponent('ΦΑΓΕ')}`,
    `https://www.masoutis.gr/api/eshop/SearchItems?q=${encodeURIComponent('ΦΑΓΕ')}`,
    `https://www.masoutis.gr/api/eshop/SearchProducts?q=${encodeURIComponent('ΦΑΓΕ')}`,
    `https://www.masoutis.gr/api/eshop/GlobalSearch?q=${encodeURIComponent('ΦΑΓΕ')}`,
  ];
  for (const url of candidates) {
    const r = await tryEndpoint(url);
    reportEndpoint(r, OUT_DIR);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ---- (3) JS bundle grep for unknown /api/eshop/ paths ----
async function pass3JsBundle() {
  console.log('\n━━ Pass 3: Angular JS bundle — grep for /api/eshop/ paths ━━');
  // Get the offers HTML and find the main.*.js script tag
  const r = await tryEndpoint('https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=1&subdescr=prosfores-ebdomadas');
  if (!r.text) { console.log('  no HTML retrieved'); return; }
  const html = r.text;
  // Find Angular bundle script tags
  const scriptMatches = [...html.matchAll(/<script[^>]+src="([^"]*\.js[^"]*)"/gi)].map((m) => m[1]);
  console.log(`  found ${scriptMatches.length} <script src> tags`);
  // Focus on main/runtime/polyfills/chunk bundles
  const interesting = scriptMatches.filter((s) => /\.(?:main|chunk|runtime|polyfills|scripts|app)/i.test(s));
  console.log(`  fetching ${interesting.length} JS bundles...`);

  const apiPaths = new Set();
  const eanLabels = new Set();
  for (const src of interesting) {
    const fullUrl = src.startsWith('http') ? src : src.startsWith('/') ? `https://www.masoutis.gr${src}` : `https://www.masoutis.gr/${src}`;
    const jr = await tryEndpoint(fullUrl);
    if (!jr.text) continue;
    const text = jr.text;
    [...text.matchAll(/\/api\/eshop\/[A-Za-z0-9_-]+/g)].forEach((m) => apiPaths.add(m[0]));
    [...text.matchAll(/['"](?:barcode|ean|gtin|bcode|productBarcode|itemBarcode|eanCode|barCode|Barcode|EAN|GTIN)['"]/gi)].forEach((m) => eanLabels.add(m[0]));
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\n  🔎 ${apiPaths.size} unique /api/eshop/ paths discovered in JS:`);
  [...apiPaths].sort().forEach((p) => console.log(`     ${p}`));
  console.log(`\n  🔎 ${eanLabels.size} EAN-related string literals seen in JS code:`);
  [...eanLabels].sort().slice(0, 30).forEach((l) => console.log(`     ${l}`));

  // Probe the newly discovered API paths
  console.log(`\n  Probing newly-discovered /api/eshop/ paths:`);
  for (const p of apiPaths) {
    const url = `https://www.masoutis.gr${p}`;
    const r = await tryEndpoint(url);
    reportEndpoint(r, OUT_DIR);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function run() {
  await pass1KnownEndpoints();
  await pass2ScanNShop();
  await pass3JsBundle();
  console.log(`\n📁 Outputs in ${OUT_DIR}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
