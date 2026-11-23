// Γαλαξίας (galaxias.shop) — read the whole catalogue from the shop's public
// Magento 2 GraphQL API (magento2.galaxias.shop/graphql, the same endpoint
// their own site calls). Owner 2026-11-23: «we need offers from galaksias».
// One walk feeds both the offers adapter (adapters/galaxias.mjs) and the
// regular-price catalogue (galaxias-catalog.mjs). Their item code (sku) IS the
// product's barcode (EAN-13), so every item compares by barcode.
import { pace } from './polite-http.mjs';

const API = 'https://magento2.galaxias.shop/graphql';
const PAGE_SIZE = 100;
const FIELDS = [
  'sku name url_key unit_measurement cost_per_unit',
  'categories{ name level }',
  'image{ url }',
  'catalog_rules{ action_name actions{ amount } from name promoType qty is_silent stores to tags }',
  'price_range{ minimum_price{ regular_price{ value } } }',
].join(' ');

async function query(q, attempt = 1) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://galaxias.shop',
      Referer: 'https://galaxias.shop/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    body: JSON.stringify({ query: q }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return query(q, attempt + 1);
  }
  if (!res.ok) throw new Error(`Γαλαξίας API HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`Γαλαξίας API: ${j.errors[0].message}`);
  return j.data;
}

/**
 * Every product of the shop. Returns { products, pages, total, partial }.
 * partial = a page failed after retries (the caller must not treat missing
 * items as gone).
 */
export async function fetchAllProducts({ paceMs = 700, jitterMs = 400, maxPages = Infinity, log = console.log } = {}) {
  const first = await query(`{ products(filter: { price: { from: "0" } }, pageSize: ${PAGE_SIZE}, currentPage: 1) { total_count page_info { total_pages } items { ${FIELDS} } } }`);
  const total = first.products.total_count;
  const pages = Math.min(first.products.page_info.total_pages, maxPages);
  const bySku = new Map(first.products.items.map((p) => [p.sku, p]));
  let partial = false;
  for (let page = 2; page <= pages; page++) {
    await pace(paceMs, jitterMs);
    try {
      const d = await query(`{ products(filter: { price: { from: "0" } }, pageSize: ${PAGE_SIZE}, currentPage: ${page}) { items { ${FIELDS} } } }`);
      for (const p of d.products.items) bySku.set(p.sku, p);
    } catch (e) {
      partial = true;
      log(`   page ${page} failed: ${e.message}`);
    }
    if (page % 10 === 0) log(`   page ${page}/${pages} — ${bySku.size} products`);
  }
  return { products: [...bySku.values()], pages, total, partial };
}

/**
 * The walk, once a day: the first step of the job walks and writes the cache,
 * the next steps (catalog, web offers, leaflet offers) reuse it. A cache older
 * than maxAgeMs is walked again.
 */
export async function loadProducts({ cachePath, maxAgeMs = 3 * 3600_000, ...walk } = {}) {
  const fs = await import('node:fs');
  if (cachePath && fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < maxAgeMs) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log(`   Γαλαξίας: ${cached.products.length} products from the walk cache (${cachePath})`);
    return cached;
  }
  const r = await fetchAllProducts(walk);
  if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(r));
  return r;
}

// Today in Athens as 'YYYY-MM-DD' (their promo dates are Greek dates).
export function athensToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// The department-level category (level 2), as the shop names it.
export const topCategory = (p) => (p.categories ?? []).filter((c) => c.level === 2).map((c) => c.name?.trim()).find(Boolean) ?? null;
