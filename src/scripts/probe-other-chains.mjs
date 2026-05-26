// Probe other Greek supermarket sites for hidden EAN/GTIN data.
// Loads each chain's homepage (and any obvious offers page link), captures
// every JSON XHR response, and looks for:
//   - Greek EAN-13 prefixes (520xxx, 521xxx) — strongest signal, low false positives
//   - field names "ean" / "gtin" / "barcode" in response bodies
//
// Usage: node probe-other-chains.mjs <label> <url>

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

const LABEL = process.argv[2] || 'unknown';
const URL = process.argv[3];
if (!URL) { console.error('Usage: node probe-other-chains.mjs <label> <url>'); process.exit(1); }

const OUT_DIR = `./library_data/barcode_probe_${LABEL}`;
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const GREEK_EAN = /(?<!\d)52[01]\d{10}(?!\d)/g;
const LABEL_RE = /\b(?:barcode_gtin|gtin13|ean13|productBarcode|itemBarcode)\b|"(?:barcode|gtin|ean)"\s*:/gi;

const findings = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
    geolocation: { latitude: 40.6401, longitude: 22.9444 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  page.on('response', async (res) => {
    try {
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      const status = res.status();
      if (status >= 400) return;
      if (!ct.includes('json') && !ct.includes('javascript')) return;
      const text = await res.text();
      if (!text || text.length < 100) return;
      const greekEans = [...new Set([...text.matchAll(GREEK_EAN)].map((m) => m[0]))];
      const labels = [...new Set([...text.matchAll(LABEL_RE)].map((m) => m[0]))];
      if (greekEans.length || labels.length) {
        findings.push({ url: res.url(), ct, size: text.length, greekEans: greekEans.slice(0, 8), labels: labels.slice(0, 8) });
      }
    } catch {}
  });

  console.log(`🌐 [${LABEL}] loading ${URL}`);
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.log(`   navigation note: ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(3000);

  // Dismiss common cookie banners
  for (const sel of ['button:has-text("Αποδοχή")', 'button:has-text("Αποδέχομαι")', 'button:has-text("Accept")', 'button:has-text("ΑΠΟΔΟΧΗ")', 'button:has-text("Συμφωνώ")', '[id*="ccept"]', '[aria-label*="ccept"]']) {
    try { const b = await page.$(sel); if (b) { await b.click({ timeout: 1500 }); await page.waitForTimeout(500); break; } } catch {}
  }

  // Try to find an offers link and follow it
  for (const linkText of ['Προσφορές', 'Προσφορες', 'PROSFORES', 'Φυλλάδιο', 'Offers', 'Deals']) {
    try {
      const link = await page.$(`a:has-text("${linkText}")`);
      if (link) {
        console.log(`   following link "${linkText}"`);
        await link.click({ timeout: 3000 });
        await page.waitForTimeout(4000);
        break;
      }
    } catch {}
  }

  // Scroll to lazy-load any product XHRs
  for (let i = 0; i < 10; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 1200)); } catch {}
    await page.waitForTimeout(600);
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, 'findings.json'), JSON.stringify(findings, null, 2));

  console.log(`\n📊 [${LABEL}] findings: ${findings.length} JSON/JS responses with EAN-shaped data or EAN field labels`);
  const withEans = findings.filter((f) => f.greekEans.length > 0);
  const withLabels = findings.filter((f) => f.labels.length > 0);
  console.log(`   with Greek-prefix EAN-13 in body: ${withEans.length}`);
  console.log(`   with EAN-related field labels:    ${withLabels.length}`);

  if (withEans.length) {
    console.log(`\n🎯 [${LABEL}] PROMISING — Greek EANs found in these URLs:`);
    withEans.slice(0, 5).forEach((f) => {
      console.log(`   ${f.url.slice(0, 120)}`);
      console.log(`     sample EANs: ${f.greekEans.slice(0, 5).join(', ')}`);
      console.log(`     labels: ${f.labels.slice(0, 5).join(', ') || '(none)'}`);
    });
  } else {
    console.log(`\n⚠️ [${LABEL}] no Greek EAN-13 found in any XHR response.`);
  }
}

run().catch((e) => { console.error(`[${LABEL}] error:`, e.message); process.exit(1); });
