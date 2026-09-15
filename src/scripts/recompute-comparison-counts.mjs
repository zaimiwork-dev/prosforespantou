// Precompute Discount.comparisonCount for every active offer: the number of
// OTHER chains its price-comparison sheet would render rows for (cross-chain
// offers passing the pack/variant guards + barcode-gated shelf prices).
// Cards use it to advertise «Τιμές σε N καταστήματα» — comparison is the
// product's core promise and was invisible until clicked.
//
// The guard chain lives in src/lib/comparison-count.ts and MUST stay in
// lockstep with actions/get-price-comparison.ts (see the comment there).
//
// Idempotent. Run daily in the resolvers-all job AFTER the resolvers (counts
// reflect the rows they just linked). Offers written between passes stay at
// their previous count (new rows: 0 = no chip) until the next run — the sheet
// itself always computes live, so a stale chip under-promises, never lies.
//
// Usage:
//   node src/scripts/recompute-comparison-counts.mjs
//   DRY_RUN=1 node src/scripts/recompute-comparison-counts.mjs
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { comparisonRivals, isCheapestInCluster } from '../lib/comparison-count.ts';
import { SHELF_PRICE_MAX_AGE_DAYS } from '../lib/shelf-comparison.ts';
import { loadFreshShelfChains } from '../lib/feed-freshness.ts';

const DRY_RUN = process.env.DRY_RUN === '1';

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// JS twin of lib/public-deal-filters PUBLIC_DEAL_VISIBILITY_WHERE — the sheet
// only renders publicly-visible rows, so hidden mymarket rows must not count.
const publiclyVisible = (d) =>
  d.supermarket !== 'mymarket' || d.originalPrice != null || d.description != null;

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const now = new Date();

  const active = await prisma.discount.findMany({
    where: { isActive: true, validUntil: { gt: now } },
    select: {
      id: true,
      productId: true,
      productName: true,
      supermarket: true,
      discountedPrice: true,
      originalPrice: true,
      description: true,
      comparisonCount: true,
      isCheapestInCluster: true,
      product: { select: { barcode: true } },
    },
  });
  console.log(`🔢 active deals: ${active.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  // productId → visible cluster offers. Product.barcode is @unique, so the
  // action's barcode lookup resolves to the same single product — the cluster
  // key IS the productId.
  const byPid = new Map();
  for (const d of active) {
    if (!d.productId || !publiclyVisible(d)) continue;
    const arr = byPid.get(d.productId) || [];
    arr.push(d);
    byPid.set(d.productId, arr);
  }

  // Which chains' shelf prices are current = whose catalog feed is alive
  // (lib/feed-freshness). Same loader the action uses — lockstep.
  const freshChains = await loadFreshShelfChains(prisma, now);
  console.log(`   fresh shelf feeds: ${[...freshChains.keys()].sort().join(', ') || '(none)'}`);

  // Normal-shelf snapshots (sanity-capped window) for every barcode-backed cluster.
  const shelfPids = [...new Set(
    active.filter((d) => d.productId && d.product?.barcode).map((d) => d.productId)
  )];
  const since = new Date(now.getTime() - SHELF_PRICE_MAX_AGE_DAYS * 86400000);
  const snapsByPid = new Map();
  for (const ids of chunk(shelfPids, 500)) {
    const snaps = await prisma.priceSnapshot.findMany({
      where: { productId: { in: ids }, kind: 'normal', recordedAt: { gte: since } },
      select: { productId: true, supermarket: true, price: true, recordedAt: true },
    });
    for (const s of snaps) {
      const arr = snapsByPid.get(s.productId) || [];
      arr.push(s);
      snapsByPid.set(s.productId, arr);
    }
  }
  console.log(`   barcode-backed products: ${shelfPids.length}, with fresh shelf snapshots: ${snapsByPid.size}`);

  // Compute, then group changed rows by their new (count, cheapest) pair → one
  // updateMany per distinct value instead of 15k single-row updates.
  // The count and the «cheapest» flag come from the SAME rival rows
  // (lib/comparison-count comparisonRivals), so they cannot disagree.
  const changedByValue = new Map();
  const tally = new Map();
  let withComparison = 0;
  let cheapest = 0;
  for (const d of active) {
    let count = 0;
    let isCheapest = false;
    if (d.productId) {
      const clusterOffers = (byPid.get(d.productId) || []).filter((o) => o.id !== d.id);
      const rivals = comparisonRivals({
        source: d,
        clusterOffers,
        barcodeBacked: Boolean(d.product?.barcode),
        snapshots: snapsByPid.get(d.productId) || [],
        freshChains,
        now,
      });
      count = new Set(rivals.map((r) => r.supermarket)).size;
      // A hidden row (public visibility) is never shown, so it cannot be
      // «cheapest» on screen either.
      isCheapest = publiclyVisible(d) && isCheapestInCluster(d.discountedPrice, rivals);
    }
    tally.set(count, (tally.get(count) || 0) + 1);
    if (count > 0) withComparison++;
    if (isCheapest) cheapest++;
    if (count !== d.comparisonCount || isCheapest !== d.isCheapestInCluster) {
      const k = `${count}|${isCheapest}`;
      const entry = changedByValue.get(k) || { count, isCheapest, ids: [] };
      entry.ids.push(d.id);
      changedByValue.set(k, entry);
    }
  }

  let updated = 0;
  for (const { count, isCheapest, ids } of changedByValue.values()) {
    for (const batch of chunk(ids, 1000)) {
      if (!DRY_RUN) {
        await prisma.discount.updateMany({
          where: { id: { in: batch } },
          data: { comparisonCount: count, isCheapestInCluster: isCheapest },
        });
      }
      updated += batch.length;
    }
  }

  console.log(`🏁 comparison counts done — updated=${updated}, offers with a comparison: ${withComparison}/${active.length}, cheapest in their cluster: ${cheapest}`);
  for (const [count, n] of [...tally.entries()].sort((a, b) => a[0] - b[0])) {
    console.log('   ', `${count} chains:`, n);
  }
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
