// Capture ALL JSON XHR responses on Wolt venue page + dump every link href.
// Then directly navigate to one category URL to see what loads.

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

const VENUE_URL = 'https://wolt.com/el/grc/thessaloniki/venue/masoutis-makedonias';
const OUT_DIR = './library_data/barcode_probe_wolt';

async function captureSession(label) {
  const allResponses = [];
  return {
    handler: async (res) => {
      try {
        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if (!ct.includes('json')) return;
        if (res.status() !== 200) return;
        const url = res.url();
        const text = await res.text();
        if (!text || text.length < 100) return;
        allResponses.push({ url, size: text.length, hasGtin: /"barcode_gtin"\s*:/i.test(text), itemMatches: (text.match(/"id"\s*:\s*"[a-f0-9]{24}"/g) || []).length });
      } catch {}
    },
    finish: () => {
      console.log(`\n[${label}] captured ${allResponses.length} JSON responses ≥100 bytes`);
      allResponses
        .sort((a, b) => b.size - a.size)
        .slice(0, 25)
        .forEach((r) => {
          const tag = r.hasGtin ? '🎯' : r.itemMatches > 5 ? '📦' : '  ';
          console.log(`  ${tag} ${String(r.size).padStart(7)}b items=${String(r.itemMatches).padStart(4)} ${r.url.slice(0, 130)}`);
        });
      return allResponses;
    },
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
    geolocation: { latitude: 40.6401, longitude: 22.9444 }, // Thessaloniki
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  // --- Phase 1: venue landing ---
  const cap1 = await captureSession('venue landing');
  page.on('response', cap1.handler);

  console.log(`🌐 ${VENUE_URL}`);
  await page.goto(VENUE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  // Accept cookies if present
  for (const sel of ['button:has-text("Αποδοχή")', 'button:has-text("Accept")']) {
    try { const b = await page.$(sel); if (b) await b.click({ timeout: 1000 }); } catch {}
  }
  await page.waitForTimeout(3000);

  // Dump all <a href> with their text — find category links
  const links = await page.$$eval('a[href]', (els) =>
    els.map((e) => ({ href: e.getAttribute('href') || '', text: (e.textContent || '').trim().slice(0, 50) }))
       .filter((l) => l.href.includes('masoutis-makedonias') || l.href.includes('itemcategory') || l.href.includes('items'))
  );
  const unique = Array.from(new Map(links.map((l) => [l.href, l])).values());
  console.log(`\n🔗 ${unique.length} venue-related links found. Samples:`);
  unique.slice(0, 30).forEach((l) => console.log(`   ${l.href.slice(0, 110)}   "${l.text}"`));

  cap1.finish();

  // --- Phase 2: visit FIRST category-shaped link ---
  page.removeAllListeners('response');
  const cap2 = await captureSession('category page');
  page.on('response', cap2.handler);

  const catLink = unique.find((l) => /itemcategory|category|items/i.test(l.href) && !/itemid/.test(l.href));
  if (catLink) {
    const full = catLink.href.startsWith('http') ? catLink.href : `https://wolt.com${catLink.href}`;
    console.log(`\n🌐 navigating to category: ${full}`);
    await page.goto(full, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(4000);
    // Scroll to load lazy items
    for (let i = 0; i < 8; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await page.waitForTimeout(700); }
    cap2.finish();
  } else {
    console.log('\n⚠️  no obvious category link found');
  }

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
