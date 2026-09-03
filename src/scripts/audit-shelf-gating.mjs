// Shelf-row gating audit — READ ONLY. Writes nothing.
//
// Exists to answer ONE open decision with numbers instead of intuition (the T6
// question in CONTEXT.md): the plan says to gate «Κανονική τιμή» shelf rows on
// ChainProductMapping.matchedVia='barcode'. The 2026-09-02 truth audit then
// found that only 31% of products carry a GTIN at all and 65% of rendered
// comparison rows are unprovable — so strict gating might not tighten the
// shelf rows so much as delete them.
//
// This replays the real shelf-row pipeline (lib/shelf-comparison.ts, same
// recency window, same one-row-per-chain rule, same chain exclusions) and
// counts what survives under each candidate rule:
//
//   TODAY   what ships now: the SOURCE offer's product must have a barcode
//   STRICT  additionally require the SNAPSHOT's chain mapping to be
//           matchedVia='barcode' — the plan's option (a)
//   HEDGED  keep every row, but mark those that aren't barcode-proven so the
//           UI can show them with a visible caveat — option (c)
//
//   node src/scripts/audit-shelf-gating.mjs
//
// NOTE ON TIMING: matchedVia only began being stamped on 2026-09-02, and rows
// re-stamp as each chain's nightly adapter re-binds them. Until that has run
// for every chain, STRICT will read artificially low — the script reports how
// much of the mapping table is still unstamped so you can tell a real result
// from an early one.
//
// dotenv first (ESM hoist trap — see CLAUDE.md).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { pickShelfRows, SHELF_PRICE_MAX_AGE_DAYS } from '../lib/shelf-comparison.ts';
import { withPublicDealVisibility } from '../lib/public-deal-filters.ts';

const { default: prisma } = await import('../lib/prisma.ts');

const pct = (n, d) => (d === 0 ? '  0.0%' : (100 * n / d).toFixed(1).padStart(5) + '%');

console.log('\n===== SHELF-ROW GATING AUDIT — ' + new Date().toISOString() + ' =====\n');

const now = new Date();

// How trustworthy is the provenance column right now?
const mappings = await prisma.chainProductMapping.findMany({
  select: { supermarket: true, chainItemcode: true, productId: true, matchedVia: true },
});
const stamped = mappings.filter((m) => m.matchedVia != null).length;
console.log(`mappings: ${mappings.length} total, ${stamped} stamped (${pct(stamped, mappings.length)})`);
if (stamped / Math.max(1, mappings.length) < 0.5) {
  console.log('⚠️  Most mappings are still unstamped, so STRICT below is a LOWER BOUND,');
  console.log('   not the steady-state answer. Re-run after every chain has re-bound.');
}
// productId+chain -> was that binding proven by GTIN?
const viaByProductChain = new Map();
for (const m of mappings) {
  const k = `${m.productId}|${m.supermarket}`;
  // 'barcode' wins if ANY of the chain's SKUs for this product was GTIN-proven.
  if (m.matchedVia === 'barcode' || !viaByProductChain.has(k)) {
    viaByProductChain.set(k, m.matchedVia);
  }
}

// Every offer a shopper can currently see, with its product's barcode.
const offers = await prisma.discount.findMany({
  where: withPublicDealVisibility({ isActive: true, validUntil: { gt: now }, productId: { not: null } }),
  select: { id: true, productId: true, supermarket: true, product: { select: { barcode: true } } },
});
console.log(`active public offers with a product: ${offers.length}`);

// Chains that already have an active offer on a product are excluded from its
// shelf rows — mirrors get-price-comparison.ts.
const chainsWithOffer = new Map();
for (const o of offers) {
  if (!chainsWithOffer.has(o.productId)) chainsWithOffer.set(o.productId, new Set());
  if (o.supermarket) chainsWithOffer.get(o.productId).add(o.supermarket);
}

// Recent shelf snapshots for those products.
const productIds = [...new Set(offers.map((o) => o.productId))];
const cutoff = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
const snapsByProduct = new Map();
for (let i = 0; i < productIds.length; i += 500) {
  const rows = await prisma.priceSnapshot.findMany({
    where: { productId: { in: productIds.slice(i, i + 500) }, kind: 'normal', recordedAt: { gte: cutoff } },
    select: { productId: true, supermarket: true, price: true, recordedAt: true },
  });
  for (const s of rows) {
    if (!snapsByProduct.has(s.productId)) snapsByProduct.set(s.productId, []);
    snapsByProduct.get(s.productId).push(s);
  }
}
console.log(`products with a recent shelf snapshot: ${snapsByProduct.size}\n`);

let today = 0, strict = 0, hedgedProven = 0, hedgedUnproven = 0;
let offersWithShelfToday = 0, offersWithShelfStrict = 0;
const lostChains = new Map();

for (const o of offers) {
  // TODAY's gate: the source offer's product must carry a GTIN.
  if (!o.product?.barcode) continue;
  const snaps = snapsByProduct.get(o.productId) ?? [];
  if (snaps.length === 0) continue;

  const excluded = new Set(chainsWithOffer.get(o.productId) ?? []);
  if (o.supermarket) excluded.add(o.supermarket);

  const rows = pickShelfRows({ snapshots: snaps, excludedChains: excluded, now });
  if (rows.length === 0) continue;

  today += rows.length;
  offersWithShelfToday += 1;

  const proven = rows.filter((r) => viaByProductChain.get(`${o.productId}|${r.supermarket}`) === 'barcode');
  strict += proven.length;
  hedgedProven += proven.length;
  hedgedUnproven += rows.length - proven.length;
  if (proven.length > 0) offersWithShelfStrict += 1;

  for (const r of rows) {
    if (!proven.includes(r)) lostChains.set(r.supermarket, (lostChains.get(r.supermarket) ?? 0) + 1);
  }
}

console.log('--- SHELF ROWS RENDERED, BY CANDIDATE RULE ---');
console.log(`TODAY   (source product has a GTIN)          ${String(today).padStart(7)}   100.0%`);
console.log(`STRICT  (+ snapshot chain proven by GTIN)    ${String(strict).padStart(7)}  ${pct(strict, today)}`);
console.log(`HEDGED  (all kept; ${hedgedUnproven} shown with a caveat)`.padEnd(45) + `${String(today).padStart(7)}   100.0%`);

console.log('\n--- OFFERS THAT SHOW ANY SHELF ROW ---');
console.log(`TODAY   ${offersWithShelfToday}`);
console.log(`STRICT  ${offersWithShelfStrict}  (${pct(offersWithShelfStrict, offersWithShelfToday)} of today's)`);
console.log(`        → ${offersWithShelfToday - offersWithShelfStrict} offer(s) would lose their «Κανονική τιμή» rows entirely.`);

console.log('\n--- ROWS STRICT WOULD DROP, BY CHAIN ---');
if (lostChains.size === 0) console.log('  none');
for (const [c, n] of [...lostChains].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(14)} ${String(n).padStart(6)}`);
}

console.log('\nReminder: STRICT is a lower bound until matchedVia is fully stamped (see the header).');
await prisma.$disconnect();
console.log('\n===== END =====\n');
