// Spot-check that the Wolt scraper wrote real data to Product.
import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const total = await prisma.product.count();
const withBarcode = await prisma.product.count({ where: { barcode: { not: null } } });
const supermarketCounts = await prisma.product.groupBy({
  by: ['supermarket'],
  _count: true,
  where: { barcode: { not: null } },
});

console.log(`Total Product rows: ${total}`);
console.log(`Rows with non-null barcode: ${withBarcode}`);
console.log(`\nBy supermarket (rows with barcode set):`);
supermarketCounts.forEach((g) => console.log(`  ${g.supermarket || '(null)'}: ${g._count}`));

console.log(`\n5 sample rows that just got written:`);
const samples = await prisma.product.findMany({
  where: { barcode: { not: null } },
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: { id: true, name: true, barcode: true, unitInfo: true, imageUrl: true, supermarket: true, brand: true, updatedAt: true },
});
samples.forEach((p) => {
  console.log(`\n  id=${p.id}`);
  console.log(`  barcode=${p.barcode}`);
  console.log(`  name=${p.name}`);
  console.log(`  unitInfo=${p.unitInfo}  brand=${p.brand}  supermarket=${p.supermarket}`);
  console.log(`  image=${p.imageUrl ? p.imageUrl.slice(0, 80) + '...' : 'null'}`);
});

await prisma.$disconnect();
