// Daily authoritative hotScore recompute (+ one-time backfill).
//
// Per-write hotScore (ingest-offers, resolver, admin) uses clicks=0 or the
// lifetime clickCount and a write-time recency. This pass re-derives every
// active deal's hotScore from:
//   • the same KVI/brand/mechanic/% rules (src/lib/hotness.ts), and
//   • a RECENT-window click count (last RECENT_DAYS days of deal_click) — the
//     real "δημοφιλή" signal, so a deal that stops getting clicks cools off
//     instead of riding a lifetime counter forever.
//
// Run locally for the backfill, and daily on CI (it's a step in the resolvers
// GitHub Actions job). Chain-agnostic, source-agnostic — hotScore isn't scoped
// by source, so no SOURCE filtering here.
//
// Usage:
//   node src/scripts/recompute-hotness.mjs           # all active deals
//   DRY_RUN=1 node src/scripts/recompute-hotness.mjs # report only
//
// dotenv first (ESM hoist trap — DB import comes later).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { computeHotScore } from '../lib/hotness.ts';

const DRY_RUN = process.env.DRY_RUN === '1';
const RECENT_DAYS = parseInt(process.env.RECENT_DAYS || '14', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);

  // Recent-window click + list_add counts per discount → the popularity signal.
  // list_add is the stronger intent (user committed the offer to their list).
  const [clickRows, addRows] = await Promise.all([
    prisma.clickEvent.groupBy({
      by: ['discountId'],
      where: { eventType: 'deal_click', discountId: { not: null }, createdAt: { gt: since } },
      _count: { _all: true },
    }),
    prisma.clickEvent.groupBy({
      by: ['discountId'],
      where: { eventType: 'list_add', discountId: { not: null }, createdAt: { gt: since } },
      _count: { _all: true },
    }),
  ]);
  const clicksById = new Map(clickRows.map((r) => [r.discountId, r._count._all]));
  const addsById = new Map(addRows.map((r) => [r.discountId, r._count._all]));
  console.log(`📈 recent (${RECENT_DAYS}d): ${clickRows.length} deals clicked, ${addRows.length} deals list-added`);

  const deals = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now } },
    select: { id: true, productName: true, description: true, discountPercent: true, createdAt: true, hotScore: true, priceVerdict: true },
  });
  console.log(`🔢 active deals to score: ${deals.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  let updated = 0, unchanged = 0;
  const queue = [...deals];

  async function worker() {
    while (queue.length) {
      const d = queue.pop();
      const score = computeHotScore({
        productName: d.productName,
        description: d.description,
        discountPercent: d.discountPercent,
        createdAt: d.createdAt,
        clicks: clicksById.get(d.id) || 0,
        listAdds: addsById.get(d.id) || 0,
        priceVerdict: d.priceVerdict,
        jitterKey: d.id,
      });
      if (Math.abs((d.hotScore ?? 0) - score) < 0.01) { unchanged++; continue; }
      if (!DRY_RUN) {
        await prisma.discount.update({ where: { id: d.id }, data: { hotScore: score } }).catch(() => {});
      }
      updated++;
      if (updated % 500 === 0) process.stdout.write(`\r   updated ${updated}…   `);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\n🏁 hotScore recompute done — updated=${updated} unchanged=${unchanged}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
