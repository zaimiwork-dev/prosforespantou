// Discount Markt leaflet → offers (2026-11-25; owner: «cant we create an agent
// to go through that?»). Weekly, three steps:
//
//   1. MODE=fetch OUT=<dir> node src/scripts/discountmarkt-leaflet.mjs
//        downloads the current leaflet PDF and writes its pages as
//        <dir>/p01.jpg … + <dir>/meta.json (pdf url, page count).
//   2. Claude agents read the pages by src/scripts/leaflet-reading-rules.md and
//      write <dir>/read-*.json ({headers, offers}) — e.g. three agents, eight
//      pages each. (The free Groq reader got ~1 in 4 names wrong — see
//      src/scripts/probe-discountmarkt-ocr.mjs.)
//   3. MODE=import IN=<dir>/read-1.json,<dir>/read-2.json,… [DRY_RUN=1] node …
//        checks every reading (lib/discountmarkt-leaflet: price ÷ size must
//        equal the printed unit price; «not sure» readings are left out; the
//        same product twice counts once), creates the store's products by a
//        stable code from the name (it prints no item codes; no shelf price —
//        the leaflet price is an offer), and ingests the offers as source
//        'leaflet' with the leaflet's printed dates.
//   Photos (11-25): the readers also box each product photo; before the import,
//   MODE=sheets IN=… OUT=<dir> lays every crop out on numbered contact sheets
//   (<dir>/photo-sheet-N.jpg + photo-sheets.json); a reviewer writes the
//   numbers whose photo does not show the named product to
//   <dir>/photo-reject.json ([numbers]); the import (PHOTO_REJECT=<that file>)
//   keeps the category icon for those. A sample of 36 crops had 1 wrong.
//
// dotenv first (ESM hoist trap) — the ingest modules import prisma.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';

const MODE = process.env.MODE;
const DRY_RUN = process.env.DRY_RUN === '1';

// The leaflet already imported (scraper_state), so the daily job reads a
// leaflet once: a new PDF (new bytes) is the only thing that wakes the readers.
const STATE_KEY = 'discountmarkt.leaflet';

async function fetchStep() {
  const out = process.env.OUT;
  if (!out) throw new Error('OUT is required');
  const { leafletPdfUrl, fetchPdf, pageJpegs } = await import('./lib/discountmarkt-leaflet.mjs');
  const crypto = await import('node:crypto');
  fs.mkdirSync(out, { recursive: true });
  const url = await leafletPdfUrl();
  const pdf = await fetchPdf(url);
  const sha1 = crypto.createHash('sha1').update(pdf).digest('hex');
  const pages = pageJpegs(pdf);
  pages.forEach((jpg, i) => fs.writeFileSync(path.join(out, `p${String(i + 1).padStart(2, '0')}.jpg`), jpg));
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ pdfUrl: url, sha1, pages: pages.length, fetchedAt: new Date().toISOString() }, null, 1));
  let isNew = true;
  if (process.env.DATABASE_URL && process.env.FORCE !== '1') {
    const { default: prisma } = await import('../lib/prisma.ts');
    const done = await prisma.scraperState.findUnique({ where: { key: STATE_KEY } });
    isNew = done?.value !== sha1;
    await prisma.$disconnect();
  }
  console.log(`📄 ${url}: ${pages.length} pages → ${out} — ${isNew ? 'NEW leaflet, to read' : 'already imported, nothing to do'}`);
  // GitHub Actions: the reading and import steps run only for a new leaflet.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new=${isNew ? 1 : 0}\npages=${pages.length}\n`);
  }
}

// Crop each boxed photo from its page and upload it (path = code + content
// hash, so a re-run re-uses the object name). Sets o.imageUrl. Without R2
// credentials, or in DRY_RUN, it only counts.
// Readings → offers, the same way the import shapes them (shared by both modes).
async function readOffers(files) {
  const { prepareOffers } = await import('./lib/discountmarkt-leaflet.mjs');
  const readings = [];
  const headers = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    readings.push(...(j.offers ?? []));
    headers.push(...(j.headers ?? []));
  }
  return { readings, headers, ...prepareOffers(readings) };
}

// Numbered contact sheets of every photo crop, 6 × 6 per sheet, each tile
// labelled «N · name», for the photo reviewer.
async function sheetsStep() {
  const files = (process.env.IN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = process.env.OUT;
  if (!files.length || !out) throw new Error('IN and OUT are required');
  const pagesDir = process.env.PAGES_DIR || path.dirname(files[0]);
  const { cropPhoto } = await import('./lib/discountmarkt-leaflet.mjs');
  const { default: sharp } = await import('sharp');
  const { offers } = await readOffers(files);
  const boxed = offers.filter((o) => o.photo);
  const tile = 260;
  const cols = 6;
  const per = 36;
  const index = {};
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let sheet = 0;
  for (let i = 0; i < boxed.length; i += per) {
    sheet++;
    const tiles = [];
    for (const [j, o] of boxed.slice(i, i + per).entries()) {
      const n = i + j + 1;
      index[n] = o.code;
      const pageFile = path.join(pagesDir, `p${String(o.page).padStart(2, '0')}.jpg`);
      const crop = await sharp(await cropPhoto(fs.readFileSync(pageFile), o.photo))
        .resize({ width: tile, height: tile - 40, fit: 'contain', background: '#ffffff' }).png().toBuffer();
      const label = Buffer.from(`<svg width="${tile}" height="40"><rect width="100%" height="100%" fill="#eeeeee"/><text x="4" y="16" font-size="14" font-weight="bold" font-family="Arial">${n}</text><text x="4" y="34" font-size="12" font-family="Arial">${esc(o.name.slice(0, 38))}</text></svg>`);
      tiles.push(await sharp({ create: { width: tile, height: tile, channels: 3, background: '#ffffff' } })
        .composite([{ input: crop, top: 0, left: 0 }, { input: label, top: tile - 40, left: 0 }]).png().toBuffer());
    }
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * tile, height: rows * tile, channels: 3, background: '#bbbbbb' } })
      .composite(tiles.map((t, k) => ({ input: t, left: (k % cols) * tile, top: Math.floor(k / cols) * tile })))
      .jpeg({ quality: 80 }).toFile(path.join(out, `photo-sheet-${sheet}.jpg`));
  }
  fs.writeFileSync(path.join(out, 'photo-sheets.json'), JSON.stringify(index));
  console.log(`🖼️ ${boxed.length} photo crops on ${sheet} sheets → ${out}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `sheets=${sheet}\n`);
}

async function attachPhotos(offers, pagesDir) {
  const { cropPhoto } = await import('./lib/discountmarkt-leaflet.mjs');
  const { resolveR2Config, makeR2Backend } = await import('./lib/r2-storage.mjs');
  const crypto = await import('node:crypto');
  const backend = DRY_RUN ? null : makeR2Backend(resolveR2Config());
  let cut = 0;
  let uploaded = 0;
  let failed = 0;
  for (const o of offers) {
    if (!o.photo) continue;
    const pageFile = path.join(pagesDir, `p${String(o.page).padStart(2, '0')}.jpg`);
    if (!fs.existsSync(pageFile)) continue;
    try {
      const jpg = await cropPhoto(fs.readFileSync(pageFile), o.photo);
      cut++;
      if (!backend) continue;
      const key = `discountmarkt/${o.code}-${crypto.createHash('sha1').update(jpg).digest('hex').slice(0, 10)}.jpg`;
      await backend.upload(key, jpg, 'image/jpeg');
      o.imageUrl = backend.publicUrlFor(key);
      uploaded++;
    } catch (e) {
      failed++;
      if (failed <= 3) console.log(`   photo failed for ${o.name}: ${e.message}`);
    }
  }
  const boxed = offers.filter((o) => o.photo).length;
  console.log(`   photos: ${boxed} boxed, ${cut} cut, ${uploaded} uploaded${backend ? '' : ' (no upload: DRY_RUN or no R2 credentials)'}, ${failed} failed`);
}

async function importStep() {
  const files = (process.env.IN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!files.length) throw new Error('IN is required (comma-separated read-*.json files)');
  const { parseHeaderDates } = await import('./lib/discountmarkt-leaflet.mjs');
  const { readings, headers, offers, dropped } = await readOffers(files);
  // Pages can run on their own dates (11-23 leaflet: «ΤΕΤΑΡΤΗ 25/11 έως
  // ΣΑΒΒΑΤΟ 28/11» on the Black Friday page, 23/11–28/11 elsewhere). An offer
  // takes its page's printed dates, else the leaflet's most common ones.
  const datesByPage = new Map();
  const tally = new Map();
  for (const h of headers) {
    const d = parseHeaderDates(h.dates);
    if (!d) continue;
    datesByPage.set(Number(h.page), d);
    const k = `${d.validFrom}|${d.validUntil}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dates = common ? { validFrom: common.split('|')[0], validUntil: common.split('|')[1] } : null;
  const datesOf = (page) => datesByPage.get(Number(page)) ?? dates;
  const checked = offers.filter((o) => o.check === 'ok').length;
  console.log(`🗞️ Discount Markt leaflet: ${readings.length} readings → ${offers.length} offers (${checked} confirmed by the printed unit price), ${dropped.length} left out`);
  console.log(`   dates: ${dates ? `${dates.validFrom} → ${dates.validUntil}` : 'none printed — default end date'}${[...datesByPage].filter(([, d]) => `${d.validFrom}|${d.validUntil}` !== common).map(([p, d]) => `; p${p}: ${d.validFrom} → ${d.validUntil}`).join('')}`);
  for (const d of dropped) console.log(`   left out p${d.o.page ?? '?'}: ${d.o.name} — ${d.why}`);
  if (offers.length === 0) throw new Error('nothing to import');

  // Product photos cut out of the pages (the readers' `photo` boxes) and
  // stored in the R2 image bucket; offers without a box keep the category icon.
  const pagesDir = process.env.PAGES_DIR || path.dirname(process.env.META || files[0]);
  // The photo reviewer's verdict: crops that do not show the named product
  // (numbers on the contact sheets → item codes) keep the icon instead.
  if (process.env.PHOTO_REJECT) {
    const rejected = JSON.parse(fs.readFileSync(process.env.PHOTO_REJECT, 'utf8'));
    const index = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.PHOTO_REJECT), 'photo-sheets.json'), 'utf8'));
    const codes = new Set((Array.isArray(rejected) ? rejected : []).map((n) => index[n]).filter(Boolean));
    for (const o of offers) if (codes.has(o.code)) o.photo = null;
    console.log(`   photo reviewer rejected ${codes.size} crops`);
  }
  await attachPhotos(offers, pagesDir);

  const { ingestCatalog } = await import('./lib/ingest-catalog.mjs');
  const { ingestOffers, printReport } = await import('./lib/ingest-offers.mjs');
  // The store's products, by their stable code. baseline:false — a leaflet
  // price is an offer, never a shelf price.
  const cat = await ingestCatalog({
    chain: 'discountmarkt',
    items: offers.map((o) => ({ chainItemcode: o.code, name: o.name, price: o.price, imageUrl: o.imageUrl ?? null, baseline: false })),
    dryRun: DRY_RUN,
  });
  console.log(`   products: ${cat.created} created, ${cat.existing} existing`);
  const report = await ingestOffers({
    chain: 'discountmarkt',
    source: 'leaflet',
    items: offers.map((o) => ({
      name: o.name,
      price: o.price,
      originalPrice: o.originalPrice,
      chainItemcode: o.code,
      category: null,
      imageUrl: o.imageUrl ?? null,
      validFrom: datesOf(o.page)?.validFrom,
      validUntil: datesOf(o.page)?.validUntil,
      description: o.note,
      offerType: o.originalPrice ? 'strikethrough' : 'mono',
    })),
    dryRun: DRY_RUN,
    // The readers covered every page, so the list is complete: last week's
    // offers that are not in it end.
    siteTotal: offers.length,
  });
  printReport(report);
  // Remember the leaflet so the daily job does not read it again.
  if (!DRY_RUN && report.healthOk && process.env.META) {
    const meta = JSON.parse(fs.readFileSync(process.env.META, 'utf8'));
    const { default: prisma } = await import('../lib/prisma.ts');
    await prisma.scraperState.upsert({
      where: { key: STATE_KEY },
      create: { key: STATE_KEY, value: meta.sha1, note: `${meta.pdfUrl} · ${offers.length} offers` },
      update: { value: meta.sha1, note: `${meta.pdfUrl} · ${offers.length} offers` },
    });
    console.log(`   remembered leaflet ${meta.sha1.slice(0, 10)} (${meta.pdfUrl})`);
  }
  process.exit(report.healthOk || DRY_RUN ? 0 : 1);
}

(MODE === 'fetch' ? fetchStep() : MODE === 'sheets' ? sheetsStep() : MODE === 'import' ? importStep() : Promise.reject(new Error('MODE=fetch, MODE=sheets or MODE=import')))
  .catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
