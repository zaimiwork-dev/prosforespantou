// Find Wolt's per-category items endpoint by loading the Masoutis venue page,
// scrolling/clicking into categories, and capturing every XHR that returns items.

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

const VENUE_URL = 'https://wolt.com/el/grc/thessaloniki/venue/masoutis-makedonias';
const OUT_DIR = './library_data/barcode_probe_wolt';
const GREEK_EAN = /(?<!\d)1?52[01]\d{10}(?!\d)/g;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
  });
  const page = await context.newPage();

  // Track every JSON response: URL + size + item-count + has-GTIN
  const responses = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('json')) return;
      if (res.status() !== 200) return;
      const text = await res.text();
      if (!text) return;
      // Quick stats without full parse first
      const greekEans = [...new Set([...text.matchAll(GREEK_EAN)].map((m) => m[0]))];
      const itemMatches = [...text.matchAll(/"id"\s*:\s*"[a-f0-9]{24}"/g)].length;
      const hasBarcodeGtinField = /"barcode_gtin"\s*:/i.test(text);
      if (greekEans.length || hasBarcodeGtinField) {
        responses.push({ url, size: text.length, itemMatches, greekEansCount: greekEans.length, hasBarcodeGtinField, sampleEans: greekEans.slice(0, 3) });
      }
    } catch {}
  });

  console.log(`🌐 Loading ${VENUE_URL}`);
  await page.goto(VENUE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Try to dismiss any cookie/age banners
  for (const sel of ['button:has-text("Αποδοχή")', 'button:has-text("Accept")', '[data-test-id="cookie-banner-accept"]', 'button[aria-label*="ccept"]']) {
    try { const btn = await page.$(sel); if (btn) { await btn.click({ timeout: 1500 }); console.log(`   dismissed ${sel}`); break; } } catch {}
  }
  await page.waitForTimeout(1500);

  // Scroll the page slowly to trigger category-by-category item loads
  console.log('📜 Scrolling to trigger lazy-loaded category items...');
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(700);
    process.stdout.write(`\r   scroll ${i + 1}/25 — XHR with GTIN data so far: ${responses.length}`);
  }
  console.log('');

  // Also click each category in the sidebar/menu if present
  console.log('\n🖱️  Trying to click each category in sidebar...');
  try {
    const catNames = await page.$$eval('a[href*="/items?"], [data-test-id*="category"], a[href*="/category"]', (els) =>
      els.slice(0, 30).map((e) => ({ text: e.textContent?.trim()?.slice(0, 40), href: e.getAttribute('href') }))
    );
    console.log(`   found ${catNames.length} category-like links`);
    let clicked = 0;
    for (const c of catNames.slice(0, 8)) {
      try {
        await page.locator(`a[href="${c.href}"]`).first().click({ timeout: 2000 });
        await page.waitForTimeout(1500);
        clicked++;
      } catch {}
    }
    console.log(`   clicked ${clicked} categories`);
  } catch (e) { console.log(`   could not enumerate categories: ${e.message}`); }
  await page.waitForTimeout(2000);

  console.log(`\n📡 JSON responses with GTIN data: ${responses.length}\n`);

  // Group by unique base URL (strip query string)
  const byBase = new Map();
  for (const r of responses) {
    const base = r.url.split('?')[0];
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(r);
  }
  for (const [base, rs] of byBase) {
    const totalEans = rs.reduce((s, r) => s + r.greekEansCount, 0);
    const totalItems = rs.reduce((s, r) => s + r.itemMatches, 0);
    const totalBytes = rs.reduce((s, r) => s + r.size, 0);
    console.log(`🔗 ${base}`);
    console.log(`   ${rs.length} hits · ~${totalItems} item-id matches · ${totalEans} Greek EANs · ${(totalBytes/1024).toFixed(0)}KB total · barcode_gtin field: ${rs.some((r) => r.hasBarcodeGtinField)}`);
    if (rs[0].sampleEans?.length) console.log(`   sample EANs: ${rs[0].sampleEans.join(', ')}`);
    // Show a sample full URL to see what query params Wolt uses
    if (rs[0].url !== base) console.log(`   sample full URL: ${rs[0].url}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'category_items_endpoints.json'), JSON.stringify(responses, null, 2));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
