// One-time category backfill — re-derive Discount.category with the shared
// keyword categorizer and preserve each row's prior label as subcategory.
//
// Before this, category assignment was per-chain and dumped huge shares into
// "Άλλο" (masoutis 99.9%, mymarket 41%). New writes go through
// lib/categories.ts at ingest/resolve time; this re-applies the same logic to
// the existing active rows so the catalogue is consistent immediately.
//
// subcategory = the row's previous category (the chain's native-ish label),
// dropped when it was "Άλλο" (carries no information). Note: mymarket's truly
// granular native category was discarded by the old adapter, so its subcategory
// only becomes granular on the next adapter run — this backfill self-heals.
//
// Usage:
//   node src/scripts/recompute-categories.mjs
//   DRY_RUN=1 node src/scripts/recompute-categories.mjs
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { categorize, DEPARTMENTS } from '../lib/categories.ts';

const DEPT_SET = new Set(DEPARTMENTS);

const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const now = new Date();

  const deals = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now } },
    select: { id: true, productName: true, category: true, subcategory: true },
  });
  console.log(`🔢 active deals to recategorize: ${deals.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  const tally = {};
  let updated = 0, unchanged = 0;
  const queue = [...deals];

  async function worker() {
    while (queue.length) {
      const d = queue.pop();
      // True native = an existing granular subcategory, else the category if it
      // still holds a raw native label (not a department). NEVER treat a
      // department as native — that's what made a 2nd run overwrite real natives.
      // Idempotent: once category=dept and subcategory=native|null, stable.
      const native =
        d.subcategory && !DEPT_SET.has(d.subcategory) ? d.subcategory
        : !DEPT_SET.has(d.category) ? d.category
        : null;
      const dept = categorize(d.productName, native ?? d.category);
      tally[dept] = (tally[dept] || 0) + 1;
      if (dept === d.category && native === (d.subcategory ?? null)) { unchanged++; continue; }
      if (!DRY_RUN) {
        await prisma.discount.update({ where: { id: d.id }, data: { category: dept, subcategory: native } }).catch(() => {});
      }
      updated++;
      if (updated % 500 === 0) process.stdout.write(`\r   updated ${updated}…   `);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n🏁 recategorize done — updated=${updated} unchanged=${unchanged}`);
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  console.log('   resulting department distribution:');
  for (const [dept, n] of sorted) console.log('   ', String(n).padStart(5), dept);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
