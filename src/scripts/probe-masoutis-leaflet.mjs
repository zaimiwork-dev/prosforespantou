import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const url = 'https://www.masoutis.gr/categories/index/prosfores?item=0&subitem=2';
console.log(`Loading ${url}...`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

// Scroll to load more
let lastCount = 0;
for (let i = 0; i < 25; i++) {
  await page.evaluate(() => window.scrollBy(0, 2000));
  await page.waitForTimeout(700);
  const count = await page.evaluate(() => document.querySelectorAll('.product').length);
  if (count === lastCount && count > 0) break;
  lastCount = count;
}

const stats = await page.evaluate(() => ({
  products: document.querySelectorAll('.product').length,
  withStartPrice: document.querySelectorAll('.product .pStartPrice').length,
  withDscntPrice: document.querySelectorAll('.product .pDscntPrice').length,
  withImage: document.querySelectorAll('.product .productImage').length,
  withTitle: document.querySelectorAll('.product .productTitle').length,
  sampleHtml: document.querySelector('.product')?.outerHTML?.slice(0, 1500) || '(none)',
}));
console.log('Stats:', JSON.stringify({ ...stats, sampleHtml: undefined }, null, 2));
console.log('\nFirst .product card HTML:\n', stats.sampleHtml);

await browser.close();
