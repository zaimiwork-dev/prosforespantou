import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

// "Προσφορές Φυλλαδίου" = leaflet weekly offers. Same Angular DOM as the
// /prosfores-ebdomadas page (.product / .pStartPrice / .pDscntPrice), so the
// extractor can reuse the same selectors — only the URL and file prefix change.
const URL = 'https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=2';
const OUT_DIR = './library_data';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_FILE = path.join(OUT_DIR, `masoutis_leaflet_${DATE}.html`);

async function fetcher() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`🌐 Fetching masoutis.gr leaflet offers → ${OUT_FILE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'el-GR',
  });
  const page = await context.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('.product', { state: 'attached', timeout: 30000 });

    let lastCount = 0;
    let stableTicks = 0;
    while (stableTicks < 3) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const count = await page.locator('.product').count();
      if (count === lastCount) stableTicks++;
      else { stableTicks = 0; lastCount = count; }
      process.stdout.write(`\r📦 Products loaded: ${count}`);
    }
    console.log('');

    const html = await page.content();
    fs.writeFileSync(OUT_FILE, html);

    const stats = await page.evaluate(() => {
      const products = document.querySelectorAll('.product');
      let withDiscount = 0;
      products.forEach((p) => { if (p.querySelector('.pStartPrice')) withDiscount++; });
      return { total: products.length, withDiscount };
    });

    console.log(`✅ Saved ${(html.length / 1024).toFixed(1)} KB`);
    console.log(`📊 .product nodes: ${stats.total} (${stats.withDiscount} have .pStartPrice = original price)`);

    if (stats.total === 0) {
      console.warn('⚠️  No .product nodes found — page structure may have changed.');
      await page.screenshot({ path: `./masoutis_leaflet_fetch_warn_${DATE}.png`, fullPage: true });
      process.exit(2);
    }
  } catch (err) {
    console.error(`❌ Leaflet fetcher failed: ${err.message}`);
    try { await page.screenshot({ path: `./masoutis_leaflet_fetch_error_${DATE}.png`, fullPage: true }); } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

fetcher();
