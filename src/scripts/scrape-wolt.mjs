import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

chromium.use(stealth());

async function scrape() {
  const url = process.argv[2];
  const smId = process.argv[3];

  if (!url || !smId) {
    console.error('Usage: node scrape-wolt.mjs <URL> <SM_ID>');
    process.exit(1);
  }

  console.log(`🚀 Starting LIVE OBSERVER scraper for ${smId}...`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  await page.goto(url);

  console.log('\n-----------------------------------------------------------');
  console.log('👉 ACTION REQUIRED:');
  console.log('1. SCROLL SLOWLY from the top to the bottom of the page.');
  console.log('2. Watch this terminal — the count will grow as you scroll.');
  console.log('3. DO NOT CLICK on products, just scroll.');
  console.log('4. When you reach the end and the count stops, press [ENTER].');
  console.log('-----------------------------------------------------------\n');

  const allItems = new Map();

  // Intercept responses to get rich data
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/menu/categories/') || url.includes('/venue/')) {
      try {
        const json = await response.json();
        
        // Handle different possible JSON structures
        const processItems = (items) => {
          if (!items || !Array.isArray(items)) return;
          items.forEach(item => {
            if (item.name && (item.baseprice || item.price)) {
              const discountedPrice = (item.baseprice || item.price) / 100;
              const originalPrice = item.original_baseprice ? item.original_baseprice / 100 : null;
              
              // Wolt JSON usually has 'description' field with the rich text
              allItems.set(item.name, {
                name: item.name,
                description: item.description || "",
                discountedPrice: discountedPrice,
                originalPrice: originalPrice,
                imageUrl: item.image || item.image_url || "",
                id: item.id || ""
              });
              process.stdout.write(`\r📡 [API] Captured ${allItems.size} unique products...`);
            }
          });
        };

        if (json.items) processItems(json.items);
        if (json.sections) json.sections.forEach(s => processItems(s.items));
        if (json.categories) json.categories.forEach(c => processItems(c.items));

      } catch (e) {
        // Not a JSON or other error
      }
    }
  });

  await page.goto(url);

  console.log('\n-----------------------------------------------------------');
  console.log('👉 ACTION REQUIRED:');
  console.log('1. SCROLL through the page categories to trigger API loads.');
  console.log('2. Watch the count grow.');
  console.log('3. Press [ENTER] when you are finished.');
  console.log('-----------------------------------------------------------\n');

  // Wait for user to press Enter
  await new Promise(resolve => process.stdin.once('data', resolve));

  const finalItems = Array.from(allItems.values());
  console.log(`\n\n✅ Final count: ${finalItems.length} products captured.`);

  if (finalItems.length > 0) {
    const capturedData = { 
      sections: [{ 
        items: finalItems.map(item => ({
          name: item.name,
          description: item.description,
          discountedPrice: item.discountedPrice,
          originalPrice: item.originalPrice,
          images: [{ url: item.imageUrl }],
          id: item.id || `wolt-${smId}-${item.name.substring(0, 50).replace(/[^a-z0-9\u0370-\u03FF]/gi, '-').toLowerCase().replace(/-+/g, '-')}`
        }))
      }] 
    };

    const backupFile = `wolt_backup_${smId}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(capturedData, null, 2));
    
    console.log('📤 Syncing to local database directly...');
    try {
      const { default: prisma } = await import('../lib/prisma.ts');
      
      const SM_MAPPING = {
        "ab": "AB Vassilopoulos",
        "lidl": "Lidl",
        "sklavenitis": "Σκλαβενίτης",
        "mymarket": "My Market",
        "masoutis": "Μασούτης",
        "bazaar": "Bazaar",
        "kritikos": "Κρητικός",
        "marketin": "Market In"
      };

      const targetStoreName = SM_MAPPING[smId] || "Άγνωστο";
      let store = await prisma.store.findUnique({ where: { name: targetStoreName } });
      if (!store) store = await prisma.store.create({ data: { name: targetStoreName } });

      let count = 0;
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      for (const item of capturedData.sections[0].items) {
        try {
          const dbProduct = await prisma.product.upsert({
            where: { woltId: item.id },
            update: {
              name: item.name,
              description: item.description,
              imageUrl: item.images?.[0]?.url,
              supermarket: smId,
            },
            create: {
              name: item.name,
              description: item.description,
              imageUrl: item.images?.[0]?.url,
              woltId: item.id,
              supermarket: smId,
              storeId: store.id,
            }
          });

          if (item.discountedPrice !== null) {
            const existing = await prisma.discount.findFirst({
              where: { productId: dbProduct.id, isActive: true }
            });

            if (!existing) {
              await prisma.discount.create({
                data: {
                  productName: dbProduct.name,
                  category: "Άλλο", // Default for scraper
                  discountedPrice: item.discountedPrice,
                  originalPrice: item.originalPrice,
                  description: item.description,
                  validFrom: now,
                  validUntil: nextWeek,
                  storeId: store.id,
                  supermarket: smId,
                  productId: dbProduct.id,
                  isActive: true
                }
              });
            } else {
              await prisma.discount.update({
                where: { id: existing.id },
                data: {
                  discountedPrice: item.discountedPrice,
                  originalPrice: item.originalPrice,
                  description: item.description,
                  validUntil: nextWeek,
                  updatedAt: new Date()
                }
              });
            }
          }
          count++;
        } catch (err) {
          console.error(`❌ Failed ${item.name}:`, err.message);
        }
      }
      console.log(`✨ DONE! Database updated with ${count} items.`);
    } catch (e) {
      console.error('❌ Sync failed:', e.message);
    }
  }

  await browser.close();
  process.exit(0);
}

scrape();
