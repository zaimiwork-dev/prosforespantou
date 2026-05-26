import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

const URL = process.argv[2] || 'https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=1&subdescr=prosfores-ebdomadas';
const LABEL = process.argv[3] || 'masoutis';
const OUT_DIR = `./library_data/barcode_probe_${LABEL}`;

const EAN13 = /(?<!\d)\d{13}(?!\d)/g;
const EAN8 = /(?<!\d)\d{8}(?!\d)/g;

function findBarcodes(text, label) {
  if (!text) return [];
  const hits = [];
  for (const m of String(text).matchAll(EAN13)) hits.push({ kind: 'EAN-13', value: m[0], label });
  for (const m of String(text).matchAll(EAN8)) hits.push({ kind: 'EAN-8', value: m[0], label });
  return hits;
}

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
  });
  const page = await context.newPage();

  const captured = [];
  const candidates = [];

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      const status = res.status();
      if (status >= 400) return;

      const interesting =
        ct.includes('json') ||
        /api|product|offer|categor|search|graphql/i.test(url);
      if (!interesting) return;

      let body = '';
      try { body = await res.text(); } catch { return; }
      if (!body) return;

      captured.push({ url, status, contentType: ct, length: body.length });

      const hits = findBarcodes(body, url);
      if (hits.length) {
        candidates.push({ url, contentType: ct, sampleHits: hits.slice(0, 5), bodyPreview: body.slice(0, 600) });
      }
    } catch {}
  });

  console.log(`🌐 Loading ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  try {
    await page.waitForSelector('.product, [class*="product"], [class*="Product"]', { state: 'attached', timeout: 15000 });
  } catch {
    console.log('   (no product-like selector found — continuing with XHR capture only)');
  }
  await page.waitForTimeout(4000);

  // Dump the first product node's outerHTML so we can see every data-* attribute
  const firstProductHtml = await page.evaluate(() => {
    const el = document.querySelector('.product');
    return el ? el.outerHTML : null;
  });
  if (firstProductHtml) {
    fs.writeFileSync(path.join(OUT_DIR, 'first_product_node.html'), firstProductHtml);
    const inNodeHits = findBarcodes(firstProductHtml, 'first .product node');
    console.log(`\n🔎 First .product node: saved (${firstProductHtml.length} bytes). Barcode-like hits inside it: ${inNodeHits.length}`);
    inNodeHits.slice(0, 5).forEach((h) => console.log(`   • ${h.kind} ${h.value}`));
  }

  // Inspect ALL data-* attributes Masoutis puts on product nodes
  const dataAttrs = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.product').forEach((el, idx) => {
      if (idx >= 3) return;
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      const inner = {};
      el.querySelectorAll('[data-id], [data-product], [data-sku], [data-code], [data-barcode], [data-ean]').forEach((c) => {
        for (const a of c.attributes) if (a.name.startsWith('data-')) inner[a.name] = a.value;
      });
      out[`product_${idx}`] = { rootAttrs: attrs, innerDataAttrs: inner };
    });
    return out;
  });
  fs.writeFileSync(path.join(OUT_DIR, 'data_attrs.json'), JSON.stringify(dataAttrs, null, 2));
  console.log(`\n📋 data-* attributes for first 3 products saved to data_attrs.json`);

  // Try clicking into the first product to see if a detail page / detail XHR exposes more
  console.log(`\n🖱️  Clicking into first product to capture detail-page traffic...`);
  try {
    const link = await page.evaluate(() => {
      const el = document.querySelector('.product a[href], .product');
      if (!el) return null;
      const href = el.getAttribute && el.getAttribute('href');
      return href || null;
    });
    if (link) {
      const detailUrl = link.startsWith('http') ? link : `https://www.masoutis.gr${link}`;
      console.log(`   → ${detailUrl}`);
      await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(2500);
      const detailHtml = await page.content();
      fs.writeFileSync(path.join(OUT_DIR, 'product_detail.html'), detailHtml);
      const detailHits = findBarcodes(detailHtml, 'detail page HTML');
      console.log(`   Detail HTML saved (${detailHtml.length} bytes). Barcode-like hits: ${detailHits.length}`);
      detailHits.slice(0, 10).forEach((h) => console.log(`     • ${h.kind} ${h.value}`));
    } else {
      console.log('   (no clickable product link found)');
    }
  } catch (e) {
    console.log(`   detail navigation failed: ${e.message}`);
  }

  // Summary
  console.log(`\n📡 XHR/Fetch responses captured: ${captured.length}`);
  captured.slice(0, 20).forEach((c) => console.log(`   ${c.status}  ${c.contentType.padEnd(30)}  ${c.url}`));

  console.log(`\n🎯 Responses containing barcode-shaped numbers: ${candidates.length}`);
  candidates.slice(0, 5).forEach((c, i) => {
    console.log(`\n--- candidate #${i + 1} ---`);
    console.log(`URL: ${c.url}`);
    console.log(`Content-Type: ${c.contentType}`);
    console.log(`Sample hits: ${c.sampleHits.map((h) => `${h.kind}=${h.value}`).join(', ')}`);
    console.log(`Preview: ${c.bodyPreview.replace(/\s+/g, ' ').slice(0, 400)}...`);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'captured_responses.json'), JSON.stringify(captured, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'barcode_candidates.json'), JSON.stringify(candidates, null, 2));
  console.log(`\n📁 Full output in ${OUT_DIR}`);

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
