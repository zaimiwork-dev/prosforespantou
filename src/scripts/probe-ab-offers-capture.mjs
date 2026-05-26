// Capture AB's GraphQL traffic when the offers page loads + scrolls.
// Goal: find the offers query name, the variables/pagination shape, and the
// fields actually returned per product. Same approach that worked for Masoutis.
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

chromium.use(stealth());

// The real promotions page (per user). Needs scrolling for pagination.
const CANDIDATES = [
  'https://www.ab.gr/search/promotions',
];
const OUT = './library_data/ab_offers_api_capture.json';

const captured = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ locale: 'el-GR' }).then((c) => c.newPage());

  page.on('request', (req) => {
    const url = req.url();
    if (!/ab\.gr\/api/.test(url) && !/graphql/i.test(url)) return;
    captured.push({
      kind: 'request',
      method: req.method(),
      url,
      postData: req.postData() || null,
    });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!/ab\.gr\/api/.test(url) && !/graphql/i.test(url)) return;
    const ct = res.headers()['content-type'] || '';
    if (!/json/i.test(ct)) return;
    try {
      const body = await res.json();
      captured.push({ kind: 'response', url, body });
    } catch {}
  });

  let workingUrl = null;
  for (const url of CANDIDATES) {
    try {
      console.log(`🌐 trying ${url}`);
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`   → HTTP ${r ? r.status() : '?'}  final url: ${page.url()}`);
      if (r) { workingUrl = url; break; }
    } catch (e) { console.log(`   nope: ${e.message.slice(0, 120)}`); }
  }
  if (!workingUrl) { console.error('no offers URL loaded'); await browser.close(); return; }

  console.log(`✅ loaded ${workingUrl} — waiting + scrolling until stable`);
  await page.waitForTimeout(4000);
  // scroll until the page stops growing (or 25 scroll passes max)
  let lastHeight = 0, stable = 0;
  for (let i = 0; i < 25 && stable < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await page.waitForTimeout(2200);
    const h = await page.evaluate(() => document.body.scrollHeight);
    if (h === lastHeight) stable++; else { stable = 0; lastHeight = h; }
    process.stdout.write(`\r   scroll ${i + 1} — height ${h}   `);
  }
  console.log('');
  await browser.close();

  // Summarize requests
  const reqs = captured.filter((c) => c.kind === 'request');
  const ress = captured.filter((c) => c.kind === 'response');

  // Group by operation name (parse from POST body) to spot the offers one
  const opCounts = new Map();
  for (const r of reqs) {
    if (!r.postData) continue;
    try {
      const j = JSON.parse(r.postData);
      const op = j.operationName || (j.query || '').match(/(?:query|mutation)\s+(\w+)/)?.[1] || 'anon';
      opCounts.set(op, (opCounts.get(op) || 0) + 1);
    } catch {}
  }
  console.log(`\n📨 ${reqs.length} API requests, ${ress.length} JSON responses`);
  console.log(`   operations seen:`);
  for (const [op, n] of [...opCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)} × ${op}`);
  }

  // Print the FIRST POST body of each unique operation + matching response shape
  const seen = new Set();
  for (const r of reqs) {
    if (!r.postData) continue;
    let op;
    try { op = JSON.parse(r.postData).operationName || 'anon'; } catch { continue; }
    if (seen.has(op)) continue;
    seen.add(op);
    console.log(`\n━━ ${op}`);
    const body = JSON.parse(r.postData);
    console.log(`   variables: ${JSON.stringify(body.variables || {}).slice(0, 300)}`);
    const resp = ress.find((x) => {
      try { return x.body && (x.body.data || x.body.errors) && JSON.stringify(x.body).includes(op); } catch { return false; }
    });
    if (resp && resp.body && resp.body.data) {
      const dataKey = Object.keys(resp.body.data)[0];
      const node = resp.body.data[dataKey];
      const arr = node?.products || node?.items || (Array.isArray(node) ? node : null);
      if (Array.isArray(arr) && arr.length) {
        console.log(`   response data.${dataKey} — array of ${arr.length}, first item keys:`);
        console.log(`   ${Object.keys(arr[0]).join(', ')}`);
        console.log(`   sample: ${JSON.stringify(arr[0]).slice(0, 600)}`);
      } else if (node) {
        console.log(`   response data.${dataKey} keys: ${Object.keys(node).join(', ').slice(0, 300)}`);
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(captured, null, 2));
  console.log(`\n📁 full capture → ${OUT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
