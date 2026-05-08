import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const DATA_DIR = './library_data/';
const OUTPUT_FILE = './pending_masoutis_deals.json';

function parsePrice(txt) {
  if (!txt) return null;
  const m = txt.replace(/\s/g, '').replace(',', '.').match(/(\d+\.\d+)/);
  return m ? parseFloat(m[1]) : null;
}

function extractFromHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('.product').each((_, el) => {
    const $el = $(el);
    const name = $el.find('.productTitle').first().text().trim();
    if (!name) return;

    const dscntPriceTxt = $el.find('.pDscntPrice').first().text().trim();
    const startPriceTxt = $el.find('.pStartPrice').first().text().trim();
    const priceTxt = $el.find('.price').first().text().trim();
    const percentTxt = $el.find('.pDscntPercent').first().text().trim();

    let rawPrice = parsePrice(dscntPriceTxt) ?? parsePrice(priceTxt);
    let originalPrice = parsePrice(startPriceTxt);

    if (!rawPrice && originalPrice) rawPrice = originalPrice;
    if (!rawPrice) return;

    if (!originalPrice && rawPrice) {
      const pctMatch = percentTxt.match(/-?(\d+(?:[.,]\d+)?)\s*%/);
      const pct = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : null;
      if (pct && pct > 0 && pct < 100) {
        originalPrice = parseFloat((rawPrice / (1 - pct / 100)).toFixed(2));
      }
    }

    let imageUrl = $el.find('.productImage').first().attr('src') || $el.find('img').first().attr('src') || null;
    if (imageUrl && imageUrl.startsWith('/')) imageUrl = `https://www.masoutis.gr${imageUrl}`;

    items.push({
      rawName: name,
      rawPrice,
      originalPrice: (originalPrice && originalPrice > rawPrice) ? originalPrice : null,
      imageUrl,
      discountPercent: percentTxt || null,
      barcode: null,
      supermarket: 'masoutis',
      category: 'Άλλο',
    });
  });

  return items;
}

async function extract() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ ${DATA_DIR} does not exist.`);
    process.exit(1);
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('masoutis_web_') && f.endsWith('.html'));
  if (files.length === 0) {
    console.error('❌ No masoutis_web_*.html files found. Run the fetcher first.');
    process.exit(1);
  }

  files.sort();
  const latest = files[files.length - 1];
  console.log(`🤖 Extractor (web): parsing ${latest}`);

  const html = fs.readFileSync(path.join(DATA_DIR, latest), 'utf8');
  const all = extractFromHtml(html);

  const dedup = new Map();
  for (const item of all) {
    const existing = dedup.get(item.rawName);
    const better = !existing || (item.originalPrice && !existing.originalPrice);
    if (better) dedup.set(item.rawName, item);
  }
  const deals = Array.from(dedup.values());

  const withOriginal = deals.filter((d) => d.originalPrice).length;
  const withImage = deals.filter((d) => d.imageUrl).length;
  console.log(`✅ Pulled ${deals.length} unique products (${withOriginal} with originalPrice, ${withImage} with image).`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(deals, null, 2));

  const date = new Date().toISOString().slice(0, 10);
  const archive = path.join(DATA_DIR, `extracted_masoutis_web_${date}.json`);
  fs.writeFileSync(archive, JSON.stringify(deals, null, 2));
  console.log(`📁 Output: ${OUTPUT_FILE}\n📁 Archive: ${archive}`);
}

extract();
