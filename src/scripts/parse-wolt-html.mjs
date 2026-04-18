import fs from 'fs';
import * as cheerio from 'cheerio';

/**
 * Universal HTML Parser
 * Usage: node src/scripts/parse-wolt-html.mjs <FILENAME> <SUPERMARKET_ID>
 */

const DATA_DIR = './library_data/';
const fileName = process.argv[2];
const smId = process.argv[3] || 'masoutis';
const category = process.argv[4] || 'Άλλο';

async function parse() {
  const filePath = fileName.includes('/') ? fileName : DATA_DIR + fileName;

  if (!fileName || !fs.existsSync(filePath)) {
    console.error(`❌ File not found at: ${filePath}`);
    process.exit(1);
  }

  console.log(`📖 Reading ${filePath} for category: ${category}...`);
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  
  const products = [];
  const seen = new Set();

  $('[data-test-id="ItemCard"]').each((i, el) => {
    const $el = $(el);
    
    // Clean up to avoid noscript HTML in text
    const $cleanEl = $el.clone();
    $cleanEl.find('noscript, script, style').remove();

    const name = $el.find('[data-test-id="ImageCentricProductCard.Title"]').text().trim();
    
    // Extract Prices - more robust
    const priceContainer = $el.find('[data-test-id="ImageCentricProductCardPrice"]');
    const discountedPriceText = priceContainer.find('span').last().text().trim(); // last() usually handles the active price
    const originalPriceText = priceContainer.find('del').text().trim();

    // Extract unit from aria-label if available (e.g., "Τιμή 4,95 €/kg" -> "kg")
    const priceAriaLabel = priceContainer.find('span').last().attr('aria-label') || '';
    const unitMatch = priceAriaLabel.match(/\/(.+)$/);
    const priceUnit = unitMatch ? unitMatch[1].trim() : '';

    const cleanPrice = (txt) => {
      if (!txt) return null;
      // Handle "0,75 €" or similar
      const match = txt.replace('&nbsp;', ' ').match(/(\d+[,.]\d+)/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    };

    const discountedPrice = cleanPrice(discountedPriceText);
    const originalPrice = cleanPrice(originalPriceText);
    
    if (discountedPrice) {
      console.log(`✅ Found: ${name} at ${discountedPrice}€`);
    } else {
      console.log(`❌ No price for: ${name} (Text: "${discountedPriceText}")`);
    }
    
    const imgEl = $el.find('img[data-test-id="ImageCentricProductCard.ProductImage"]');
    const srcset = imgEl.attr('srcset');
    let imageUrl = imgEl.attr('src') || (srcset ? srcset.split(',').pop().trim().split(' ')[0] : '');
    
    // Ensure absolute URL for images
    if (imageUrl && imageUrl.startsWith('./')) {
      // If it's a relative path from a saved HTML file, it's likely broken for the web app
      // unless we serve those files. Let's try to keep it but check if we can get a better one.
    } else if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = 'https://imageproxy.wolt.com' + (imageUrl.startsWith('/') ? '' : '/') + imageUrl;
    }

    // Get clean text for description
    const infoText = $el.find('[data-test-id="ImageCentricProductCardProductInfo"]').text().trim();
    const unitPrice = $el.find('[data-test-id="ImageCentricProductCardUnitPrice"]').text().trim();
    
    // If we have a unit price (like "0,75 €/τμχ."), use it. 
    // If we only have the unit from the main price (like "kg"), use that.
    const displayUnit = unitPrice || (priceUnit ? `τιμή ανά ${priceUnit}` : '');
    const description = [infoText, displayUnit].filter(Boolean).join(' • ') || name;

    if (name && !seen.has(name)) {
      seen.add(name);
      products.push({
        name,
        description,
        discountedPrice,
        originalPrice,
        category,
        images: [{ url: imageUrl }],
        // FIXED: Deterministic ID prevents duplicates and multiple dashes
        id: `wolt-${smId}-${name.substring(0, 50).replace(/[^a-z0-9\u0370-\u03FF]/gi, '-').toLowerCase().replace(/-+/g, '-')}`
      });
    }
  });

  console.log(`✅ Extracted ${products.length} products.`);

  if (products.length > 0) {
    console.log('📤 Syncing to local database directly...');
    
    // Import Prisma - using the same pattern as check-db.mjs
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

    for (const product of products) {
      try {
        // 1. Upsert Product
        const dbProduct = await prisma.product.upsert({
          where: { woltId: product.id },
          update: {
            name: product.name,
            description: product.description,
            imageUrl: product.images?.[0]?.url,
            supermarket: smId,
          },
          create: {
            name: product.name,
            description: product.description,
            imageUrl: product.images?.[0]?.url,
            woltId: product.id,
            supermarket: smId,
            storeId: store.id,
          }
        });

        // 2. Handle Discount
        if (product.discountedPrice !== null) {
          const existing = await prisma.discount.findFirst({
            where: { productId: dbProduct.id, isActive: true }
          });

          if (!existing) {
            await prisma.discount.create({
              data: {
                productName: dbProduct.name,
                category: category,
                discountedPrice: product.discountedPrice,
                originalPrice: product.originalPrice,
                description: product.description,
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
                category: category,
                discountedPrice: product.discountedPrice,
                originalPrice: product.originalPrice,
                description: product.description,
                validUntil: nextWeek,
                updatedAt: new Date()
              }
            });
          }
        }
        count++;
      } catch (err) {
        console.error(`❌ Failed ${product.name}:`, err.message);
      }
    }
    console.log(`✨ SUCCESS! Database updated with ${count} items.`);
    process.exit(0);
  }
}

parse();
