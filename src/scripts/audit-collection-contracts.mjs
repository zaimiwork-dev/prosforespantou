// Read-only audit for the autonomous collection contract.
//
// Checks the DB shape after scrapers run:
// - active offers carry normalized offerType values (`mono` / `strikethrough`);
// - PriceSnapshot.kind uses the known vocabulary (`normal` / `mono` / `strikethrough`);
// - every chain's active offers have stable chainItemcode coverage and image coverage;
// - catalog/baseline coverage is visible per chain.
//
// Usage:
//   node src/scripts/audit-collection-contracts.mjs
//   STRICT=1 node src/scripts/audit-collection-contracts.mjs  # non-zero on invalid kinds
//   STRICT_COMPLETENESS=1 ...  # also fail partial/missing full-catalog coverage
//   COMPLETENESS_EXEMPT=sklavenitis STRICT_COMPLETENESS=1 ...  # known blocked chains

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { default: prisma } = await import('../lib/prisma.ts');
const { fetchCatalogCoverage } = await import('../lib/catalog-coverage.ts');

const STRICT = process.env.STRICT === '1';
const STRICT_COMPLETENESS = process.env.STRICT_COMPLETENESS === '1';
const COMPLETENESS_EXEMPT = new Set(
  (process.env.COMPLETENESS_EXEMPT || '').split(',').map((s) => s.trim()).filter(Boolean),
);

function section(title) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

section('Active offer shape by chain');
const offerShape = await prisma.$queryRaw`
  SELECT
    supermarket AS chain,
    count(*)::int AS active,
    count(*) FILTER (WHERE product_id IS NOT NULL)::int AS linked,
    count(*) FILTER (WHERE product_id IS NULL)::int AS productless,
    count(*) FILTER (WHERE chain_itemcode IS NOT NULL)::int AS with_sku,
    count(*) FILTER (WHERE image_url IS NOT NULL)::int AS with_image,
    count(*) FILTER (WHERE offer_type = 'mono')::int AS mono,
    count(*) FILTER (WHERE offer_type = 'strikethrough')::int AS strikethrough,
    count(*) FILTER (
      WHERE offer_type IS NOT NULL AND offer_type NOT IN ('mono', 'strikethrough')
    )::int AS invalid_offer_type,
    count(*) FILTER (WHERE offer_type IS NULL)::int AS missing_offer_type
  FROM discounts
  WHERE is_active = true AND valid_until > NOW()
  GROUP BY supermarket
  ORDER BY supermarket;
`;
console.table(offerShape);

section('Unexpected Discount.offerType values');
const invalidOfferTypes = await prisma.$queryRaw`
  SELECT supermarket AS chain, offer_type, count(*)::int AS rows
  FROM discounts
  WHERE offer_type IS NOT NULL AND offer_type NOT IN ('mono', 'strikethrough')
  GROUP BY supermarket, offer_type
  ORDER BY rows DESC, supermarket, offer_type;
`;
console.table(invalidOfferTypes.length ? invalidOfferTypes : [{ ok: 'none' }]);

section('Unexpected PriceSnapshot.kind values');
const invalidSnapshotKinds = await prisma.$queryRaw`
  SELECT supermarket AS chain, kind, count(*)::int AS rows
  FROM price_snapshots
  WHERE kind IS NOT NULL AND kind NOT IN ('normal', 'mono', 'strikethrough')
  GROUP BY supermarket, kind
  ORDER BY rows DESC, supermarket, kind;
`;
console.table(invalidSnapshotKinds.length ? invalidSnapshotKinds : [{ ok: 'none' }]);

section('Latest collection runs');
const latestRuns = await prisma.$queryRaw`
  SELECT DISTINCT ON (chain, source)
    chain,
    source,
    finished_at AS "finishedAt",
    scraped_items AS "scrapedItems",
    matched,
    review_queued AS "reviewQueued",
    price_changes AS "priceChanges",
    errors,
    health_ok AS "healthOk",
    warnings
  FROM ingest_runs
  ORDER BY chain, source, finished_at DESC;
`;
console.table(latestRuns.map((r) => ({
  chain: r.chain,
  source: r.source,
  finishedAt: r.finishedAt?.toISOString?.() || r.finishedAt,
  scrapedItems: r.scrapedItems,
  matched: r.matched,
  reviewQueued: r.reviewQueued,
  priceChanges: r.priceChanges,
  errors: r.errors,
  healthOk: r.healthOk,
  warnings: Array.isArray(r.warnings) ? r.warnings.length : 0,
})));

section('Catalog / baseline coverage');
const coverage = await fetchCatalogCoverage(prisma);
console.table(coverage.chains.map((c) => ({
  chain: c.chain,
  mode: c.mode,
  activeOffers: c.activeOffers,
  linkedOfferRate: `${c.linkedOfferRate}%`,
  mappedProducts: c.mappedProducts,
  sourceProducts: c.sourceProducts,
  gtinProducts: c.sourceProductsWithBarcode,
  mirroredImageRate: `${c.mirroredImageRate}%`,
  baselineProducts: c.normalBaselineProducts,
  baselineRate: `${c.baselineCoverageRate}%`,
  baselineStatus: c.baselineCompleteness,
  pricedProducts: c.currentlyPricedProducts,
  pricedRate: `${c.currentlyPricedRate}%`,
  catalogStatus: c.catalogCompleteness,
})));

const invalidCount =
  invalidOfferTypes.reduce((sum, row) => sum + Number(row.rows || 0), 0) +
  invalidSnapshotKinds.reduce((sum, row) => sum + Number(row.rows || 0), 0);

await prisma.$disconnect();

if (STRICT && invalidCount > 0) {
  console.error(`\nCollection contract failed: ${invalidCount} row(s) use unexpected offer/snapshot kinds.`);
  process.exit(1);
}

if (STRICT_COMPLETENESS) {
  const incomplete = coverage.chains.filter((c) => !COMPLETENESS_EXEMPT.has(c.chain) && c.catalogCompleteness !== 'complete');
  if (incomplete.length > 0) {
    console.error(`\nCatalog completeness failed: ${incomplete.map((c) => `${c.chain}:${c.catalogCompleteness}`).join(', ')}`);
    process.exit(1);
  }
}
