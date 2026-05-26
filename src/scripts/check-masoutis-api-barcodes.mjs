import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const URL = 'https://www.masoutis.gr/categories/index/prosfores?item=0';

async function checkMasoutisBarcodes() {
  console.log(`🌐 Going to Masoutis: ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let itemsChecked = 0;
  let itemsWithBarcode = 0;
  const targetCount = 100;

  // Intercept all JSON responses
  page.on('response', async (response) => {
    const url = response.url();
    // We don't know the exact endpoint Masoutis uses, so we check any JSON response
    if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
            try {
                const json = await response.json();
                
                // Masoutis might wrap data differently. Let's look for arrays of objects.
                const scanForItems = (obj) => {
                    if (itemsChecked >= targetCount) return;
                    
                    if (Array.isArray(obj)) {
                        obj.forEach(scanForItems);
                    } else if (typeof obj === 'object' && obj !== null) {
                        // Is this a product object? Usually has a title, price, or id
                        if (obj.Title || obj.title || obj.Price || obj.price || obj.ProductId || obj.ItemId) {
                            itemsChecked++;
                            
                            const keys = Object.keys(obj);
                            let foundBarcode = null;
                            const searchKeys = ['ean', 'gtin', 'barcode', 'upc', 'sku', 'Barcode', 'Ean', 'EAN'];
                            
                            for (const key of searchKeys) {
                                if (obj[key]) foundBarcode = `${key}: ${obj[key]}`;
                            }

                            if (!foundBarcode) {
                                for (const [key, value] of Object.entries(obj)) {
                                    if ((typeof value === 'string' || typeof value === 'number') && /^[0-9]{13}$/.test(String(value))) {
                                        foundBarcode = `Hidden in '${key}': ${value}`;
                                    }
                                }
                            }

                            if (foundBarcode) {
                                const name = obj.Title || obj.title || obj.Description || obj.Name || 'Unknown';
                                console.log(`\n✅ Found Barcode! Product: ${String(name).substring(0, 40)}`);
                                console.log(`   -> ${foundBarcode}`);
                                itemsWithBarcode++;
                            }

                            if (itemsChecked === 1) {
                                console.log(`\n🔍 Structure of a Masoutis API item:`);
                                console.log(`   Available keys: ${keys.join(', ')}`);
                            }
                        } else {
                            // Recursively scan values
                            Object.values(obj).forEach(scanForItems);
                        }
                    }
                };

                scanForItems(json);
            } catch (e) {
                // Ignore parse errors
            }
        }
    }
  });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    console.log(`⏳ Waiting for API responses and scrolling to load items...`);
    
    // Scroll a bit to trigger lazy loading
    for (let i = 0; i < 10; i++) {
        if (itemsChecked >= targetCount) break;
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
        process.stdout.write(`\rChecked ${itemsChecked}/${targetCount} items...`);
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`Checked ${itemsChecked} items via API interception.`);
    if (itemsWithBarcode > 0) {
        console.log(`Found barcodes in ${itemsWithBarcode} items! (${Math.round((itemsWithBarcode/itemsChecked)*100)}%)`);
    } else {
        console.log(`❌ No barcodes found in the first ${itemsChecked} items.`);
        console.log(`Masoutis API might not be exposing EANs directly to the frontend.`);
    }

  } catch (err) {
    console.error(`\n❌ Script failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

checkMasoutisBarcodes();
