// Probe a single Wolt product detail page for GTIN ("Παγκόσμιος Αριθμός Αναγνώρισης Εμπορίου").
// Captures all XHR/Fetch responses, dumps rendered HTML, and scans both for GTIN-13 patterns
// and the literal Greek/English labels.

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

const PRODUCT_URL = process.argv[2] ||
  'https://wolt.com/el/grc/thessaloniki/venue/masoutis-makedonias/kris-kris-pswmi-tost-starenio-se-fetes-700gr-itemid-63b2d1bcd933777ec2e073e7';

const OUT_DIR = './library_data/barcode_probe_wolt';
const GTIN13 = /(?<!\d)\d{13}(?!\d)/g;
const GTIN_LABEL = /Παγκόσμιος\s*Αριθμός|Αναγνώρισης\s*Εμπορίου|GTIN|EAN|barcode|gtin|ean/gi;

function findHits(text, label) {
  if (!text) return { gtinNumbers: [], labels: [] };
  const gtinNumbers = [...String(text).matchAll(GTIN13)].map((m) => m[0]);
  const labels = [...String(text).matchAll(GTIN_LABEL)].map((m) => m[0]);
  return { gtinNumbers: [...new Set(gtinNumbers)], labels: [...new Set(labels)], label };
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
  const gtinResponses = [];
  const labeledResponses = [];

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      const status = res.status();
      if (status >= 400) return;

      const interesting =
        ct.includes('json') ||
        ct.includes('html') ||
        /api|item|venue|product|category|menu/i.test(url);
      if (!interesting) return;

      let body = '';
      try { body = await res.text(); } catch { return; }
      if (!body) return;

      captured.push({ url, status, contentType: ct, length: body.length });

      const hits = findHits(body, url);
      if (hits.gtinNumbers.length) gtinResponses.push({ url, contentType: ct, gtinNumbers: hits.gtinNumbers, preview: body.slice(0, 800) });
      if (hits.labels.length) labeledResponses.push({ url, contentType: ct, labels: hits.labels, preview: body.slice(0, 800) });
    } catch {}
  });

  console.log(`🌐 Loading ${PRODUCT_URL}`);
  await page.goto(PRODUCT_URL, { waitUntil: 'networkidle', timeout: 60000 });
  // Wolt product detail loads in a modal; the URL above opens it directly. Give it time.
  await page.waitForTimeout(6000);

  // Scroll inside whatever modal/page renders, so any lazy-loaded XHR fires
  try { await page.mouse.wheel(0, 600); await page.waitForTimeout(1500); } catch {}

  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'product_page.html'), html);

  const htmlHits = findHits(html, 'rendered HTML');
  console.log(`\n📄 Rendered HTML: ${(html.length / 1024).toFixed(1)} KB`);
  console.log(`   GTIN-13 numbers found in HTML: ${htmlHits.gtinNumbers.length}`);
  htmlHits.gtinNumbers.slice(0, 5).forEach((g) => console.log(`     • ${g}`));
  console.log(`   GTIN labels found in HTML: ${htmlHits.labels.length}`);
  htmlHits.labels.slice(0, 10).forEach((l) => console.log(`     • "${l}"`));

  console.log(`\n📡 XHR/Fetch responses captured: ${captured.length}`);

  console.log(`\n🎯 Responses containing GTIN-13 numbers: ${gtinResponses.length}`);
  gtinResponses.slice(0, 5).forEach((r, i) => {
    console.log(`\n--- gtin response #${i + 1} ---`);
    console.log(`URL: ${r.url}`);
    console.log(`Content-Type: ${r.contentType}`);
    console.log(`GTIN numbers: ${r.gtinNumbers.slice(0, 5).join(', ')}`);
    console.log(`Preview: ${r.preview.replace(/\s+/g, ' ').slice(0, 500)}...`);
  });

  console.log(`\n🏷️  Responses containing GTIN labels: ${labeledResponses.length}`);
  labeledResponses.slice(0, 5).forEach((r, i) => {
    console.log(`\n--- label response #${i + 1} ---`);
    console.log(`URL: ${r.url}`);
    console.log(`Labels: ${r.labels.join(', ')}`);
    console.log(`Preview: ${r.preview.replace(/\s+/g, ' ').slice(0, 500)}...`);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'captured_responses.json'), JSON.stringify(captured, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'gtin_responses.json'), JSON.stringify(gtinResponses, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'labeled_responses.json'), JSON.stringify(labeledResponses, null, 2));
  console.log(`\n📁 Full output saved to ${OUT_DIR}`);

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
