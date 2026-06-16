// Shared lidl-hellas.gr e-shop reader.
//
// lidl-hellas.gr exposes its whole assortment (priced, with own packaging
// photos) through a product search API. Both the offers adapter
// (adapters/lidl.mjs) and the catalog scraper (lidl-catalog.mjs) read from here
// so there is ONE correct implementation of discovery + pagination.
//
// The HTML category pages (/c/<slug>/s<n>?offset=N) silently cap at ~one page
// under load — the server ignores `offset` as a soft bot-defence, which is why
// earlier scrapes undercounted badly. The JSON API below honours offset/fetchsize
// and returns the real numFound, so we page it to completion.
//
// API:  GET /q/api/search?assortment=GR&locale=el_GR&version=v2.0.0
//           &category.id=<categoryNumber>&offset=N&fetchsize=48
//       Headers: a same-site Referer/Origin + a real session cookie (see
//       ensureSession) — without them the API 401s or soft-blocks to numFound:0.
//       NOTE: the filter param is `category.id` WITH the dot; the plain
//       `categories` param is silently ignored and returns a fixed default set.
//       Response: { numFound, items: [ { gridbox: { data: <product> } } ] }.
//
// A "category number" is the trailing digits of a /c/<slug>/s<NUMBER> path in
// the pages sitemap (these double as category.id values). Content/landing pages
// return numFound:0 and are skipped. A parent department returns all its
// subcategory products too, so global dedup by productId collapses any overlap.

import { gunzipSync } from 'node:zlib';
import { fetchWithBackoff } from './polite-http.mjs';

export const ORIGIN = 'https://www.lidl-hellas.gr';
const PAGES_SITEMAP = `${ORIGIN}/explore/assets/s/pages_el-GR_gr.xml.gz`;
const SEARCH_API = `${ORIGIN}/q/api/search`;
export const FETCH_SIZE = 48;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LANDING = `${ORIGIN}/c/fagito-poto/s10068374`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => sleep(ms + Math.floor(Math.random() * Math.max(1, ms * 0.4)));

// ── Browser-like session ─────────────────────────────────────────────────────
// A real visitor loads a category PAGE (picking up cookies) before the "load
// more" button calls the JSON API. Calling the API cold with static headers is
// what trips Lidl's bot defence, so we mirror the browser: establish a cookie
// session once, then send those cookies + sec-fetch hints on every API call.
let _cookie = '';
let _deptNums = [];   // department category.id codes scraped from the landing nav
let _sessionTried = false;
async function ensureSession() {
  if (_sessionTried) return;
  _sessionTried = true;
  try {
    const res = await fetchWithBackoff(LANDING, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'el-GR,el;q=0.9',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
    }, { label: 'Lidl landing session' });
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    _cookie = set.map((c) => c.split(';')[0].trim()).filter((kv) => kv.includes('=')).join('; ');
    const html = await res.text();
    // The header nav lists the top departments as /c/<slug>/s<NUMBER> — those
    // NUMBERs are valid category.id codes and cover the whole assortment (a
    // department query returns its subcategories too). Far fewer requests than
    // sweeping every sitemap entry.
    _deptNums = [...new Set([...html.matchAll(/\/c\/[a-z0-9-]+\/s(\d+)/g)].map((m) => m[1]))];
  } catch { /* no session — API often still answers via Referer/Origin; discovery falls back to sitemap */ }
}

function apiHeaders() {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'el-GR,el;q=0.9',
    Referer: LANDING,
    Origin: ORIGIN,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    ...(_cookie ? { Cookie: _cookie } : {}),
  };
}

// Department category.id codes. Preference order: explicit override → the
// landing-page nav (scraped during ensureSession, ~8–17 departments, no extra
// request) → the full pages sitemap (broad but heavier) → Food & Drink.
export async function discoverCategoryNumbers(override = []) {
  if (override.length) return override;
  await ensureSession();
  if (_deptNums.length) return _deptNums;
  try {
    const res = await fetchWithBackoff(PAGES_SITEMAP, { headers: { 'User-Agent': UA } }, { label: 'Lidl pages sitemap' });
    const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
    const nums = [...new Set([...xml.matchAll(/\/c\/[a-z0-9-]+\/s(\d+)/g)].map((m) => m[1]))];
    return nums.length ? nums : ['10068374'];
  } catch (e) {
    console.log(`   sitemap discovery failed (${e.message}); falling back to Food & Drink`);
    return ['10068374'];
  }
}

// Returns { ok, json }. ok:false means the request FAILED (HTTP error, network
// error, or — importantly — a throttle that returns an empty/garbage body). The
// caller MUST treat ok:false as "unknown", never as "empty category", or a soft
// rate-limit would silently undercount. A valid JSON body with numFound:0 is a
// genuinely empty category and returns { ok:true, json }.
export async function fetchSearchPage(categoryNum, offset) {
  await ensureSession();
  // `category.id` (with the dot) is the real per-category filter — the plain
  // `categories` param is ignored and returns a fixed default set. version=v2.0.0
  // matches what the site's "load more" actually requests.
  const url = `${SEARCH_API}?assortment=GR&locale=el_GR&version=v2.0.0&category.id=${categoryNum}&offset=${offset}&fetchsize=${FETCH_SIZE}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetchWithBackoff(url, { headers: apiHeaders() }, {
        label: `Lidl search ${categoryNum}/${offset}`,
        retries: 1,
      });
      if (res.status === 404) return { ok: true, json: null };
      // Honour the server's own backoff signal instead of pushing through.
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get('retry-after')) || 0;
        await sleep(ra > 0 ? Math.min(60000, ra * 1000) : Math.min(30000, 2000 * 2 ** attempt));
        continue;
      }
      const text = res.ok ? await res.text() : '';
      if (res.ok && text) {
        try { return { ok: true, json: JSON.parse(text) }; }
        catch { /* empty/garbage body under load = soft block → back off & retry */ }
      }
    } catch { /* network blip → back off & retry */ }
    await sleep(Math.min(20000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500)); // 1,2,4,8,16,20s + jitter
  }
  return { ok: false, json: null };
}

export function numFoundOf(json) {
  return json?.numFound ?? json?.xPayload?.keywordResults?.num_items_found ?? 0;
}

// Each product is nested at items[].gridbox.data.
export function productsFromResponse(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((it) => it?.gridbox?.data).filter((p) => p && typeof p === 'object');
}

export function productId(p) {
  return p.productId ?? p.erpNumber ??
    (typeof p.canonicalPath === 'string' ? (p.canonicalPath.match(/\/p(\d+)\b/) || [])[1] : null);
}

// ── Offer classification (shared by the offers adapter + the catalog) ─────────
// Lidl tags promo state on the product itself. An item is a CURRENT offer when
// it has a published strikethrough (price.oldPrice>0), a "ΜΟΝΟ ΓΙΑ ΛΙΓΟ" promo
// (price.discount.discountText), or an in-store date badge active TODAY. EXPIRED
// (past) and UPCOMING (future) date badges do NOT count — upcoming deals aren't
// live yet. Full-price products return null (they show via the catalog, no badge).

export function collectBadges(p) {
  const sa = p.stockAvailability || {};
  const out = [];
  for (const key of ['badgeInfoV2', 'badgeInfo']) {
    const v = sa[key];
    const groups = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
    for (const g of groups) if (Array.isArray(g?.badges)) out.push(...g.badges);
  }
  return out;
}

// Parse a Greek in-store badge ("μόνο στο κατάστημα 11.06. - 17.06." /
// "...από 18.06.") into {validFrom, validUntil}. Dates are DD.MM. in the current
// year; a range that wraps past December rolls the end into next year.
export function parseBadgeDates(text, now) {
  const dm = [...String(text || '').matchAll(/(\d{1,2})\.(\d{1,2})\./g)].map((m) => ({ d: +m[1], mo: +m[2] }));
  const year = now.getUTCFullYear();
  const at = ({ d, mo }, endOfDay) =>
    new Date(Date.UTC(year, mo - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
  if (dm.length >= 2) {
    const from = at(dm[0], false);
    let until = at(dm[1], true);
    if (until < from) until = new Date(until.getTime() + 365 * 864e5);
    return { validFrom: from, validUntil: until };
  }
  if (dm.length === 1) {
    if (/από/i.test(text)) {
      const from = at(dm[0], false);
      return { validFrom: from, validUntil: new Date(from.getTime() + 7 * 864e5) };
    }
    return { validFrom: now, validUntil: at(dm[0], true) };
  }
  return null;
}

// null = not a current offer; else { offerType, originalPrice, validFrom, validUntil }.
export function classifyOffer(p, now = new Date()) {
  const price = p.price || {};
  if (!(price.price > 0)) return null;
  const hasStrike = price.oldPrice > 0 && price.oldPrice > price.price;
  const hasMono = !!(price.discount && price.discount.discountText);
  const activeBadge = collectBadges(p).find((b) => b &&
    (b.type === 'IN_STORE_TODAY_DATE_RANGE' || b.type === 'IN_STORE_FROM_DATE_TODAY'));
  if (!hasStrike && !hasMono && !activeBadge) return null;
  const dates = activeBadge ? parseBadgeDates(activeBadge.text || activeBadge.label, now) : null;
  return {
    offerType: hasStrike ? 'strikethrough' : 'mono',
    originalPrice: hasStrike ? Number(price.oldPrice) : null,
    validFrom: dates?.validFrom || now,
    validUntil: dates?.validUntil || new Date(now.getTime() + 7 * 864e5),
  };
}

// Walk every category to completion, returning a Map(productId → product) of all
// unique products. Empty categories are skipped. onProduct(p) is called once per
// unique product (handy to classify/collect without buffering twice).
export async function scrapeAllProducts({ cats, pace = 800, maxOffset = 3000, onProduct } = {}) {
  const byId = new Map();
  let catsWithProducts = 0;
  let views = 0;
  const throttledCats = []; // categories we couldn't read fully (request failed)
  let incompleteCats = 0;   // categories whose pagination was cut short by a throttle
  for (const num of cats) {
    const r0 = await fetchSearchPage(num, 0);
    if (!r0.ok) { throttledCats.push(num); await jitter(pace); continue; }
    const numFound = numFoundOf(r0.json);
    if (!numFound) { await jitter(pace); continue; } // valid response, genuinely empty
    catsWithProducts++;
    for (let offset = 0; offset < numFound && offset <= maxOffset; offset += FETCH_SIZE) {
      const r = offset === 0 ? r0 : await fetchSearchPage(num, offset);
      if (!r.ok) { incompleteCats++; break; } // throttle mid-category — don't pretend it's done
      const prods = productsFromResponse(r.json);
      if (prods.length === 0) break;
      for (const p of prods) {
        views++;
        const id = productId(p);
        if (id == null || byId.has(String(id))) continue;
        byId.set(String(id), p);
        if (onProduct) onProduct(p);
      }
      if (offset + FETCH_SIZE < numFound) await jitter(pace);
    }
    await jitter(pace);
  }
  return {
    byId,
    stats: { catsWithProducts, views, unique: byId.size, throttledCats: throttledCats.length, incompleteCats },
  };
}
