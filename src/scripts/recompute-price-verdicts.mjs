// Precompute Discount.priceVerdict for every active offer, so card lists can
// show an honest "good deal" badge without a per-row price-history query.
//
// Verdict = computeVerdict(offer.discountedPrice, product's 90-day snapshots) —
// the SAME engine the detail page / modal use live (lib/price-verdict.ts). Only
// positive verdicts ('lowest' | 'good') get surfaced as a badge in the UI; we
// store the raw verdict so the card layer decides.
//
// Also (W2a, 2026-09-16) the shelf baseline of every ΜΟΝΟ offer:
// baselinePrice / baselineAt / impliedPercent from lib/baseline-price — the
// chain's latest `normal` snapshot while its catalog feed is alive. Same
// semantics as the detail view's «Κανονική τιμή» and the comparison sheet's
// shelf rows, so a card can never quote a different «normal» price.
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
import { computeBaseline } from '../lib/baseline-price.ts';
import { loadFreshShelfChains } from '../lib/feed-freshness.ts';
import { SHELF_PRICE_MAX_AGE_DAYS } from '../lib/shelf-comparison.ts';

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
  const shelfSince = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);

  const deals = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now } },
    select: {
      id: true, productId: true, supermarket: true, discountedPrice: true, priceVerdict: true,
      offerType: true, originalPrice: true, baselinePrice: true, baselineAt: true, impliedPercent: true,
    },
  });
  console.log(`🔢 active deals: ${deals.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  const freshChains = await loadFreshShelfChains(prisma, now);
  console.log(`   fresh shelf feeds: ${[...freshChains.keys()].join(', ') || '(none)'}`);

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
  // productId+chain -> normal snapshots over the shelf window (baselines).
  const shelfMap = new Map();
  // productId+chain -> mono snapshots (standing-price guard, lib/baseline-price).
  const monoMap = new Map();
  const key = (productId, supermarket) => `${productId}|${supermarket ?? ''}`;
  for (const ids of chunk(productIds, 500)) {
    const [snaps, shelf] = await Promise.all([
      prisma.priceSnapshot.findMany({
        where: { productId: { in: ids }, recordedAt: { gte: since } },
        select: { productId: true, supermarket: true, price: true },
      }),
      // Shelf prices over the longer sanity window: a stable price has no
      // recent row (snapshots are written only on change).
      prisma.priceSnapshot.findMany({
        where: { productId: { in: ids }, kind: { in: ['normal', 'mono'] }, recordedAt: { gte: shelfSince } },
        select: { productId: true, supermarket: true, price: true, kind: true, recordedAt: true },
      }),
    ]);
    for (const s of snaps) {
      const k = key(s.productId, s.supermarket);
      const arr = priceMap.get(k) || [];
      arr.push(s.price);
      priceMap.set(k, arr);
    }
    for (const s of shelf) {
      const k = key(s.productId, s.supermarket);
      const map = s.kind === 'normal' ? shelfMap : monoMap;
      const arr = map.get(k) || [];
      arr.push(s);
      map.set(k, arr);
    }
  }
  console.log(`   (product, chain) series with history: ${priceMap.size}; with shelf prices: ${shelfMap.size}; with mono history: ${monoMap.size}`);

  const tally = {};
  const baselineTally = { withBaseline: 0, belowShelf: 0, notBelowShelf: 0, cleared: 0 };
  let updated = 0, unchanged = 0;
  const queue = [...deals];

  async function worker() {
    while (queue.length) {
      const d = queue.pop();
      const prices = (d.productId && priceMap.get(key(d.productId, d.supermarket))) || [];
      const { verdict } = computeVerdict(d.discountedPrice, prices);
      tally[verdict || 'none'] = (tally[verdict || 'none'] || 0) + 1;

      const base = d.productId
        ? computeBaseline({
            supermarket: d.supermarket,
            discountedPrice: d.discountedPrice,
            offerType: d.offerType,
            originalPrice: d.originalPrice,
            normalSnapshots: shelfMap.get(key(d.productId, d.supermarket)) || [],
            monoSnapshots: monoMap.get(key(d.productId, d.supermarket)) || [],
            freshChains,
            now,
          })
        : null;
      if (base) {
        baselineTally.withBaseline++;
        if (base.impliedPercent > 0) baselineTally.belowShelf++; else baselineTally.notBelowShelf++;
      } else if (d.baselinePrice != null) {
        baselineTally.cleared++;
      }

      const next = {
        priceVerdict: verdict,
        baselinePrice: base ? base.baselinePrice : null,
        baselineAt: base ? base.baselineAt : null,
        impliedPercent: base ? base.impliedPercent : null,
      };
      const same =
        next.priceVerdict === (d.priceVerdict ?? null) &&
        next.baselinePrice === (d.baselinePrice ?? null) &&
        next.impliedPercent === (d.impliedPercent ?? null) &&
        (next.baselineAt?.getTime() ?? null) === (d.baselineAt?.getTime() ?? null);
      if (same) { unchanged++; continue; }
      if (!DRY_RUN) {
        await prisma.discount.update({ where: { id: d.id }, data: next }).catch(() => {});
      }
      updated++;
      if (updated % 500 === 0) process.stdout.write(`\r   updated ${updated}…   `);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n🏁 verdicts + baselines done — updated=${updated} unchanged=${unchanged}`);
  for (const [v, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log('   ', String(n).padStart(5), v);
  }
  console.log(`   baselines: ${baselineTally.withBaseline} ΜΟΝΟ offers (${baselineTally.belowShelf} below shelf, ${baselineTally.notBelowShelf} not below), ${baselineTally.cleared} cleared`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
