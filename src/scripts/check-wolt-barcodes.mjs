import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const URL = 'https://wolt.com/el/grc/thessaloniki/venue/masoutis-makedonias';

async function checkWoltBarcodes() {
  console.log(`🌐 Going to Wolt: ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let itemsChecked = 0;
  let itemsWithBarcode = 0;
  const targetCount = 100;

  // Intercept responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/menu/categories/') || url.includes('/venue/')) {
      try {
        const json = await response.json();
        
        const checkItem = (item) => {
          if (itemsChecked >= targetCount) return;
          if (!item || !item.name) return;
          
          itemsChecked++;
          
          // Dump all keys of the item to see what's available
          const keys = Object.keys(item);
          
          // Look for obvious barcode keys
          let foundBarcode = null;
          const searchKeys = ['ean', 'gtin', 'barcode', 'upc', 'sku'];
          
          for (const key of searchKeys) {
              if (item[key]) foundBarcode = `${key}: ${item[key]}`;
          }

          // If not in standard keys, search all string values for a 13-digit number
          if (!foundBarcode) {
              for (const [key, value] of Object.entries(item)) {
                  if (typeof value === 'string' && /^[0-9]{13}$/.test(value)) {
                      foundBarcode = `Hidden in '${key}': ${value}`;
                  }
              }
          }

          if (foundBarcode) {
              console.log(`\n✅ Found Barcode! Product: ${item.name.substring(0, 40)}`);
              console.log(`   -> ${foundBarcode}`);
              itemsWithBarcode++;
          }

          // Print the raw keys of the first item just so we can see the structure
          if (itemsChecked === 1) {
              console.log(`\n🔍 Structure of a Wolt item (first item checked):`);
              console.log(`   Name: ${item.name}`);
              console.log(`   Available keys: ${keys.join(', ')}`);
          }
        };

        if (json.items) json.items.forEach(checkItem);
        if (json.sections) json.sections.forEach(s => { if(s.items) s.items.forEach(checkItem) });
        if (json.categories) json.categories.forEach(c => { if(c.items) c.items.forEach(checkItem) });

      } catch (e) {
        // Not JSON
      }
    }
  });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    console.log(`⏳ Waiting for API responses and scrolling to load items...`);
    
    // Scroll a bit to trigger category loads
    for (let i = 0; i < 5; i++) {
        if (itemsChecked >= targetCount) break;
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1000);
        process.stdout.write(`\rChecked ${itemsChecked}/${targetCount} items...`);
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`Checked ${itemsChecked} items.`);
    if (itemsWithBarcode > 0) {
        console.log(`Found barcodes in ${itemsWithBarcode} items! (${Math.round((itemsWithBarcode/itemsChecked)*100)}%)`);
    } else {
        console.log(`❌ No barcodes found in the first ${itemsChecked} items.`);
        console.log(`Wolt might not be sending EANs for Masoutis in this API endpoint.`);
    }

  } catch (err) {
    console.error(`\n❌ Script failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

checkWoltBarcodes();
