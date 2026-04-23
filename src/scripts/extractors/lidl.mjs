import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

chromium.use(stealth());

const OUTPUT_FILE = './pending_lidl_deals.json';

async function extractLidl() {
  console.log('🤖 Extractor Agent: Starting Lidl Scraper...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to Lidl Hellas offers page
  const url = 'https://www.lidl-hellas.gr/c/trehousses-prosfores/a10008785';
  console.log(`🌐 Navigating to ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Lidl has a cookie banner, try to accept it if it appears
  try {
    const cookieButton = page.locator('button.cookie-alert-extended-button').first();
    if (await cookieButton.isVisible({ timeout: 5000 })) {
      await cookieButton.click();
      console.log('🍪 Accepted cookies.');
    }
  } catch (e) {
    // Ignore if not found
  }

  // Scroll down to load lazy images
  console.log('📜 Scrolling to load images...');
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(500);
  }

  console.log('🔍 Extracting deals...');
  
  // Lidl product cards usually have specific article classes
  const products = await page.evaluate(() => {
    const deals = [];
    // The exact class names change frequently, but they usually use standard article tags
    const cards = document.querySelectorAll('article.ret-o-card, article.product-grid-box');
    
    cards.forEach(card => {
      // Name
      const nameEl = card.querySelector('h3, .ret-o-card__headline');
      if (!nameEl) return;
      const rawName = nameEl.innerText.trim();
      
      // Discounted Price
      const priceEl = card.querySelector('.m-price__price');
      let discountedPrice = null;
      if (priceEl) {
         const match = priceEl.innerText.match(/(\d+[,.]\d+)/);
         if (match) discountedPrice = parseFloat(match[1].replace(',', '.'));
      }
      
      // Original Price (usually strikethrough)
      const oldPriceEl = card.querySelector('.m-price__rrp, s');
      let originalPrice = null;
      if (oldPriceEl) {
         const match = oldPriceEl.innerText.match(/(\d+[,.]\d+)/);
         if (match) originalPrice = parseFloat(match[1].replace(',', '.'));
      }
      
      // Image
      const imgEl = card.querySelector('img');
      let imageUrl = null;
      if (imgEl) {
         imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src');
      }
      
      if (rawName && discountedPrice && imageUrl) {
        deals.push({
          rawName,
          rawPrice: discountedPrice,
          originalPrice,
          imageUrl,
          supermarket: 'lidl',
          category: 'Άλλο'
        });
      }
    });
    
    return deals;
  });

  console.log(`✅ Extractor Agent: Pulled ${products.length} deals from Lidl.`);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2));
  console.log(`💾 Saved to ${OUTPUT_FILE}. Ready for the Matcher Agent.`);
  
  await browser.close();
}

extractLidl().catch(console.error);