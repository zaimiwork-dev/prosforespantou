// One-shot discovery: what API call returns a Masoutis CATEGORY's full product
// list (not just promos), and does each item carry a barcode/price/image?
// Browses a real category in a headless browser and logs the eshop API calls +
// the shape of the product objects. Read the output, then build a plain-fetch
// masoutis-catalog.mjs feeder from it.

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());

const seen = []; // { url, body, count, sampleKeys, sample }

function looksLikeProduct(o) {
  return o && typeof o === 'object' && (o.ItemDescr || o.ItemcodeDescr || o.Itemcode != null) && (o.PosPrice != null || o.StartPrice != null || o.Price != null);
}

function scan(json) {
  let best = null;
  const walk = (o) => {
    if (Array.isArray(o)) {
      const prods = o.filter(looksLikeProduct);
      if (prods.length && (!best || prods.length > best.count)) {
        best = { count: prods.length, sample: prods[0], sampleKeys: Object.keys(prods[0]) };
      }
      o.forEach(walk);
    } else if (o && typeof o === 'object') {
      Object.values(o).forEach(walk);
    }
  };
  walk(json);
  return best;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  page.on('response', async (res) => {
    const url = res.url();
    if (!/\/api\/eshop\//i.test(url)) return;
    const ct = res.headers()['content-type'] || '';
    if (!/json/i.test(ct)) return;
    try {
      const json = await res.json();
      const best = scan(json);
      let body = null;
      try { body = res.request().postData(); } catch {}
      if (best) seen.push({ url: url.replace(/^https?:\/\/[^/]+/, ''), body, count: best.count, sampleKeys: best.sampleKeys, sample: best.sample });
    } catch {}
  });

  console.log('→ homepage');
  await page.goto('https://www.masoutis.gr/', { waitUntil: 'networkidle', timeout: 60000 });

  // Find a real (non-promo) category link.
  const hrefs = await page.$$eval('a[href*="/categories/index/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => h && !/prosfores/i.test(h)));
  console.log(`   category links found: ${hrefs.length}`);
  const target = hrefs[0];
  if (target) {
    const full = target.startsWith('http') ? target : `https://www.masoutis.gr${target}`;
    console.log(`→ category: ${full}`);
    await page.goto(full, { waitUntil: 'networkidle', timeout: 60000 });
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, 1200)); await page.waitForTimeout(1500); }
  }

  await browser.close();

  console.log(`\n📊 eshop product-list calls captured: ${seen.length}`);
  // Show the biggest product-list response (most likely the catalog endpoint).
  seen.sort((a, b) => b.count - a.count);
  for (const s of seen.slice(0, 4)) {
    console.log(`\n── ${s.url}  (${s.count} products)`);
    if (s.body) console.log(`   body: ${String(s.body).slice(0, 300)}`);
    console.log(`   item keys: ${s.sampleKeys.join(', ')}`);
    const x = s.sample;
    console.log(`   sample: Itemcode=${x.Itemcode} name=${(x.ItemDescr||'').slice(0,30)} PosPrice=${x.PosPrice} StartPrice=${x.StartPrice} barcode=${x.Barcode||x.Ean||x.EAN||x.Gtin||'?'} photo=${(x.PhotoData||x.PhotoLink||'').toString().slice(0,40)}`);
  }
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
