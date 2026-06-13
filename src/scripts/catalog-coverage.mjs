// Read-only catalog coverage report.
//
// Usage:
//   node src/scripts/catalog-coverage.mjs
//   JSON=1 node src/scripts/catalog-coverage.mjs
//
// dotenv first (ESM hoist trap — DB import comes later).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { default: prisma } = await import('../lib/prisma.ts');
const { fetchCatalogCoverage } = await import('../lib/catalog-coverage.ts');

const coverage = await fetchCatalogCoverage(prisma);

if (process.env.JSON === '1') {
  console.log(JSON.stringify(coverage, null, 2));
} else {
  console.log(`\nCatalog coverage @ ${coverage.checkedAt}`);
  console.table(coverage.totals);
  console.table(coverage.chains.map((c) => ({
    chain: c.chain,
    mode: c.mode,
    activeOffers: c.activeOffers,
    linked: `${c.linkedActiveOffers} (${c.linkedOfferRate}%)`,
    unlinked: c.unlinkedActiveOffers,
    pending: c.pendingMatches,
    mappedProducts: c.mappedProducts,
    sourceProducts: c.sourceProducts,
    gtinProducts: c.sourceProductsWithBarcode,
    baselineProducts: c.normalBaselineProducts,
  })));
}

await prisma.$disconnect();
