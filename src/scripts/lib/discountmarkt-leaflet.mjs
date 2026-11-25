// Discount Markt leaflet (2026-11-25). discountmarkt.gr has no shop: its
// offers exist only as a weekly PDF of page images (3D-FlipBook on WordPress).
// The pages are read by Claude agents by src/scripts/leaflet-reading-rules.md
// (owner 11-25: «cant we create an agent to go through that?» — the free Groq
// reader got ~1 in 4 names wrong). This module fetches the leaflet and checks
// and shapes what the readers wrote; src/scripts/discountmarkt-leaflet.mjs
// runs it.
import crypto from 'node:crypto';
import { foldText } from '../../lib/product-linker.ts';

export const SITE = 'https://discountmarkt.gr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// The brochure page → its 3D-FlipBook id → the PDF url.
export async function leafletPdfUrl() {
  const html = await get(`${SITE}/offer-brochures/`);
  const id = html.match(/brochure-viewer\?id=(\d+)/)?.[1];
  if (!id) throw new Error('no brochure id on /offer-brochures/');
  const post = await get(`${SITE}/wp-admin/admin-ajax.php?action=fb3d_send_post&id=${id}`);
  const pdf = post.match(/https?:\\?\/\\?\/[^"]+?\.pdf/)?.[0]?.replace(/\\\//g, '/');
  if (!pdf) throw new Error('no PDF in the flipbook post');
  return pdf.replace(/^http:/, 'https:');
}

export const fetchPdf = (url) => get(url, 'buffer');

// Image-only PDF: each page is one DCTDecode (JPEG) stream, in page order.
export function pageJpegs(pdf) {
  const s = pdf.toString('latin1');
  const out = [];
  const re = /\/Filter\s*\/DCTDecode[\s\S]{0,400}?stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    out.push(pdf.subarray(start, end));
  }
  return out;
}

// «ΑΠΟ ΔΕΥΤΕΡΑ 23/11 ΕΩΣ ΣΑΒΒΑΤΟ 28/11» → the Greek calendar days as ISO
// instants (start of the first day, end of the last). The year is the one that
// puts the range nearest to `now` (a December leaflet can run into January).
export function parseHeaderDates(text, now = new Date()) {
  const m = String(text ?? '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?[^0-9]+?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const [, d1, m1, y1, d2, m2, y2] = m;
  const fullYear = (y) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : null);
  const base = now.getUTCFullYear();
  let startYear = fullYear(y1) ?? fullYear(y2) ?? base;
  // A leaflet read in early January for a December start belongs to last year.
  if (!y1 && !y2 && Number(m1) === 12 && now.getUTCMonth() === 0) startYear = base - 1;
  const endYear = fullYear(y2) ?? (Number(m2) < Number(m1) ? startYear + 1 : startYear);
  const pad = (n) => String(n).padStart(2, '0');
  const from = new Date(`${startYear}-${pad(m1)}-${pad(d1)}T00:00:00+02:00`);
  const until = new Date(`${endYear}-${pad(m2)}-${pad(d2)}T23:59:59+02:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until < from) return null;
  return { validFrom: from.toISOString(), validUntil: until.toISOString() };
}

// Total kg / litres / pieces / metres a size states, every plausible reading:
// «10τεμ 400γρ» is 400 g in all, «50γρ 2τεμ» and «2x50γρ» are 100 g.
export function sizeReadings(size) {
  const t = String(size ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/(\d),(\d)/g, '$1.$2');
  const qty = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|κιλ\w*|κ\b|gr|γρ|g\b|γ\b|ml|lt|λιτ\w*|λτ|l\b|λ\b|τεμ\w*|τμχ|m\b|μ\b|μετρ\w*|μέτρ\w*)/g)]
    .map((x) => {
      const v = Number(x[1]);
      const u = x[2];
      if (/^(kg|κιλ|κ$)/.test(u)) return { dim: 'mass', v };
      if (/^(gr|γρ|g$|γ$)/.test(u)) return { dim: 'mass', v: v / 1000 };
      if (/^ml/.test(u)) return { dim: 'vol', v: v / 1000 };
      if (/^(lt|λιτ|λτ|l$|λ$)/.test(u)) return { dim: 'vol', v };
      if (/^(τεμ|τμχ)/.test(u)) return { dim: 'pc', v };
      return { dim: 'len', v };
    });
  const mult = t.match(/(\d+)\s*[x×χ*]\s*\d/);
  const out = [];
  for (const q of qty) {
    if (q.dim === 'pc') continue;
    out.push({ dim: q.dim, v: q.v });
    const pcs = qty.find((p) => p.dim === 'pc')?.v;
    if (pcs) out.push({ dim: q.dim, v: q.v * pcs });
    if (mult) out.push({ dim: q.dim, v: q.v * Number(mult[1]) });
  }
  // Every piece count printed («night 16τεμ / long 18τεμ / normal 20τεμ»):
  // the leaflet's unit price uses one of them.
  for (const p of qty) if (p.dim === 'pc') out.push({ dim: 'pc', v: p.v });
  return out;
}

const DIM_OF = { 'κιλό': 'mass', 'λίτρο': 'vol', 'τεμάχιο': 'pc', 'μέτρο': 'len' };

// The leaflet's own check: price ÷ quantity = its printed unit price (±2%).
// 'ok' | 'mismatch' | 'unchecked' (no unit line, or no size to divide by).
// «6+2 Δώρο», «2+1 ΔΩΡΟ» → { pay: 6, get: 8 } (the leaflet's multi-buy).
export function multiBuy(text) {
  const m = String(text ?? '').match(/(\d+)\s*\+\s*(\d+)(?=\s*(?:δ[ώω]ρο|ΔΩΡΟ|$|[^\d]))/i);
  return m ? { pay: Number(m[1]), get: Number(m[1]) + Number(m[2]) } : null;
}

export function unitPriceCheck(o) {
  if (o.perUnit == null || !(o.price > 0)) return 'unchecked';
  if (o.priceFor === 'kg') return Math.abs(o.price - o.perUnit) <= 0.011 ? 'ok' : 'mismatch';
  // A unit the check does not know («1μεζ: 0,07») proves nothing either way,
  // and neither does a line whose unit the reader could not name.
  const named = o.perUnitOf != null;
  const dim = named ? DIM_OF[o.perUnitOf] : 'mass';
  if (!dim) return 'unchecked';
  // Every quantity the label states: the size, a drained weight in the variants
  // («στραγγιστό βάρος 190γρ»), and a multi-buy (6+2 Δώρο → 8 packs).
  const text = [o.size, o.variants, o.note].filter(Boolean).join(' ');
  const base = sizeReadings(text);
  const mb = multiBuy(text);
  const all = mb ? [...base, ...base.map((r) => ({ dim: r.dim, v: r.v * mb.get }))] : base;
  const readings = all.filter((r) => r.dim === dim || (dim === 'mass' && r.dim === 'vol') || (dim === 'vol' && r.dim === 'mass'));
  if (readings.length === 0) return 'unchecked';
  const tol = Math.max(0.02 * o.perUnit, 0.011);
  if (readings.some((r) => r.v > 0 && Math.abs(o.price / r.v - o.perUnit) <= tol)) return 'ok';
  return named ? 'mismatch' : 'unchecked';
}

// The card's name: brand + name + variants + size, as the leaflet prints them.
export function displayName(o) {
  const parts = [o.name, o.variants, o.size].map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let n = parts.join(' ');
  // «MYTHOS μπύρα 330ml» at 6,36 € reads like one can: the deal belongs in
  // the name («… 6+2 Δώρο»), where the cards' pack reader also finds it.
  const mb = multiBuy(o.note);
  if (mb && !multiBuy(n)) n += ` ${mb.pay}+${mb.get - mb.pay} Δώρο`;
  if (o.priceFor === 'kg' && !/κιλ/i.test(n)) n += ' (το κιλό)';
  if (o.priceFor === 'portion' && !/μερίδα|μεριδα/i.test(n)) n += ' (η μερίδα)';
  return n;
}

// Discount Markt prints no item codes: a stable code from the folded name +
// variants + size, so the same product read next week maps to the same record.
export function itemCode(o) {
  // Letters and digits only: «320γρ» = «320 γρ», «Μέλι & Γάλα» = «μελι γαλα».
  const key = [o.name, o.variants, o.size].map((s) => foldText(String(s ?? '')).replace(/[^a-z0-9α-ω]+/g, '')).join('|');
  return 'dm-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

// A reader's photo box: [x0, y0, x1, y1] as page fractions, at least 4% of the
// page each way (a sliver is a misread, not a photo). null otherwise.
export function validBox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [x0, y0, x1, y1] = b.map(Number);
  if (![x0, y0, x1, y1].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  if (x1 - x0 < 0.04 || y1 - y0 < 0.04) return null;
  return [x0, y0, x1, y1];
}

// The product photo cut out of its page, as a phone-sized JPEG (the cards
// show no leaflet page, only the pack — like every other store's photo).
export async function cropPhoto(pageJpeg, box) {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(pageJpeg).metadata();
  const [x0, y0, x1, y1] = box;
  const left = Math.max(0, Math.floor(x0 * meta.width));
  const top = Math.max(0, Math.floor(y0 * meta.height));
  const width = Math.min(meta.width - left, Math.ceil((x1 - x0) * meta.width));
  const height = Math.min(meta.height - top, Math.ceil((y1 - y0) * meta.height));
  return sharp(pageJpeg).extract({ left, top, width, height })
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

// Check, shape and de-duplicate what the readers wrote. Returns the offers to
// publish and the ones left out (with the reason), so a run can print both.
export function prepareOffers(readings) {
  const keep = new Map();
  const dropped = [];
  for (const o of readings) {
    const price = Number(o.price);
    if (!o.name || !(price > 0) || price > 500) { dropped.push({ o, why: 'no name or price' }); continue; }
    const check = unitPriceCheck({ ...o, price });
    if (check === 'mismatch') { dropped.push({ o, why: `price ${price} does not match the printed unit price ${o.perUnit}` }); continue; }
    // «Not sure» is kept only when the leaflet's own unit price confirms the
    // price (11-23 leaflet: 9 of 15 unsure readings were unit-line doubts on
    // offers whose price ÷ size matched exactly).
    if (o.sure === false && check !== 'ok') { dropped.push({ o, why: 'reader not sure and the price is not confirmed by a unit price' }); continue; }
    const code = itemCode(o);
    if (keep.has(code)) continue; // the same product printed twice
    const old = Number(o.oldPrice);
    keep.set(code, {
      code,
      name: displayName(o),
      price,
      originalPrice: old > price ? old : null,
      note: o.note ? String(o.note).replace(/\s+/g, ' ').trim() : null,
      check,
      page: o.page,
      photo: validBox(o.photo),
    });
  }
  return { offers: [...keep.values()], dropped };
}
