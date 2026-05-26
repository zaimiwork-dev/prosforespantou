// One-shot cleanup: delete Product rows that were created by the Wolt canonical scraper.
// Those are exactly the rows with non-null barcode (legacy 4051 rows have barcode=NULL).
// Will refuse to run if it detects related rows (Discount/PriceSnapshot/etc.) that would orphan.

import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const CONFIRM = process.env.CONFIRM === '1';

const candidateCount = await prisma.product.count({ where: { barcode: { not: null } } });
console.log(`Candidate rows to delete (Product.barcode IS NOT NULL): ${candidateCount}`);

// Safety: check for dependents on those candidates
const ids = await prisma.product.findMany({ where: { barcode: { not: null } }, select: { id: true } });
const idList = ids.map((p) => p.id);
const discountRefs = await prisma.discount.count({ where: { productId: { in: idList } } });
const snapshotRefs = await prisma.priceSnapshot.count({ where: { productId: { in: idList } } });
const matchCacheRefs = await prisma.matchCache.count({ where: { productId: { in: idList } } });
const pendingRefs = await prisma.pendingMatch.count({ where: { suggestedProductId: { in: idList } } });
const chainMapRefs = await prisma.chainProductMapping.count({ where: { productId: { in: idList } } });

console.log('\nDependent rows that reference these Products:');
console.log(`  Discount.productId:                ${discountRefs}`);
console.log(`  PriceSnapshot.productId:           ${snapshotRefs}`);
console.log(`  MatchCache.productId:              ${matchCacheRefs}`);
console.log(`  PendingMatch.suggestedProductId:   ${pendingRefs}`);
console.log(`  ChainProductMapping.productId:     ${chainMapRefs}`);

if (discountRefs > 0) {
  console.log('\n❌ ABORT: there are Discount rows pointing at these Products. Not safe to delete — would orphan price data.');
  console.log('Investigate before retrying.');
  await prisma.$disconnect();
  process.exit(2);
}

if (!CONFIRM) {
  console.log(`\n🔎 DRY RUN — no deletion happened.`);
  console.log(`To execute, re-run with CONFIRM=1 (Bash) or $env:CONFIRM=1 (PowerShell).`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\n💥 DELETING ${candidateCount} Product rows where barcode IS NOT NULL...`);
const result = await prisma.product.deleteMany({ where: { barcode: { not: null } } });
console.log(`✅ Deleted ${result.count} rows.`);

await prisma.$disconnect();
