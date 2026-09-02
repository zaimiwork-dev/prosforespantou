// Precompute Discount.priceVerdict for every active offer, so card lists can
// show an honest "good deal" badge without a per-row price-history query.
//
// Verdict = computeVerdict(offer.discountedPrice, product's 90-day snapshots) —
// the SAME engine the detail page / modal use live (lib/price-verdict.ts). Only
// positive verdicts ('lowest' | 'good') get surfaced as a badge in the UI; we
// store the raw verdict so the card layer decides.
//
// Idempotent. Run daily (after snapshots land) alongside recompute-hotness /
// recompute-categories. New rows written between passes stay null (no badge)
// until the next run — acceptable; the detail view always computes live.
//
// Usage:
//   node src/scripts/recompute-price-verdicts.mjs
//   DRY_RUN=1 node src/scripts/recompute-price-verdicts.mjs
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { computeVerdict } from '../lib/price-verdict.ts';

const DRY_RUN = process.env.DRY_RUN === '1';
const DAYS = parseInt(process.env.DAYS || '90', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86400000);

  const deals = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now } },
    select: { id: true, productId: true, supermarket: true, discountedPrice: true, priceVerdict: true },
  });
  console.log(`🔢 active deals: ${deals.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  // productId+chain -> prices[], in chunks (avoids a giant IN).
  //
  // KEYED BY CHAIN, and it must stay that way: the offer page and the modal
  // compute this live per chain (actions/get-price-history.ts). If this pass
  // pooled every chain the way it used to, a card would carry a badge the
  // detail view then refused to show — the same lockstep trap as the
  // comparison chip. Pooling also suppressed badges: an offer that is the
  // cheapest its own store has ever charged looked ordinary next to a rival's
  // lower price.
  const productIds = [...new Set(deals.map((d) => d.productId).filter(Boolean))];
  const priceMap = new Map();
  const key = (productId, supermarket) => `${productId}|${supermarket ?? ''}`;
  for (const ids of chunk(productIds, 500)) {
    const snaps = await prisma.priceSnapshot.findMany({
      where: { productId: { in: ids }, recordedAt: { gte: since } },
      select: { productId: true, supermarket: true, price: true },
    });
    for (const s of snaps) {
      const k = key(s.productId, s.supermarket);
      const arr = priceMap.get(k) || [];
      arr.push(s.price);
      priceMap.set(k, arr);
    }
  }
  console.log(`   (product, chain) series with history: ${priceMap.size}`);

  const tally = {};
  let updated = 0, unchanged = 0;
  const queue = [...deals];

  async function worker() {
    while (queue.length) {
      const d = queue.pop();
      const prices = (d.productId && priceMap.get(key(d.productId, d.supermarket))) || [];
      const { verdict } = computeVerdict(d.discountedPrice, prices);
      tally[verdict || 'none'] = (tally[verdict || 'none'] || 0) + 1;
      if (verdict === (d.priceVerdict ?? null)) { unchanged++; continue; }
      if (!DRY_RUN) {
        await prisma.discount.update({ where: { id: d.id }, data: { priceVerdict: verdict } }).catch(() => {});
      }
      updated++;
      if (updated % 500 === 0) process.stdout.write(`\r   updated ${updated}…   `);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n🏁 verdicts done — updated=${updated} unchanged=${unchanged}`);
  for (const [v, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log('   ', String(n).padStart(5), v);
  }
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
