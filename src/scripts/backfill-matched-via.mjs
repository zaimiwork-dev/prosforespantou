// One-off (idempotent) backfill for ChainProductMapping.matched_via.
//
// WHY: `matched_via` is the difference between a comparison we can PROVE and
// one we merely believe, but it was only ever stamped on the run that CREATED a
// mapping — a later run hit the SKU lookup in ingest-offers' matchItem() and
// returned immediately. Measured 2026-09-15: NULL on ~98% of rows (ab 12,483
// null / 324 'catalog'; kritikos 5,918 null / 33 'barcode' even though Kritikos
// offers are 99.8% GTIN-backed). With the ingest-time stamping fixed, live rows
// converge on their own — but only for chains whose items carry a GTIN, and
// only for SKUs that still appear in a feed. This script stamps the rest, using
// ONLY facts already in the database.
//
// WHAT IT STAMPS (nothing else — when in doubt the row stays NULL):
//   'catalog' — matched_via IS NULL, the mapped Product has NO barcode, the
//               Product's own `supermarket` is this chain, the Product has
//               exactly ONE mapping, and no match_cache row links that product
//               to this chain. That combination can only have come from this
//               chain's own catalog SKU: correct by construction, single-chain,
//               nothing to compare against. No guessing involved.
//   'cache'   — matched_via IS NULL and a match_cache row exists for
//               (product_id, supermarket): the link was resolved by NAME, by an
//               LLM or an admin. Plausible, NOT proven — which is precisely
//               what 'cache' is there to say.
//
// WHAT IT NEVER STAMPS: 'barcode'. Proving a barcode match needs the chain
// item's own GTIN, which lives in the chain's feed, not in our tables. A
// Product having a barcode says where the PRODUCT's GTIN came from, not how
// this chain's SKU was matched to it. Those rows get stamped by the pipeline
// on the next run that sees the item (ingest-offers matchItem step 1 /
// ingestCatalog), which is the only place the proof exists.
//
// verified_at is deliberately left alone: we did not verify anything today, we
// inferred provenance from rows written earlier. Stamping a fresh timestamp
// would claim a check that never happened.
//
// Usage:
//   node src/scripts/backfill-matched-via.mjs        # DRY RUN (default)
//   APPLY=1 node src/scripts/backfill-matched-via.mjs
//
// dotenv first (ESM hoist trap — see CLAUDE.md).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const APPLY = process.env.APPLY === '1';

// Shared predicate text, kept in ONE place so the count and the update can
// never drift apart (a backfill whose preview and write disagree is worse than
// no backfill at all).
const CACHE_WHERE = `
  m.matched_via IS NULL
  AND EXISTS (
    SELECT 1 FROM match_cache c
    WHERE c.product_id = m.product_id AND c.supermarket = m.supermarket
  )`;

const CATALOG_WHERE = `
  m.matched_via IS NULL
  AND p.barcode IS NULL
  AND p.supermarket = m.supermarket
  AND NOT EXISTS (
    SELECT 1 FROM match_cache c
    WHERE c.product_id = m.product_id AND c.supermarket = m.supermarket
  )
  AND (
    SELECT count(*) FROM chain_product_mappings m2 WHERE m2.product_id = m.product_id
  ) = 1`;

function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => '   ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(line(columns));
  console.log('   ' + widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(columns.map((c) => r[c]))));
}

async function provenanceByChain(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT supermarket,
           (count(*) FILTER (WHERE matched_via IS NULL))::int     AS "null",
           (count(*) FILTER (WHERE matched_via = 'barcode'))::int AS barcode,
           (count(*) FILTER (WHERE matched_via = 'catalog'))::int AS catalog,
           (count(*) FILTER (WHERE matched_via = 'cache'))::int   AS cache,
           (count(*) FILTER (WHERE matched_via NOT IN ('barcode','catalog','cache')))::int AS other,
           count(*)::int                                           AS total
    FROM chain_product_mappings
    GROUP BY supermarket
    ORDER BY supermarket
  `);
  return rows;
}

async function wouldStamp(prisma) {
  const cache = await prisma.$queryRawUnsafe(`
    SELECT m.supermarket, count(*)::int AS n
    FROM chain_product_mappings m
    WHERE ${CACHE_WHERE}
    GROUP BY m.supermarket ORDER BY m.supermarket
  `);
  const catalog = await prisma.$queryRawUnsafe(`
    SELECT m.supermarket, count(*)::int AS n
    FROM chain_product_mappings m
    JOIN products p ON p.id = m.product_id
    WHERE ${CATALOG_WHERE}
    GROUP BY m.supermarket ORDER BY m.supermarket
  `);
  return { cache, catalog };
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  console.log(`🏷️  matched_via backfill — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes; set APPLY=1 to write)'}`);

  const before = await provenanceByChain(prisma);
  console.log('\nBEFORE — chain_product_mappings.matched_via by chain:');
  table(before, ['supermarket', 'null', 'barcode', 'catalog', 'cache', 'other', 'total']);

  const { cache, catalog } = await wouldStamp(prisma);
  const chains = [...new Set([...before.map((r) => r.supermarket)])].sort();
  const plan = chains.map((c) => ({
    supermarket: c,
    "→'cache'": cache.find((r) => r.supermarket === c)?.n ?? 0,
    "→'catalog'": catalog.find((r) => r.supermarket === c)?.n ?? 0,
  }));
  const totalCache = plan.reduce((s, r) => s + r["→'cache'"], 0);
  const totalCatalog = plan.reduce((s, r) => s + r["→'catalog'"], 0);
  console.log(`\n${APPLY ? 'STAMPING' : 'WOULD STAMP'} — provable without an LLM:`);
  table(plan, ['supermarket', "→'cache'", "→'catalog'"]);
  console.log(`   total: ${totalCache} → 'cache', ${totalCatalog} → 'catalog' (${totalCache + totalCatalog} rows)`);

  if (!APPLY) {
    console.log("\n(no writes — 'barcode' is never stamped offline; those rows converge as the pipeline re-verifies them)");
    await prisma.$disconnect();
    return;
  }

  // 'cache' first: the 'catalog' predicate excludes rows with a match_cache
  // row, so the two sets are disjoint and the order cannot change the outcome —
  // but doing the cheap, exact one first keeps the log readable if it is
  // interrupted.
  const stampedCache = await prisma.$executeRawUnsafe(`
    UPDATE chain_product_mappings m
    SET matched_via = 'cache'
    WHERE ${CACHE_WHERE}
  `);
  console.log(`   stamped 'cache':   ${stampedCache}`);

  const stampedCatalog = await prisma.$executeRawUnsafe(`
    UPDATE chain_product_mappings m
    SET matched_via = 'catalog'
    FROM products p
    WHERE p.id = m.product_id AND ${CATALOG_WHERE}
  `);
  console.log(`   stamped 'catalog': ${stampedCatalog}`);

  const after = await provenanceByChain(prisma);
  console.log('\nAFTER — chain_product_mappings.matched_via by chain:');
  table(after, ['supermarket', 'null', 'barcode', 'catalog', 'cache', 'other', 'total']);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(`\n❌ ${e.stack || e.message}`);
  process.exit(1);
});
