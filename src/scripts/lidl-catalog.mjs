// Lidl Hellas catalog scraper.
//
// I was wrong that Lidl is flyer-only: lidl-hellas.gr has a real e-shop at
// /c/{slug}/s{id}?offset=N, with products embedded as an INDEX-DEHYDRATED JSON
// blob (a flat array; field values are indices into it). The category GRID pages
// carry the (national) price + image; we walk every category from the sitemap,
// decode, and feed the shared catalog engine. SKU-keyed by productId (the grid
// exposes `ians`, not a GTIN). price.price is the shelf price (skip the baseline
// when oldPrice>0 = a promo).
//
// Coverage note: the grid surfaces the online-discoverable assortment (~hundreds).
// Product DETAIL pages list more (~426) and carry real GTINs, but omit price
// (store-dependent, loaded by a separate client call) — so full priced coverage
// would need Lidl's per-store price API. Flyer offers (adapters/lidl.mjs) still
// provide Lidl's actual deal prices on top of this catalog.
//
// Serves this machine AND CI runners → locally testable + autonomous.
//
// Usage: node src/scripts/lidl-catalog.mjs   [DRY_RUN=1 | LIMIT=N | LIDL_CATS=a/sX,b/sY]
//
// dotenv first (ESM hoist trap — DB import comes later via ingest-catalog).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { gunzipSync } from 'node:zlib';
import { ingestCatalog } from './lib/ingest-catalog.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PAGE = 24;
const MAX_OFFSET = parseInt(process.env.MAX_OFFSET || '3000', 10);
const CATS_ENV = (process.env.LIDL_CATS || '').split(',').map((s) => s.trim()).filter(Boolean);
const PAGES_SITEMAP = 'https://www.lidl-hellas.gr/explore/assets/s/pages_el-GR_gr.xml.gz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function discoverCategories() {
  try {
    const res = await fetch(PAGES_SITEMAP, { headers: { 'User-Agent': UA } });
    const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
    const paths = [...new Set([...xml.matchAll(/\/c\/([a-z0-9-]+\/s\d+)/g)].map((m) => m[1]))];
    return paths.length ? paths : ['fagito-poto/s10068374'];
  } catch (e) {
    console.log(`   sitemap discovery failed (${e.message}); fallback`);
    return ['fagito-poto/s10068374'];
  }
}

async function fetchPage(path, offset) {
  const res = await fetch(`https://www.lidl-hellas.gr/c/${path}?offset=${offset}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'el-GR,el;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Decode the index-dehydrated blob → resolved product list. Field values are
// integer indices into the flat root array; a resolved primitive is a literal.
function extractProducts(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const root = blocks.find(Array.isArray) || blocks[0];
  const isFlat = Array.isArray(root);
  const R = (v, d = 0) => {
    if (!isFlat || d > 12) return v;
    if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v < root.length) {
        const r = root[v];
        return (r && typeof r === 'object') ? R(r, d + 1) : r;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => R(x, d + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, R(x, d + 1)]));
    return v;
  };
  let products = null;
  const looks = (o) => o && typeof o === 'object' && (o.canonicalPath != null || o.fullTitle != null) && o.price != null;
  const walk = (o) => {
    if (Array.isArray(o)) { const ps = o.filter(looks); if (ps.length && (!products || ps.length > products.length)) products = ps; o.forEach(walk); }
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(root);
  if (!products) return [];
  return products.map((raw) => {
    const p = R(raw);
    const price = p.price || {};
    const cpath = typeof p.canonicalPath === 'string' ? p.canonicalPath : '';
    const id = p.productId ?? p.erpNumber ?? cpath.match(/\/p(\d+)\b/)?.[1];
    const name = p.fullTitle || p.title || p.keyfacts?.fullTitle;
    if (!id || !name || !(price.price > 0)) return null;
    return {
      chainItemcode: String(id),
      name: String(name).trim(),
      price: price.price,
      imageUrl: typeof p.image === 'string' ? p.image : null,
      unitInfo: (price.packaging?.text || '').trim() || null,
      barcode: null,
      baseline: !(price.oldPrice > 0),
    };
  }).filter(Boolean);
}

async function run() {
  console.log(`🛒 Lidl catalog scraper${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  const CATS = CATS_ENV.length ? CATS_ENV : await discoverCategories();
  console.log(`   ${CATS.length} categories to walk (empties auto-skipped)`);
  const byId = new Map();
  for (const path of CATS) {
    let empty = 0;
    for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE) {
      let html;
      try { html = await fetchPage(path, offset); }
      catch (e) { console.log(`\n   ${path} @${offset} — ${e.message}, stopping category`); break; }
      const prods = extractProducts(html);
      if (prods.length === 0) { if (++empty >= 2) break; else continue; }
      empty = 0;
      let added = 0;
      for (const p of prods) if (!byId.has(p.chainItemcode)) { byId.set(p.chainItemcode, p); added++; }
      if (byId.size >= LIMIT) break;
      if (added === 0 && offset > 0) break; // same page repeating → end
      await new Promise((r) => setTimeout(r, 200));
    }
    if (byId.size >= LIMIT) break;
  }

  let items = [...byId.values()];
  if (items.length > LIMIT) items = items.slice(0, LIMIT);
  console.log(`   ${items.length} catalog products ready`);

  const report = await ingestCatalog({ chain: 'lidl', items, dryRun: DRY_RUN });
  console.log(`\n✅ Lidl catalog — created=${report.created} existing=${report.existing} mapped=${report.mapped} snapshots=${report.snapshots} err=${report.errors} (of ${report.total})`);
  process.exit(0);
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
