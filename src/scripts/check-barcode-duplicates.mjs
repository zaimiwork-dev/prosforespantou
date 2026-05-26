// Sanity check before adding @unique to Product.barcode.
// Reports: how many products have a barcode, and whether any value appears twice.

import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const total = await prisma.product.count();
const withBarcode = await prisma.product.count({ where: { barcode: { not: null } } });

console.log(`Total Product rows: ${total}`);
console.log(`Rows with non-null barcode: ${withBarcode}`);

if (withBarcode === 0) {
  console.log('\n✅ Safe to add @unique — column is empty across all rows.');
  await prisma.$disconnect();
  process.exit(0);
}

// Group by barcode, report any duplicates
const rows = await prisma.$queryRaw`
  SELECT barcode, COUNT(*)::int AS n
  FROM products
  WHERE barcode IS NOT NULL
  GROUP BY barcode
  HAVING COUNT(*) > 1
  ORDER BY n DESC
  LIMIT 20;
`;

if (rows.length === 0) {
  console.log('\n✅ Safe to add @unique — all existing barcodes are distinct.');
} else {
  console.log(`\n⚠️  ${rows.length} barcode value(s) appear on multiple rows:`);
  for (const r of rows) console.log(`   ${r.barcode} — ${r.n} rows`);
  console.log('\nResolve these before adding @unique (deduplicate or null out one side).');
}

await prisma.$disconnect();
