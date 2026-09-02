// Recover AB Vasilopoulos' current persisted-query hash, automatically.
//
// WHY A BROWSER
// ab.gr accepts only Apollo *persisted* queries: a SHA-256 naming a query the
// server already knows. The hash is baked into AB's frontend build and rotates
// on their redeploys — it rotated ~2026-08-02 and the daily job then failed
// every night for five weeks, dropping AB from ~255 live offers to 1, because
// "recovery" meant a human editing a constant.
//
// Two cheaper routes were tried and rejected, both evidenced by CI probes:
//   * Reading the hash out of the JS bundles (CI 33649125528): no bundle pairs
//     the operation name with a 64-hex string, because Apollo computes the hash
//     at RUNTIME from the query document.
//   * Reconstructing the hash ourselves from that document (CI 33649370007
//     found it as an AST in 3994.*.js, operation `QlProductList`): the hash is
//     sha256 of the PRINTED query, so it would need a byte-exact reimplementation
//     of graphql's print() — and `graphql` isn't even a dependency here. One
//     whitespace difference yields a different hash and a silent failure.
//
// So let AB's own frontend compute it and watch what it sends. That is how the
// original hash was captured, it cannot drift from whatever the site actually
// uses, and Playwright is already a dependency.
//
// Read-only against ab.gr. The single write is the verified hash into
// ScraperState, which the adapter prefers over its compiled-in fallback.
//
//   node src/scripts/recover-ab-pq-hash.mjs           # recover + store
//   DRY_RUN=1 node src/scripts/recover-ab-pq-hash.mjs # recover + verify only
//
// dotenv first (ESM hoist trap — see CLAUDE.md).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import {
  AB_ORIGIN,
  AB_PROMOTIONS_PAGE,
  AB_PQ_STATE_KEY,
  verifyHash,
  buildProductListUrl,
  AB_API_HEADERS,
} from './lib/ab-persisted-query.mjs';

chromium.use(stealth());

const DRY_RUN = process.env.DRY_RUN === '1';
const OPERATION = process.env.OPERATION || 'ProductList';
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '60000', 10);

console.log(`\n🔑 AB persisted-query recovery — operation=${OPERATION}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

const seen = new Map(); // hash -> times observed

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'el-GR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// Watch every API call the app makes and pull the hash out of `extensions`.
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes('/api/v1/')) return;
  if (!url.includes(`operationName=${OPERATION}`)) return;
  try {
    const ext = new URL(url).searchParams.get('extensions');
    const hash = ext && JSON.parse(ext)?.persistedQuery?.sha256Hash;
    if (hash) seen.set(hash, (seen.get(hash) ?? 0) + 1);
  } catch {
    /* a malformed extensions param is not worth failing the run over */
  }
});

let navError = null;
try {
  await page.goto(AB_PROMOTIONS_PAGE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  // The listing is client-rendered; give it a beat, then scroll to provoke the
  // paginated ProductList call in case the first paint didn't make one.
  await page.waitForTimeout(6000);
  await page.mouse.wheel(0, 4000).catch(() => {});
  await page.waitForTimeout(6000);
} catch (e) {
  navError = e.message;
  console.error(`   navigation problem: ${navError}`);
}
await browser.close();

if (seen.size === 0) {
  console.error(`\n❌ No ${OPERATION} request observed.`);
  console.error(`   Either ab.gr blocked this runner, or the page no longer issues that operation.`);
  console.error(`   Nothing was written. The adapter keeps using its current hash.`);
  process.exit(1);
}

const observed = [...seen.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n   observed ${observed.length} distinct hash(es):`);
for (const [h, n] of observed) console.log(`     ${h}  ×${n}`);

// Never store a hash on the strength of having seen it — confirm the API
// actually answers it, or a bad capture could pin the adapter to a dud.
let winner = null;
for (const [hash] of observed) {
  process.stdout.write(`   verifying ${hash.slice(0, 16)}… `);
  let ok = false;
  try {
    ok = await verifyHash({ hash, buildUrl: buildProductListUrl, headers: AB_API_HEADERS });
  } catch (e) {
    console.log(`error: ${e.message}`);
    continue;
  }
  console.log(ok ? 'ACCEPTED ✅' : 'rejected');
  if (ok) { winner = hash; break; }
}

if (!winner) {
  console.error(`\n❌ Observed hashes, but none was accepted by ${AB_ORIGIN}/api/v1/.`);
  console.error(`   Nothing written — this needs a human look.`);
  process.exit(1);
}

console.log(`\n✅ working hash: ${winner}`);

if (DRY_RUN) {
  console.log('   DRY_RUN — not stored.');
  process.exit(0);
}

const { default: prisma } = await import('../lib/prisma.ts');
const note = `recovered by recover-ab-pq-hash.mjs; verified against ${AB_ORIGIN}/api/v1/`;
await prisma.scraperState.upsert({
  where: { key: AB_PQ_STATE_KEY },
  create: { key: AB_PQ_STATE_KEY, value: winner, note },
  update: { value: winner, note },
});
console.log(`   stored in ScraperState["${AB_PQ_STATE_KEY}"] — the adapter picks it up on its next run.`);
await prisma.$disconnect();
