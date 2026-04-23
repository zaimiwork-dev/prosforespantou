import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const DATA_DIR = './library_data/';
const OUTPUT_FILE = './pending_masoutis_deals.json';

function deepSearchItems(obj, isDiscountContext = false) {
  let items = [];
  
  if (Array.isArray(obj)) {
    for (const val of obj) {
      items = items.concat(deepSearchItems(val, isDiscountContext));
    }
  } else if (obj !== null && typeof obj === 'object') {
    // If we find a "discounted" key, everything under it is a deal
    const isNewDiscountContext = isDiscountContext || 
                               (obj.queryKey && JSON.stringify(obj.queryKey).includes('discounted')) ||
                               (obj.telemetry_id === 'discounted');

    if (obj.name && obj.price && (obj.price > 0)) {
      const discountedPrice = obj.price / 100;
      const originalPrice = obj.original_price ? obj.original_price / 100 : null;
      const finalOriginalPrice = (originalPrice && originalPrice !== discountedPrice) ? originalPrice : null;

      let imageUrl = null;
      if (obj.image) imageUrl = obj.image;
      else if (obj.images && Array.isArray(obj.images) && obj.images.length > 0 && obj.images[0].url) imageUrl = obj.images[0].url;

      if ((finalOriginalPrice || isNewDiscountContext) && imageUrl) {
        items.push({
          rawName: obj.name,
          rawPrice: discountedPrice,
          originalPrice: finalOriginalPrice,
          imageUrl: imageUrl
        });
      }
    }

    for (const key in obj) {
      items = items.concat(deepSearchItems(obj[key], isNewDiscountContext));
    }
  }
  return items;
}

async function extract() {
  const files = fs.readdirSync(DATA_DIR).filter(f => 
    (f.startsWith('masoutis_') || f.includes('Μασούτης Μακεδονίας')) && f.endsWith('.html')
  );

  console.log(`🤖 Extractor Agent: Found ${files.length} files. Processing...`);
  
  const allDeals = new Map();

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    
    let count = 0;
    const isProsforesFile = file.includes('prosfores');

    const scripts = $('script.query-state');
    scripts.each((i, el) => {
      try {
        const json = JSON.parse($(el).text());
        const found = deepSearchItems(json, isProsforesFile);
        found.forEach(item => {
           if (!allDeals.has(item.rawName)) {
              allDeals.set(item.rawName, {
                ...item,
                supermarket: 'masoutis',
                category: 'Άλλο'
              });
              count++;
           }
        });
      } catch (e) {}
    });

    if (count > 0) console.log(`📖 ${file}: Added ${count} deals.`);
  }

  const extractedDeals = Array.from(allDeals.values());
  console.log(`✅ Extractor Agent: Pulled ${extractedDeals.length} total unique leaflet/offer deals.`);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(extractedDeals, null, 2));
}

extract();
