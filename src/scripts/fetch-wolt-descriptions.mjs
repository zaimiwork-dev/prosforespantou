import fs from 'fs';
import * as cheerio from 'cheerio';

const URLS_PATH = './library_data/wolt_urls.json';
const PROGRESS_PATH = './library_data/wolt_descriptions_done.json';
const DELAY_MS = 800;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const { default: prisma } = await import('../lib/prisma.ts');

const urlMap = JSON.parse(fs.readFileSync(URLS_PATH, 'utf8'));
const done = fs.existsSync(PROGRESS_PATH)
  ? new Set(JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')))
  : new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractDescription(html) {
  const $ = cheerio.load(html);

  // 1) Try __NEXT_DATA__ JSON blob
  const nextData = $('#__NEXT_DATA__').text();
  if (nextData) {
    try {
      const json = JSON.parse(nextData);
      const str = JSON.stringify(json);
      // Look for description-ish fields
      const match = str.match(/"description":"([^"\\]{30,}(?:\\.[^"\\]*)*)"/);
      if (match) {
        return JSON.parse(`"${match[1]}"`);
      }
    } catch {}
  }

  // 2) Try OG / meta description
  const meta = $('meta[property="og:description"]').attr('content')
    || $('meta[name="description"]').attr('content');
  if (meta && meta.length > 30) return meta.trim();

  // 3) Try a visible description container on the detail page
  const candidates = [
    '[data-test-id="product-description"]',
    '[data-test-id="ProductDescription"]',
    '[data-test-id="venue-product-details.description"]',
  ];
  for (const sel of candidates) {
    const t = $(sel).text().trim();
    if (t && t.length > 30) return t;
  }

  return null;
}

const entries = Object.entries(urlMap);
console.log(`📚 ${entries.length} URLs total, ${done.size} already done.`);

let ok = 0, skip = 0, fail = 0;

for (let i = 0; i < entries.length; i++) {
  const [woltId, url] = entries[i];
  if (done.has(woltId)) { skip++; continue; }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) {
      console.log(`  ⚠️  [${i + 1}/${entries.length}] ${res.status} ${woltId}`);
      fail++;
      if (res.status === 429 || res.status === 403) {
        console.log('🛑 Rate limited — stopping. Rerun to resume.');
        break;
      }
      continue;
    }
    const html = await res.text();
    const desc = extractDescription(html);

    if (desc) {
      await prisma.product.update({
        where: { woltId },
        data: { description: desc },
      });
      done.add(woltId);
      ok++;
      console.log(`  ✅ [${i + 1}/${entries.length}] ${woltId} — ${desc.slice(0, 70)}…`);
    } else {
      done.add(woltId); // don't retry forever
      fail++;
      console.log(`  ❌ [${i + 1}/${entries.length}] no desc for ${woltId}`);
    }

    if (ok % 20 === 0 && ok > 0) {
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify([...done], null, 2));
    }
  } catch (err) {
    console.log(`  💥 [${i + 1}/${entries.length}] ${woltId}: ${err.message}`);
    fail++;
  }

  await sleep(DELAY_MS);
}

fs.writeFileSync(PROGRESS_PATH, JSON.stringify([...done], null, 2));
console.log(`\n🏁 Done. ok=${ok} skip=${skip} fail=${fail}`);
process.exit(0);
