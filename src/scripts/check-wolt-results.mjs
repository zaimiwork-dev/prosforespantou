import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const totalProducts = await prisma.product.count();
const withBarcode = await prisma.product.count({ where: { barcode: { not: null } } });
const masoutisWithBarcode = await prisma.product.count({ where: { barcode: { not: null }, supermarket: 'masoutis' } });

// Distinct barcodes (this is the count of unique products)
const distinct = await prisma.$queryRaw`SELECT COUNT(DISTINCT barcode)::int AS n FROM products WHERE barcode IS NOT NULL`;
const distinctMasoutis = await prisma.$queryRaw`SELECT COUNT(DISTINCT barcode)::int AS n FROM products WHERE barcode IS NOT NULL AND supermarket = 'masoutis'`;

console.log(`Total Product rows: ${totalProducts}`);
console.log(`Rows with non-null barcode: ${withBarcode}`);
console.log(`  of those, supermarket=masoutis: ${masoutisWithBarcode}`);
console.log(`Distinct barcodes overall: ${distinct[0].n}`);
console.log(`Distinct masoutis barcodes: ${distinctMasoutis[0].n}`);

// Smoke test was 50 items — they're still tagged masoutis. Total expected if all 3840 succeeded:
console.log(`\nExpected if all unique: 3840 (full run) but smoke-test 50 overlap, so 1265 net new`);
console.log(`Actual: ${distinctMasoutis[0].n} distinct masoutis barcodes`);

// Sample 5 latest-updated rows from the full run
const latest = await prisma.product.findMany({
  where: { barcode: { not: null }, supermarket: 'masoutis' },
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: { barcode: true, name: true, unitInfo: true, imageUrl: true },
});
console.log('\n5 latest masoutis rows:');
latest.forEach((p) => console.log(`  ${p.barcode}  ${p.name}  (${p.unitInfo || ''})`));

await prisma.$disconnect();
