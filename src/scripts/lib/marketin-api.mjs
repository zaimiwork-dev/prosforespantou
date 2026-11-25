// Market In e-shop reader (owner 2026-11-23: «market in literally has an online
// shop»). www.market-in.gr is a server-rendered eshopkey shop:
//   • every department is a listing page, 48 products per page, `?pageno=N`;
//     the page's analytics call carries the department's product total
//     (`iParam2=<total>`), so a walk knows when it is complete;
//   • «ΦΥΛΛΑΔΙΟ ΠΡΟΣΦΟΡΩΝ» is the listing /el-gr/ALL/1-1 (the leaflet's offers,
//     with prices) and «WEB ONLY ΠΡΟΣΦΟΡΕΣ» is /el-gr/ALL/2-1.
// The shop shows ONE price per product. On offers the old price is commented
// out in the product page's HTML — the shop chose not to publish it, so we do
// not either: Market In offers are single-price («ΜΟΝΟ») offers. Almost every
// price on the site is drawn red, so the colour says nothing about an offer.
// Item code = the shop's own product id (data-id), stable across pages; the
// shop exposes no barcode.
import * as cheerio from 'cheerio';
import fs from 'node:fs';

export const BASE = 'https://www.market-in.gr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
export const PAGE_SIZE = 48;
const PACE_MS = Number(process.env.MARKETIN_PACE_MS || 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const LEAFLET_PATH = '/el-gr/ALL/1-1/';
export const WEB_ONLY_PATH = '/el-gr/ALL/2-1/';

// Department (first URL segment of a product link) → the shop's own department
// name; lib/native-category-maps.ts maps these names to the site's categories.
// The shop spells some slugs two ways (psugeiou/psygeiou, katepsugmena/…).
const DEPARTMENTS = [
  ['manabikh', 'Μαναβική'],
  ['kreopoleio', 'Κρεοπωλείο'],
  ['tyrokomika-allantika', 'Τυροκομικά - Αλλαντικά'],
  ['trofima', 'Τρόφιμα'],
  ['kava', 'Κάβα'],
  ['vrefika', 'Βρεφικά'],
  ['galaktokomika', 'Γαλακτοκομικά - Ψυγείου'],
  ['katepsugmena', 'Κατεψυγμένα'],
  ['katepsygmena', 'Κατεψυγμένα'],
  ['prosopikh-frontida', 'Προσωπική Φροντίδα'],
  ['prosopiki-frontida', 'Προσωπική Φροντίδα'],
  ['kathariothta', 'Καθαριότητα'],
  ['kathariotita', 'Καθαριότητα'],
  ['ola-gia-to-spiti', 'Όλα για το Σπίτι'],
  ['katoikidia', 'Κατοικίδια'],
];

export function departmentOf(url) {
  const m = String(url ?? '').match(/\/el-gr\/([^/?#]+)/);
  if (!m) return null;
  const seg = m[1];
  for (const [prefix, name] of DEPARTMENTS) if (seg === prefix || seg.startsWith(prefix + '-')) return name;
  return null;
}

// «1,99 €» → 1.99; «4,89€ / κιλό» → 4.89 (perKilo). null when unreadable.
export function parsePrice(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const m = t.match(/(\d+(?:\.\d{3})*(?:,\d+)?)\s*€/);
  if (!m) return null;
  const value = Number(m[1].replace(/\./g, '').replace(',', '.'));
  if (!(value > 0)) return null;
  return { value, perKilo: /\/\s*κιλ/i.test(t) };
}

// One listing page → { total, items }. total = the department's product count
// (null when the page does not state it).
export function parseListing(html) {
  const $ = cheerio.load(html);
  const totalMatch = html.match(/iParam2=(\d+)/);
  const total = totalMatch ? Number(totalMatch[1]) : null;
  const items = [];
  $('.product-item').each((_, el) => {
    const $el = $(el);
    const id = $el.find('.add-to-cart-btn[data-id]').attr('data-id') || $el.find('.add-to-list-btn[data-id]').attr('data-id');
    const url = $el.find('a.product-thumb').attr('href') || $el.find('a.product-ttl').attr('href');
    const name = $el.find('a.product-ttl').text().replace(/\s+/g, ' ').trim();
    const price = parsePrice($el.find('.new-price').first().text());
    if (!id || !name || !price) return;
    const img = $el.find('a.product-thumb img').attr('src');
    const unitPrice = $el.find('.kg-price-weight').text().replace(/\s+/g, ' ').trim() || null;
    items.push({
      id: String(id),
      name,
      brand: $el.find('a.product-brand').text().replace(/\s+/g, ' ').trim() || null,
      url: url ? new URL(url, BASE).href : null,
      imageUrl: img && !/no-image/i.test(img) ? new URL(img, BASE).href : null,
      price: price.value,
      perKilo: price.perKilo,
      unitPrice,
      department: departmentOf(url),
    });
  });
  return { total, items };
}

async function fetchText(path, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(new URL(path, BASE), {
        headers: { 'User-Agent': UA, 'Accept-Language': 'el-GR,el;q=0.9' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.text();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}

// Every page of one listing. complete = the walk saw the stated total (or, with
// no total stated, ended on a short page).
export async function walkListing(path) {
  const seen = new Map();
  let total = null;
  let pages = 0;
  for (let page = 1; page <= 400; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const html = await fetchText(page === 1 ? path : `${path}${sep}pageno=${page}`);
    const parsed = parseListing(html);
    pages++;
    if (page === 1) total = parsed.total;
    let added = 0;
    for (const it of parsed.items) if (!seen.has(it.id)) { seen.set(it.id, it); added++; }
    const expectedPages = total != null ? Math.ceil(total / PAGE_SIZE) : null;
    if (parsed.items.length < PAGE_SIZE || added === 0 || (expectedPages != null && page >= expectedPages)) break;
    await sleep(PACE_MS);
  }
  const items = [...seen.values()];
  const complete = total != null ? items.length >= total : true;
  return { items, total, pages, complete };
}

// Every category slug in the shop's menu (departments and their subcategories).
export async function menuSlugs() {
  const html = await fetchText('/el-gr/');
  return [...new Set([...html.matchAll(/href="https:\/\/www\.market-in\.gr\/el-gr\/([a-z0-9\-()]+)"/g)].map((m) => m[1]))]
    .filter((s) => departmentOf(`/el-gr/${s}`) != null);
}

// Top-level departments: a slug that no other slug is a prefix of.
export const topSlugs = (slugs) => slugs.filter((a) => !slugs.some((b) => b !== a && a.startsWith(b + '-')));

// Direct subcategories of a slug (no slug in between).
export function childSlugs(slugs, parent) {
  const below = slugs.filter((c) => c.startsWith(parent + '-'));
  return below.filter((c) => !below.some((m) => m !== c && c.startsWith(m + '-')));
}

export async function departmentPaths() {
  return topSlugs(await menuSlugs()).map((s) => `/el-gr/${s}`);
}

// The shop's default page order shifts between page loads, so a long listing
// shows some products twice and never shows others (kreopoleio: 110 stated,
// 106 seen). Its robots.txt disallows the sort parameter, so instead a short
// listing is filled from its subcategories, which mostly fit on one page.
async function walkFilled(slugs, slug, depth = 0) {
  const r = await walkListing(`/el-gr/${slug}`);
  const byId = new Map(r.items.map((it) => [it.id, it]));
  let complete = r.complete;
  if (!complete && depth < 4) {
    for (const child of childSlugs(slugs, slug)) {
      await sleep(PACE_MS);
      const c = await walkFilled(slugs, child, depth + 1);
      for (const it of c.items) if (!byId.has(it.id)) byId.set(it.id, it);
    }
    complete = r.total != null && byId.size >= r.total;
  }
  return { items: [...byId.values()], total: r.total, complete };
}

// The whole catalogue (every department, de-duplicated by item id).
// cachePath: reuse one walk across the catalogue and offer runs of a job.
export async function loadCatalog({ cachePath } = {}) {
  if (cachePath && fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const slugs = await menuSlugs();
  const tops = topSlugs(slugs);
  const byId = new Map();
  let stated = 0;
  let partial = false;
  for (const t of tops) {
    const r = await walkFilled(slugs, t);
    stated += r.total ?? 0;
    if (!r.complete) partial = true;
    for (const it of r.items) if (!byId.has(it.id)) byId.set(it.id, it);
    console.log(`   ${t}: ${r.items.length}/${r.total ?? '?'}${r.complete ? '' : ' — INCOMPLETE'}`);
  }
  const out = { items: [...byId.values()], departments: tops.length, stated, partial };
  if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(out));
  return out;
}

export const loadOffers = (feed) => walkListing(feed === 'web' ? WEB_ONLY_PATH : LEAFLET_PATH);

// Listings carry 200×200 thumbnails; the product page has the 800×800 photo,
// named by a different product code (/Images/Products/<code>_1.jpg), so it can
// only be read from that page. null when the page has none.
export async function largeImage(productUrl) {
  if (!productUrl) return null;
  const html = await fetchText(productUrl);
  const m = html.match(/href=['"](\/Images\/Products\/[^'"]+?_1\.(?:jpg|jpeg|png|webp))['"]/i);
  return m ? new URL(m[1], BASE).href : null;
}

export const isThumb = (url) => /\/Images\/Products\/Thumbs\//i.test(String(url ?? ''));
export { sleep, PACE_MS };
