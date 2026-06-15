// Lidl adapter.
//
// Lidl ships a weekly leaflet. There is no offers API and no GTIN feed; the
// only reliable signal is the leaflet's printed pages. We OCR each page with
// Groq vision and hand the extracted offers to the shared ingest pipeline.
// See ./CONTRACT.md.
//
// Usage:
//   node src/scripts/adapters/lidl.mjs            # full flyer
//   DRY_RUN=1 node src/scripts/adapters/lidl.mjs  # fetch + match, no DB writes
//   LIMIT_PAGES=3 node src/scripts/adapters/lidl.mjs  # only first N pages
//
// How it works:
//   1. Discover the current "food-nonfood" flyer's identifier by parsing
//      https://www.lidl-hellas.gr/c/fylladio-lidl/s10020481 for hrefs of
//      shape `/l/el/fyladia/<id>/ar/0`. (The Schwarz `/v4/flyers` LIST
//      endpoint went 404 sometime around mid-2026; the per-flyer endpoint
//      below still works.)
//   2. GET https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<id>&region_id=0
//      → flyer.{startDate,endDate,pages[{image,number,...}]}. ~30–60 pages.
//   3. Per page: fetch + resize the image, send to Groq vision
//      (meta-llama/llama-4-scout-17b-16e-instruct) with a strict JSON prompt
//      enumerating every priced tile.
//   4. Validate each entry with zod, map to OfferItem (chainItemcode is a
//      deterministic hash of the normalised productName so re-runs hit
//      ChainProductMapping after the first week).
//   5. Hand the lot to ingestOffers({chain: 'lidl', source: 'leaflet'}).
//
// FRAGILITY:
//   - The flyer-identifier scrape depends on the public listing page layout.
//   - Groq vision is rate-limited; PACE_MS env throttles between page calls
//     (default 4000ms — Lidl's free-tier vision quota is small).

// Load env before any other module touches `process.env.GROQ_API_KEY` /
// `DATABASE_URL`. The project keeps secrets in .env.local; .env is committed
// for non-sensitive defaults. ingest-offers also runs `dotenv/config`, but it
// only picks up .env — we load both here so the adapter works locally.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createHash } from 'node:crypto';
import { load as loadHtml } from 'cheerio';
import sharp from 'sharp';
import { z } from 'zod';
import { ingestOffers, printReport } from '../lib/ingest-offers.mjs';
import { backfillLidlImages } from '../lib/lidl-image-backfill.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT_PAGES = process.env.LIMIT_PAGES ? parseInt(process.env.LIMIT_PAGES, 10) : Infinity;
const PACE_MS = parseInt(process.env.PACE_MS || '4000', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const LISTING_URL = 'https://www.lidl-hellas.gr/c/fylladio-lidl/s10020481';
const FLYER_API = 'https://endpoints.leaflets.schwarz/v4/flyer';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
};

const ItemSchema = z.object({
  productName: z.string().min(1),
  discountedPrice: z.coerce.number().positive(),
  originalPrice: z.coerce.number().positive().nullish(),
  discountPercent: z.coerce.number().nullish(),
  category: z.string().nullish(),
  description: z.string().nullish(),
});

const EXTRACTION_PROMPT = `You are analyzing a supermarket leaflet page. Enumerate EVERY individual priced product tile on the page.
Do NOT skip, summarize, group, or merge products. A single flyer page typically contains 6–15 separate product tiles — list all of them.
If a tile shows multiple variants (e.g. "apple / pear"), emit one entry per variant only if each has its own price; otherwise one entry for the combined tile.
Return a JSON object with a single key "discounts" whose value is an array of offers.
Each offer must have:
- productName (string, required — the product as printed, in Greek)
- discountedPrice (number, required, in euros — the large/final price shown)
- originalPrice (number, optional — the crossed-out price if visible)
- discountPercent (number, optional — e.g. 30 for "-30%")
- category (string, optional — one of: Κρέας & Ψάρι, Γαλακτοκομικά & Είδη Ψυγείου, Τυριά & Αλλαντικά, Φρούτα & Λαχανικά, Αρτοποιία, Κατεψυγμένα, Είδη Παντοπωλείου, Πρωινό & Ροφήματα, Σνακ & Γλυκά, Κάβα, Είδη Καθαρισμού & Σπιτιού, Προσωπική Φροντίδα, Βρεφικά Είδη, Είδη Κατοικιδίων, Άλλο)
- description (string, optional — weight, pack size, brand qualifier)
Use plain numbers (1.99 not "1,99€"). Return only the JSON object, no prose.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "PUMMARO Ντομάτα Πασσάτα 3x250g" → stable 16-char hex.
// Used as chainItemcode so re-runs of the same product across weeks hit the
// ChainProductMapping cache and skip re-matching.
function normaliseForHash(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
function nameHash(name) {
  return createHash('sha1').update(normaliseForHash(name)).digest('hex').slice(0, 16);
}

async function discoverFoodNonfoodFlyer() {
  const res = await fetch(LISTING_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Listing page HTTP ${res.status}`);
  const html = await res.text();
  const $ = loadHtml(html);
  const ids = new Set();
  $('a[href*="/l/el/fyladia/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/l\/el\/fyladia\/([^/]+)\/ar\/0/);
    if (m) ids.add(m[1]);
  });
  const all = [...ids];
  // Prefer the main weekly "food-nonfood" flyer; fall back to anything date-
  // prefixed (lidl tends to name them DD-MM-lidl-food-nonfood).
  const food = all.find((id) => /food-?nonfood/i.test(id))
    || all.find((id) => /^\d{2}-\d{2}-/.test(id))
    || all[0];
  if (!food) throw new Error(`No flyer ids found on ${LISTING_URL}`);
  return { chosen: food, all };
}

async function fetchFlyer(identifier) {
  const url = `${FLYER_API}?flyer_identifier=${encodeURIComponent(identifier)}&region_id=0`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Flyer API HTTP ${res.status} for ${identifier}`);
  const j = await res.json();
  if (!j.success || !j.flyer) throw new Error(`Flyer API failed: ${j.message || 'no flyer in payload'}`);
  return j.flyer;
}

async function fetchAndResizeImage(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Image fetch HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const buffer = await sharp(input)
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { buffer, mimeType: 'image/jpeg' };
}

async function callGroqVision(imageBuffer, mimeType, apiKey, { maxRetries = 5 } = {}) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  let attempt = 0;
  while (true) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` } },
          ],
        }],
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0,
      }),
    });
    if (r.ok) return r.json();
    if (r.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(r.headers.get('retry-after')) || 0;
      const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 4_000 * 2 ** attempt);
      if (wait > 180_000) throw new Error(`Rate limit: retry-after ${wait}ms — daily cap likely hit`);
      console.log(`   429, backing off ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(wait);
      attempt++;
      continue;
    }
    const body = await r.text().catch(() => '');
    throw new Error(`Groq ${r.status}: ${body.slice(0, 200)}`);
  }
}

function parseGroqJson(json) {
  const raw = json.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return []; }
  return Array.isArray(parsed) ? parsed : (parsed.discounts || parsed.offers || []);
}

async function extractPageOffers(imageUrl, apiKey) {
  const { buffer, mimeType } = await fetchAndResizeImage(imageUrl);
  const json = await callGroqVision(buffer, mimeType, apiKey);
  const array = parseGroqJson(json);
  const valid = [];
  let rejected = 0;
  for (const item of array) {
    const r = ItemSchema.safeParse(item);
    if (r.success) valid.push(r.data); else rejected++;
  }
  return { valid, rejected, raw: array.length };
}

function toOfferItem(deal, validFrom, validUntil) {
  return {
    name: String(deal.productName).trim(),
    price: Number(deal.discountedPrice),
    originalPrice: deal.originalPrice ? Number(deal.originalPrice) : null,
    chainItemcode: nameHash(deal.productName),
    barcode: null,
    brand: null,
    unit: deal.description ? String(deal.description).trim() : null,
    category: deal.category || 'Άλλο',
    imageUrl: null,
    validFrom,
    validUntil,
    offerType: deal.originalPrice ? 'strikethrough' : 'mono',
  };
}

export async function runLidlAdapter({ dryRun = DRY_RUN, limitPages = LIMIT_PAGES } = {}) {
  console.log(`🛒 Lidl adapter${dryRun ? ' (DRY_RUN)' : ''}`);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing — required for vision OCR.');

  const { chosen, all } = await discoverFoodNonfoodFlyer();
  console.log(`   flyer identifiers on listing: ${all.join(', ')}`);
  console.log(`   chosen: ${chosen}`);

  const flyer = await fetchFlyer(chosen);
  const validFrom = (flyer.startDate || flyer.offerStartDate) + 'T00:00:00Z';
  const validUntil = (flyer.endDate || flyer.offerEndDate) + 'T23:59:59Z';
  const pages = flyer.pages || [];
  console.log(`   flyer "${flyer.name || flyer.title || chosen}" — ${pages.length} pages, ${flyer.startDate}→${flyer.endDate}`);

  const allOffers = [];
  const counts = { pagesProcessed: 0, pagesFailed: 0, rawOffers: 0, validOffers: 0, rejectedOffers: 0 };
  const seenItemcodes = new Set();

  for (let i = 0; i < pages.length && i < limitPages; i++) {
    const page = pages[i];
    if (!page?.image) { counts.pagesFailed++; continue; }
    try {
      const { valid, rejected, raw } = await extractPageOffers(page.image, apiKey);
      counts.pagesProcessed++;
      counts.rawOffers += raw;
      counts.validOffers += valid.length;
      counts.rejectedOffers += rejected;
      for (const v of valid) {
        const item = toOfferItem(v, validFrom, validUntil);
        if (!seenItemcodes.has(item.chainItemcode)) {
          seenItemcodes.add(item.chainItemcode);
          allOffers.push(item);
        }
      }
      process.stdout.write(`\r   page ${i + 1}/${pages.length} — raw:${raw} valid:${valid.length} rejected:${rejected} total:${allOffers.length}   `);
    } catch (err) {
      counts.pagesFailed++;
      console.log(`\n   page ${i + 1} failed: ${err.message}`);
    }
    if (i + 1 < pages.length) await sleep(PACE_MS);
  }
  console.log('');
  console.log(`   pages: ${counts.pagesProcessed} ok / ${counts.pagesFailed} failed`);
  console.log(`   offers: ${counts.validOffers} valid (${counts.rejectedOffers} rejected by zod, ${counts.rawOffers - counts.validOffers - counts.rejectedOffers} duplicate item-hashes dropped)`);

  if (allOffers.length === 0) {
    console.log('   no offers extracted — safety net in ingest-offers will skip deactivation');
  }

  // showUnmatched off: names/prices here come from vision OCR, not a chain
  // API — don't publish unmatched items unreviewed. Flip after eyeballing a
  // real run's quality in the admin Review tab.
  const report = await ingestOffers({ chain: 'lidl', source: 'leaflet', items: allOffers, dryRun, showUnmatched: false });
  printReport(report);

  // Lidl offers carry no leaflet image; stamp each with a Lidl-sourced catalog
  // image (own packaging, reliable host) instead of a cross-chain fallback.
  if (!dryRun) {
    try { await backfillLidlImages({}); }
    catch (err) { console.log(`   ⚠️ Lidl image backfill skipped: ${err.message}`); }
  }

  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
if (isMain) {
  runLidlAdapter()
    .then((report) => process.exit(report.healthOk ? 0 : 1))
    .catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
}
