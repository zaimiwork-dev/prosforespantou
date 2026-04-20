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
    
    // Extract Wolt item URL + itemid from the card's anchor
    const hrefRaw = $el.find('a[href*="itemid-"]').attr('href') || $el.closest('a[href*="itemid-"]').attr('href') || '';
    const itemidMatch = hrefRaw.match(/itemid-([a-f0-9]{24})/i);
    const woltItemId = itemidMatch ? itemidMatch[1] : null;
    const woltUrl = hrefRaw ? (hrefRaw.startsWith('http') ? hrefRaw : `https://wolt.com${hrefRaw}`) : null;

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

    // Catalog mode: require image + Wolt itemid.
    const hasImage = imageUrl && imageUrl.startsWith('http');
    if (!name || !woltItemId || seen.has(woltItemId)) return;
    if (!hasImage) {
      console.log(`⏭️  Skipped (no image): ${name}`);
      return;
    }

    seen.add(woltItemId);
    products.push({
      name,
      description,
      category,
      images: [{ url: imageUrl }],
      woltItemId,
      woltUrl,
      id: `${smId}:${woltItemId}`,
    });
  });

  console.log(`✅ Extracted ${products.length} products.`);

  // Append URL map to library_data/wolt_urls.json for the description-fetcher
  if (products.length > 0) {
    const urlsPath = DATA_DIR + 'wolt_urls.json';
    const urlMap = fs.existsSync(urlsPath) ? JSON.parse(fs.readFileSync(urlsPath, 'utf8')) : {};
    for (const p of products) {
      if (p.woltUrl) urlMap[p.id] = p.woltUrl;
    }
    fs.writeFileSync(urlsPath, JSON.stringify(urlMap, null, 2));
    console.log(`🗺️  URL map now has ${Object.keys(urlMap).length} entries.`);
  }

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

    for (const product of products) {
      try {
        await prisma.product.upsert({
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
