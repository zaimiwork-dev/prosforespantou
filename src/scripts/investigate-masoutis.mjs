import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const URL = 'https://www.masoutis.gr/categories/index/prosfores?item=0';

async function checkAllOffers() {
  console.log(`🌐 Fetching all offers from: ${URL}`);
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

    // Look for the leaflet filter in the UI
    const filters = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, a, button, .accordion-header, span'));
      return labels
        .filter(el => el.textContent.includes('Φυλλαδί') || el.textContent.includes('ΦΥΛΛΑΔΙ'))
        .map(el => ({
            text: el.textContent.trim(), 
            tag: el.tagName, 
            html: el.outerHTML.substring(0, 150)
        }));
    });
    console.log('\n🔍 Found leaflet filters in UI:', filters);

    console.log('\n⏳ Scrolling to the absolute bottom (this might take a minute)...');
    let lastCount = 0;
    let stableTicks = 0;
    while (stableTicks < 3) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const count = await page.locator('.product').count();
      if (count === lastCount) stableTicks++;
      else { stableTicks = 0; lastCount = count; }
      process.stdout.write(`\r📦 Products loaded so far: ${count}`);
    }
    console.log(`\n\n✅ Final absolute total products on page: ${lastCount}`);

  } catch (err) {
    console.error(`\n❌ Script failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

checkAllOffers();
