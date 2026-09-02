// Comparison truth audit — READ ONLY. Writes nothing.
//
// Answers the question "what fraction of the price comparisons we show are
// provably the same product?" by replaying the exact guard chain that
// getPriceComparison uses over the live active-offer set, then classifying
// every row it would render by the EVIDENCE behind the join:
//
//   PROVEN      both chains' SKUs were bound to this Product by matching GTIN
//   NAME-MATCH  at least one side was bound by name (MatchCache / LLM / admin)
//   UNPROVABLE  the canonical Product carries no barcode at all — nothing to prove
//   UNKNOWN     legacy mapping written before provenance was recorded
//
// UNKNOWN shrinks to zero on its own as the nightly runs re-stamp mappings.
//
//   node src/scripts/audit-comparison-truth.mjs
//   WORST=40 node src/scripts/audit-comparison-truth.mjs   # longer risk list
//
// dotenv first (ESM hoist trap — see CLAUDE.md).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { nameSimilarity, variantConflict, quantityConflict, COMPARISON_SIMILARITY_FLOOR } from '../lib/offer-similarity.ts';
import { samePack } from '../lib/packaging.ts';
import { withPublicDealVisibility } from '../lib/public-deal-filters.ts';

const { default: prisma } = await import('../lib/prisma.ts');

const WORST = parseInt(process.env.WORST || '20', 10);
const CHAIN_BEST_EPSILON = 0.05; // keep in lockstep with offer-similarity.ts
const MAX_ROWS = 8;              // keep in lockstep with get-price-comparison.ts

const pct = (n, d) => (d === 0 ? '  0.0%' : (100 * n / d).toFixed(1).padStart(5) + '%');
const bar = (n, d, w = 28) => '█'.repeat(Math.round(w * (d ? n / d : 0))).padEnd(w, '·');

console.log('\n=========== COMPARISON TRUTH AUDIT — ' + new Date().toISOString() + ' ===========\n');

// ---------------------------------------------------------------- load ------
const now = new Date();
const discounts = await prisma.discount.findMany({
  where: withPublicDealVisibility({
    isActive: true,
    validUntil: { gt: now },
    productId: { not: null },
  }),
  select: {
    id: true, productName: true, supermarket: true, source: true,
    chainItemcode: true, productId: true, discountedPrice: true,
    product: { select: { barcode: true } },
  },
});
console.log(`active public offers with a product: ${discounts.length}`);

// Provenance for every (chain, SKU) we actually render.
const mappings = await prisma.chainProductMapping.findMany({
  select: { supermarket: true, chainItemcode: true, productId: true, matchedVia: true },
});
const viaBySku = new Map();      // "chain|sku" -> matchedVia
const skusPerProductChain = new Map(); // "productId|chain" -> Set(sku)
for (const m of mappings) {
  viaBySku.set(`${m.supermarket}|${m.chainItemcode}`, m.matchedVia);
  const k = `${m.productId}|${m.supermarket}`;
  if (!skusPerProductChain.has(k)) skusPerProductChain.set(k, new Set());
  skusPerProductChain.get(k).add(m.chainItemcode);
}
console.log(`chain→product mappings:          ${mappings.length}`);

// ------------------------------------------------------- provenance census --
console.log('\n--- 1. MAPPING PROVENANCE (all mappings) ---');
const census = new Map();
for (const m of mappings) {
  const key = `${m.supermarket}|${m.matchedVia ?? 'null(legacy)'}`;
  census.set(key, (census.get(key) ?? 0) + 1);
}
const chains = [...new Set(mappings.map((m) => m.supermarket))].sort();
const kinds = ['barcode', 'catalog', 'cache', 'null(legacy)'];
console.log('chain'.padEnd(14) + kinds.map((k) => k.padStart(14)).join('') + '     total');
for (const c of chains) {
  const row = kinds.map((k) => census.get(`${c}|${k}`) ?? 0);
  const tot = row.reduce((a, b) => a + b, 0);
  console.log(c.padEnd(14) + row.map((n) => String(n).padStart(14)).join('') + String(tot).padStart(10));
}

// ------------------------------------------------ replay the guard chain ----
const byProduct = new Map();
for (const d of discounts) {
  if (!byProduct.has(d.productId)) byProduct.set(d.productId, []);
  byProduct.get(d.productId).push(d);
}

const via = (d) => (d.chainItemcode ? viaBySku.get(`${d.supermarket}|${d.chainItemcode}`) ?? null : null);

// Mirrors filterComparable() exactly: variant/quantity guard, then similarity
// floor, then one best row per chain (± epsilon).
function renderedRows(source, candidates) {
  const scored = candidates
    .filter((c) => samePack(source.productName, c.productName))
    .filter((c) => !variantConflict(source.productName, c.productName)
      && !quantityConflict(source.productName, c.productName))
    .map((c) => ({ c, chain: c.supermarket ?? '', score: nameSimilarity(source.productName, c.productName) }));
  const best = new Map();
  for (const s of scored) if (s.score > (best.get(s.chain) ?? -1)) best.set(s.chain, s.score);
  return scored
    .filter((s) => s.score >= COMPARISON_SIMILARITY_FLOOR && s.score >= (best.get(s.chain) ?? 0) - CHAIN_BEST_EPSILON)
    .slice(0, MAX_ROWS);
}

const classes = { PROVEN: 0, 'NAME-MATCH': 0, UNPROVABLE: 0, UNKNOWN: 0 };
const buckets = new Map();
let offersWithComparison = 0, totalRows = 0, candidatePairs = 0, blockedByGuards = 0;
const risky = [];

for (const [, rows] of byProduct) {
  if (new Set(rows.map((r) => r.supermarket)).size < 2) continue;
  for (const source of rows) {
    const others = rows.filter((r) => r.id !== source.id && r.supermarket !== source.supermarket);
    if (others.length === 0) continue;
    candidatePairs += others.length;
    const kept = renderedRows(source, others);
    blockedByGuards += others.length - kept.length;
    if (kept.length === 0) continue;
    offersWithComparison += 1;
    for (const { c, score } of kept) {
      totalRows += 1;
      const b = (Math.floor(score * 20) / 20).toFixed(2);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);

      const va = via(source), vb = via(c);
      let cls;
      if (!source.product?.barcode) cls = 'UNPROVABLE';
      else if (va === 'barcode' && vb === 'barcode') cls = 'PROVEN';
      else if (va === 'cache' || vb === 'cache') cls = 'NAME-MATCH';
      else if (va == null || vb == null) cls = 'UNKNOWN';
      else cls = 'NAME-MATCH';
      classes[cls] += 1;

      if (cls !== 'PROVEN' && score < 0.7) {
        risky.push({ score, cls, a: `${source.supermarket}: ${source.productName}`, b: `${c.supermarket}: ${c.productName}` });
      }
    }
  }
}

console.log('\n--- 2. WHAT THE GUARDS ALREADY BLOCK ---');
console.log(`cross-chain candidate pairs (same productId): ${candidatePairs}`);
console.log(`blocked by pack/variant/quantity/similarity:  ${blockedByGuards}  (${pct(blockedByGuards, candidatePairs)})`);
console.log(`offers that render at least one comparison:   ${offersWithComparison}`);
console.log(`comparison rows a user can actually see:      ${totalRows}`);

console.log('\n--- 3. EVIDENCE BEHIND EACH RENDERED ROW ---');
for (const k of ['PROVEN', 'NAME-MATCH', 'UNKNOWN', 'UNPROVABLE']) {
  console.log(k.padEnd(12) + String(classes[k]).padStart(8) + '  ' + pct(classes[k], totalRows) + '  ' + bar(classes[k], totalRows));
}
console.log('\n  PROVEN     = both chains bound to this product by matching GTIN');
console.log('  NAME-MATCH = at least one side bound by name, never verified');
console.log('  UNKNOWN    = legacy mapping, provenance not recorded yet (re-stamps on the next run)');
console.log('  UNPROVABLE = product has no barcode at all — no GTIN exists to check against');

console.log('\n--- 4. SIMILARITY OF RENDERED ROWS (floor is ' + COMPARISON_SIMILARITY_FLOOR + ') ---');
for (const b of [...buckets.keys()].sort()) {
  console.log('  ' + b + '–' + (parseFloat(b) + 0.05).toFixed(2) + String(buckets.get(b)).padStart(8) + '  ' + bar(buckets.get(b), totalRows));
}

// ------------------------------------------------------------ collisions ----
console.log('\n--- 5. SAME-CHAIN COLLISIONS (two SKUs of one chain on one product) ---');
const collisions = new Map();
for (const [k, set] of skusPerProductChain) {
  if (set.size < 2) continue;
  const chain = k.split('|')[1];
  collisions.set(chain, (collisions.get(chain) ?? 0) + 1);
}
if (collisions.size === 0) console.log('  none');
for (const [c, n] of [...collisions].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + c.padEnd(14) + String(n).padStart(7) + ' products claimed by >1 SKU of the same chain');
}

// -------------------------------------------------- price-history exposure --
console.log('\n--- 6. PRICE-HISTORY EXPOSURE (why the chart can mislead) ---');
const comparedIds = [...byProduct.entries()]
  .filter(([, rows]) => new Set(rows.map((r) => r.supermarket)).size >= 2)
  .map(([pid]) => pid);
if (comparedIds.length) {
  const since = new Date(Date.now() - 90 * 86400000);
  const snaps = await prisma.priceSnapshot.groupBy({
    by: ['productId', 'supermarket', 'kind'],
    where: { productId: { in: comparedIds.slice(0, 5000) }, recordedAt: { gte: since } },
    _count: { _all: true },
  });
  const perProduct = new Map();
  for (const s of snaps) {
    if (!perProduct.has(s.productId)) perProduct.set(s.productId, { chains: new Set(), kinds: new Set() });
    perProduct.get(s.productId).chains.add(s.supermarket);
    perProduct.get(s.productId).kinds.add(s.kind ?? 'null');
  }
  const multiChain = [...perProduct.values()].filter((v) => v.chains.size > 1).length;
  const multiKind = [...perProduct.values()].filter((v) => v.kinds.size > 1).length;
  console.log(`  products sampled:                       ${perProduct.size}`);
  console.log(`  whose 90d chart pools >1 chain:         ${multiChain}  (${pct(multiChain, perProduct.size)})`);
  console.log(`  whose 90d chart pools >1 price kind:    ${multiKind}  (${pct(multiKind, perProduct.size)})`);
  console.log('  → every one of these renders a "lowest price" verdict against a blended series.');
}

// ------------------------------------------------------------- risk list ----
console.log(`\n--- 7. ${Math.min(WORST, risky.length)} RISKIEST RENDERED ROWS (unproven + low similarity) ---`);
risky.sort((a, b) => a.score - b.score);
for (const r of risky.slice(0, WORST)) {
  console.log(`  ${r.score.toFixed(2)}  [${r.cls}]`);
  console.log(`        A  ${r.a}`);
  console.log(`        B  ${r.b}`);
}
if (risky.length > WORST) console.log(`  … and ${risky.length - WORST} more (WORST=N to see them)`);

await prisma.$disconnect();
console.log('\n=========== END ===========\n');
