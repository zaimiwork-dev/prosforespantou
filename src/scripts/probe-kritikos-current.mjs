// Verify Kritikos's Next.js data layer is still reachable and exposes barcodes.
// Per past probe: `kritikos-sm.gr/_next/data/{buildId}/categories/{slug}.json`
// has items with `barcodes: string[]`. Just confirm it still works in 2026-05
// and find the offers/promotions slug.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'el-GR,el;q=0.9',
};

async function fetchText(url) {
  const r = await fetch(url, { headers: HEADERS });
  return { status: r.status, ct: r.headers.get('content-type') || '', text: await r.text() };
}

function pickBuildId(html) {
  const m = html.match(/"buildId":"([^"]+)"/) || html.match(/\/_next\/static\/([^\/"]+)\/_buildManifest\.js/);
  return m ? m[1] : null;
}

function pickOffersPath(html) {
  // look for nav links pointing to offers/promotions
  const re = /href=["']([^"']*(?:prosfor|offer|promot|prosfor)[^"']*)["']/gi;
  return [...new Set([...html.matchAll(re)].map((m) => m[1]))].slice(0, 10);
}

async function run() {
  console.log('━━ 1. homepage ━━');
  const home = await fetchText('https://www.kritikos-sm.gr/');
  console.log(`  HTTP ${home.status} (${home.text.length}b)`);
  if (home.status !== 200) { console.error('  homepage blocked'); return; }

  const buildId = pickBuildId(home.text);
  console.log(`  buildId: ${buildId || 'NOT FOUND'}`);
  const offerLinks = pickOffersPath(home.text);
  console.log(`  offer-ish links found:`);
  offerLinks.forEach((l) => console.log(`    ${l}`));

  if (!buildId) { console.error('  cannot proceed without buildId'); return; }

  console.log('\n━━ 2. try known data paths ━━');
  // Per memory: /_next/data/{buildId}/categories/{slug}.json
  const candidates = [
    `https://www.kritikos-sm.gr/_next/data/${buildId}/index.json`,
    `https://www.kritikos-sm.gr/_next/data/${buildId}/prosfores.json`,
    `https://www.kritikos-sm.gr/_next/data/${buildId}/offers.json`,
    `https://www.kritikos-sm.gr/_next/data/${buildId}/prosfora.json`,
    `https://www.kritikos-sm.gr/_next/data/${buildId}/promotions.json`,
    // categories.json variant
    `https://www.kritikos-sm.gr/_next/data/${buildId}/categories/prosfores.json`,
    `https://www.kritikos-sm.gr/_next/data/${buildId}/categories/offers.json`,
  ];
  for (const url of candidates) {
    const r = await fetchText(url);
    const isJson = /json/i.test(r.ct);
    console.log(`  ${r.status} ${isJson ? '✅' : '  '}  ${url.replace('https://www.kritikos-sm.gr', '')}`);
    if (isJson && r.status === 200) {
      try {
        const j = JSON.parse(r.text);
        console.log(`     top keys: ${Object.keys(j).join(', ')}`);
        if (j.pageProps) console.log(`     pageProps keys: ${Object.keys(j.pageProps).join(', ').slice(0, 200)}`);
      } catch {}
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
