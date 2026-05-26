// Deep probe for any GTIN/EAN-shaped field on masoutis.gr.
// Four passes:
//   1) Fetch the full GetPromoItemWith... JSON and walk EVERY key looking for barcode-like fields.
//   2) Grep all already-saved Masoutis HTML files in library_data/ for ean/gtin/barcode strings.
//   3) Parse JSON-LD scripts from the offers page HTML.
//   4) Try common product-detail URL patterns using a known Itemcode.

import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const OUT_DIR = './library_data/barcode_probe_masoutis_deep';
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

function walkFields(obj, hits, path = '') {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) { obj.forEach((v, i) => walkFields(v, hits, `${path}[${i}]`)); return; }
  if (typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (/ean|gtin|barcode|bcode/i.test(k)) {
      hits.push({ path: path ? `${path}.${k}` : k, key: k, value: v });
    }
    walkFields(v, hits, path ? `${path}.${k}` : k);
  }
}

function findStringMatches(text, re) {
  if (!text) return [];
  return [...new Set([...String(text).matchAll(re)].map((m) => m[0]))];
}

// ---- Pass 1: Full JSON walk of GetPromoItemWith... ----
async function pass1FullPromoJson() {
  console.log('\n━━ Pass 1: full GetPromoItemWith... JSON walk ━━');
  // From the earlier probe this endpoint was called with no body — just the categories filter.
  const url = 'https://www.masoutis.gr/api/eshop/GetPromoItemWithListCouponsSubCategoriesAutoPromosv2';
  // Try GET first; if that fails, POST with empty body
  let json = null;
  for (const method of ['GET', 'POST']) {
    try {
      const res = await fetch(url, {
        method,
        headers: { ...HEADERS, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        body: method === 'POST' ? '{}' : undefined,
      });
      const text = await res.text();
      console.log(`  ${method} → HTTP ${res.status} (${text.length} bytes)`);
      if (res.ok) {
        try { json = JSON.parse(text); break; } catch { console.log(`    not JSON: ${text.slice(0, 200)}`); }
      } else {
        console.log(`    body: ${text.slice(0, 200)}`);
      }
    } catch (e) { console.log(`    ${method} error: ${e.message}`); }
  }
  if (!json) { console.log('  ⚠️  could not fetch endpoint directly (likely needs cookies/CSRF) — skipping'); return; }
  fs.writeFileSync(path.join(OUT_DIR, 'promo_full.json'), JSON.stringify(json, null, 2));
  const items = Array.isArray(json) ? json : (json.items || json.products || []);
  console.log(`  total items in response: ${items.length}`);
  if (items.length) {
    console.log(`  fields on first item: ${Object.keys(items[0]).join(', ')}`);
  }
  const eanHits = [];
  walkFields(json, eanHits);
  console.log(`  🔎 EAN/GTIN/Barcode-NAMED fields: ${eanHits.length}`);
  eanHits.slice(0, 10).forEach((h) => console.log(`    ${h.path} = ${JSON.stringify(h.value).slice(0, 80)}`));
  // Also check raw 13-digit hits anywhere in the JSON text
  const text = JSON.stringify(json);
  const greekEans = findStringMatches(text, GREEK_EAN);
  const allEan13 = findStringMatches(text, EAN13);
  console.log(`  Greek-prefix EAN-13 strings anywhere in JSON: ${greekEans.length}`);
  console.log(`  All 13-digit strings anywhere in JSON: ${allEan13.length}`);
  if (greekEans.length) console.log(`    samples: ${greekEans.slice(0, 5).join(', ')}`);
}

// ---- Pass 2: Grep saved Masoutis HTML files ----
function pass2GrepSavedHtml() {
  console.log('\n━━ Pass 2: grep already-saved Masoutis HTML files ━━');
  const dir = './library_data';
  const files = fs.readdirSync(dir).filter((f) => /^masoutis_.*\.html$/i.test(f));
  console.log(`  found ${files.length} files`);
  const labelRe = /(?:Παγκόσμιος\s*Αριθμός|Αναγνώρισης\s*Εμπορίου|gtin|ean|barcode|EAN|GTIN)/gi;
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const labels = findStringMatches(html, labelRe);
    const greekEans = findStringMatches(html, GREEK_EAN);
    if (labels.length || greekEans.length) {
      console.log(`  📄 ${f}`);
      if (labels.length) console.log(`     labels: ${labels.slice(0, 6).join(', ')}`);
      if (greekEans.length) console.log(`     Greek EANs: ${greekEans.length} unique — samples ${greekEans.slice(0, 5).join(', ')}`);
    }
  }
}

// ---- Pass 3: JSON-LD scripts ----
async function pass3JsonLd() {
  console.log('\n━━ Pass 3: JSON-LD structured data on offers page ━━');
  const url = 'https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=1&subdescr=prosfores-ebdomadas';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) { console.log(`  HTTP ${res.status}`); return; }
  const html = await res.text();
  fs.writeFileSync(path.join(OUT_DIR, 'offers_page.html'), html);
  const $ = cheerio.load(html);
  const ldScripts = $('script[type="application/ld+json"]');
  console.log(`  JSON-LD blocks: ${ldScripts.length}`);
  ldScripts.each((i, el) => {
    const txt = $(el).text().trim();
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch {}
    console.log(`  block #${i + 1} (${txt.length} chars): ${parsed ? Object.keys(parsed).join(', ') : 'invalid JSON'}`);
    if (parsed) {
      const eanHits = [];
      walkFields(parsed, eanHits);
      if (eanHits.length) {
        console.log(`    🎯 EAN-named fields in this block:`);
        eanHits.forEach((h) => console.log(`      ${h.path} = ${JSON.stringify(h.value).slice(0, 80)}`));
      }
    }
  });
  // Also check for any GTIN-shaped numbers anywhere in the HTML
  const greekEans = findStringMatches(html, GREEK_EAN);
  console.log(`  Greek EANs anywhere in offers HTML: ${greekEans.length}`);
  if (greekEans.length) console.log(`    samples: ${greekEans.slice(0, 5).join(', ')}`);
}

// ---- Pass 4: Try product-detail URL patterns ----
async function pass4ProductDetail() {
  console.log('\n━━ Pass 4: product-detail endpoint patterns ━━');
  const knownItemcode = '2160844'; // from first probe
  const candidates = [
    `https://www.masoutis.gr/api/eshop/GetItemDetail/${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetItemDetail?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetItem/${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetProduct/${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetProductDetail?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetItemInfo?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/api/eshop/GetPromoItem?itemcode=${knownItemcode}`,
    `https://www.masoutis.gr/categories/product/${knownItemcode}`,
    `https://www.masoutis.gr/product/${knownItemcode}`,
    `https://www.masoutis.gr/item/${knownItemcode}`,
  ];
  for (const c of candidates) {
    try {
      const res = await fetch(c, { headers: HEADERS });
      const text = await res.text();
      const ct = res.headers.get('content-type') || '';
      const eanHits = findStringMatches(text, GREEK_EAN);
      const tag = res.ok ? '✅' : '❌';
      console.log(`  ${tag} ${res.status}  ${ct.slice(0, 30).padEnd(30)}  ${c.replace('https://www.masoutis.gr', '')}`);
      if (res.ok && eanHits.length) {
        console.log(`     🎯 ${eanHits.length} Greek EAN-13 hits — samples ${eanHits.slice(0, 5).join(', ')}`);
        const safe = c.replace(/[^a-z0-9]+/gi, '_').slice(-80) + '.txt';
        fs.writeFileSync(path.join(OUT_DIR, safe), text);
      }
    } catch (e) {
      console.log(`  ❌ ERR  ${c.replace('https://www.masoutis.gr', '')} — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function run() {
  await pass1FullPromoJson();
  pass2GrepSavedHtml();
  await pass3JsonLd();
  await pass4ProductDetail();
  console.log(`\n📁 Outputs in ${OUT_DIR}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
