import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('library_data/masoutis_leaflet_2026-05-11.html', 'utf8');
const $ = cheerio.load(html);

console.log('Searching for potential barcodes in the first 20 products...');

let foundCount = 0;

$('.product').slice(0, 20).each((i, el) => {
    const $el = $(el);
    const title = $el.text().replace(/\s+/g, ' ').trim().substring(0, 50);
    
    // Look at href links
    const link = $el.find('a').attr('href') || '';
    
    // Look at image sources
    const imgSrc = $el.find('img').attr('src') || '';
    
    // Extract all attributes of the product node
    const attributes = el.attribs;
    
    // Check for 13 digit numbers (EAN-13 format) in links or image URLs
    const linkMatches = link.match(/[0-9]{13}/g);
    const imgMatches = imgSrc.match(/[0-9]{13}/g);
    
    // sometimes Masoutis uses query params like ?0343020=
    const queryParamMatch = link.match(/\?([0-9]+)=/);

    if (linkMatches || imgMatches || queryParamMatch) {
        console.log(`\nProduct ${i+1}: ${title}...`);
        if (linkMatches) console.log(`  🔗 Found 13-digits in Link: ${linkMatches.join(', ')} (URL: ${link})`);
        if (imgMatches) console.log(`  🖼️ Found 13-digits in Image: ${imgMatches.join(', ')} (URL: ${imgSrc})`);
        if (queryParamMatch) console.log(`  ❓ Found numeric query param: ${queryParamMatch[1]} (URL: ${link})`);
        foundCount++;
    }
});

if (foundCount === 0) {
    console.log('\nNo obvious barcodes found in the first 20 products.');
} else {
    console.log(`\nFound potential barcodes/IDs in ${foundCount} out of 20 products.`);
}

// Let's also check for any hidden inputs or data attributes
const dataAttrs = new Set();
$('.product *').each((i, el) => {
    for (const attr in el.attribs) {
        if (attr.startsWith('data-') || attr.toLowerCase().includes('ean') || attr.toLowerCase().includes('sku')) {
            dataAttrs.add(attr);
        }
    }
});
console.log('\nInteresting attributes found in product cards:', Array.from(dataAttrs));
