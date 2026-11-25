// READ-ONLY probe (2026-11-25): how well does a free Groq vision model read the
// Discount Markt leaflet? discountmarkt.gr has no shop — its offers exist only
// as a weekly PDF of page images. This fetches the current PDF, pulls out the
// page JPEGs (one per page, no renderer needed), asks the model for every
// offer on each page, and checks each reading against the leaflet's own
// per-kilo line («*1κιλ: μόνο 2,82€»): price ÷ size must equal it. No DB, no
// writes — it prints a report for the owner's free-vs-paid decision.
//
// Groq is blocked from the dev PC → run in CI:
//   gh workflow run scrape-chains.yml -f chain=discountmarkt-probe
//   PAGES=3,4 GROQ_VISION_MODEL=… node src/scripts/probe-discountmarkt-ocr.mjs
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import sharp from 'sharp';

const SITE = 'https://discountmarkt.gr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const PAGES = (process.env.PAGES || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
const OUT = process.env.OUT || '';
const apiKey = process.env.GROQ_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// The brochure page → its 3D-FlipBook id → the PDF url.
async function leafletPdfUrl() {
  const html = await get(`${SITE}/offer-brochures/`);
  const id = html.match(/brochure-viewer\?id=(\d+)/)?.[1];
  if (!id) throw new Error('no brochure id on /offer-brochures/');
  const post = await get(`${SITE}/wp-admin/admin-ajax.php?action=fb3d_send_post&id=${id}`);
  const pdf = post.match(/https?:\\?\/\\?\/[^"]+?\.pdf/)?.[0]?.replace(/\\\//g, '/');
  if (!pdf) throw new Error('no PDF in the flipbook post');
  return pdf.replace(/^http:/, 'https:');
}

// Image-only PDF: each page is one DCTDecode (JPEG) stream.
function pageJpegs(pdf) {
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

const PROMPT = `This is one page of a Greek supermarket leaflet (Discount Markt). List EVERY product offer printed on it.
For each offer return:
- "name": the product name exactly as printed, in Greek letters as printed (do not translate or transliterate; include the brand if printed)
- "size": the pack size as printed (e.g. "280γρ", "1lt", "6x330ml"), or null
- "price": the big offer price in euros as a number (e.g. "0,79" → 0.79)
- "perUnit": the per-kilo or per-litre price if printed (e.g. "*1κιλ: μόνο 2,82€" → 2.82), else null
- "oldPrice": a crossed-out old price if printed, else null
- "priceFor": "item", "kg" (sold by weight, «το κιλό») or "portion" («Η ΜΕΡΙΔΑ»)
Reply with strict JSON: {"items": [ ... ]}. No other text.`;

async function readPage(jpeg, model = MODEL) {
  // Keep the page readable but well under the request size limit.
  const img = await sharp(jpeg).resize({ width: 1100, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const body = {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.toString('base64')}` } },
      ],
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_completion_tokens: 4096,
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (res.status === 429) { await sleep(30000); continue; }
    if (!res.ok) return { error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      return { items: Array.isArray(parsed.items) ? parsed.items : [], tokens: data.usage?.total_tokens ?? 0 };
    } catch (e) {
      return { error: `parse: ${e.message}` };
    }
  }
  return { error: 'rate-limited' };
}

// «280γρ» → 0.28 (kg), «1,5lt» → 1.5 (l), «6x330ml» → 1.98; null when unreadable.
export function sizeInKgOrL(size) {
  const t = String(size ?? '').toLowerCase().replace(/\s+/g, '').replace(',', '.');
  const m = t.match(/(?:(\d+)[x×χ*])?(\d+(?:\.\d+)?)(kg|κιλ|κ|gr|γρ|g|γ|ml|lt|l|λτ|λ)/);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  let v = Number(m[2]);
  if (/^(gr|γρ|g|γ|ml)$/.test(m[3])) v /= 1000;
  return n * v;
}

// The leaflet's own check: price ÷ size = the printed per-kilo price (±2%).
export function perUnitCheck(it) {
  if (it.perUnit == null || !(it.price > 0)) return 'no-per-unit';
  if (it.priceFor === 'kg') return Math.abs(it.price - it.perUnit) <= 0.011 ? 'ok' : 'mismatch';
  const q = sizeInKgOrL(it.size);
  if (!q) return 'no-size';
  const implied = it.price / q;
  return Math.abs(implied - it.perUnit) <= Math.max(0.02 * it.perUnit, 0.011) ? 'ok' : 'mismatch';
}

async function main() {
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const models = await (await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } })).json().catch(() => ({}));
  const ids = (models.data ?? []).map((m) => m.id);
  console.log(`🔎 Groq models available (${ids.length}): ${ids.join(', ')}`);
  const pdfUrl = await leafletPdfUrl();
  const pdf = await get(pdfUrl, 'buffer');
  const jpegs = pageJpegs(pdf);
  // Groq retires models (llama-4-scout, the Lidl reader, is gone): try the
  // named one, then every listed model that might read images, on page 1.
  const candidates = [...new Set([MODEL, ...ids.filter((id) => /scout|maverick|vision|vl|qwen|llama-4|gemma|pixtral|kimi/i.test(id))])];
  let model = null;
  for (const c of candidates) {
    const r = await readPage(jpegs[0], c);
    console.log(`   try ${c}: ${r.error ? r.error.slice(0, 140) : `${r.items.length} items`}`);
    if (!r.error && r.items.length > 0) { model = c; break; }
    await sleep(1500);
  }
  if (!model) { console.log('❌ no listed Groq model reads the page — free vision is not available'); return; }
  console.log(`📄 ${pdfUrl}: ${jpegs.length} page images; model ${model}`);
  const report = [];
  const tally = { pages: 0, failedPages: 0, items: 0, ok: 0, mismatch: 0, noPerUnit: 0, noSize: 0, tokens: 0 };
  for (let i = 0; i < jpegs.length; i++) {
    const page = i + 1;
    if (PAGES.length && !PAGES.includes(page)) continue;
    const r = await readPage(jpegs[i], model);
    tally.pages++;
    if (r.error) { tally.failedPages++; console.log(`p${page}: ERROR ${r.error}`); continue; }
    tally.tokens += r.tokens;
    console.log(`p${page}: ${r.items.length} items`);
    for (const it of r.items) {
      const check = perUnitCheck(it);
      tally.items++;
      if (check === 'ok') tally.ok++;
      else if (check === 'mismatch') tally.mismatch++;
      else if (check === 'no-size') tally.noSize++;
      else tally.noPerUnit++;
      report.push({ page, ...it, check });
      console.log(`   [${check}] ${it.name} | ${it.size ?? '-'} | ${it.price} € | ${it.perUnit ?? '-'} €/κιλό | ${it.priceFor ?? '-'}${it.oldPrice ? ` | was ${it.oldPrice}` : ''}`);
    }
    await sleep(2500);
  }
  console.log(`\n🏁 ${JSON.stringify(tally)}`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('probe-discountmarkt-ocr.mjs')) {
  main().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
}
