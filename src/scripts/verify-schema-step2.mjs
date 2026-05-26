// Verify the schema changes actually landed.
import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

// 1. Confirm new Product columns exist by querying them
const sampleProduct = await prisma.product.findFirst({
  select: { id: true, name: true, barcode: true, brand: true, unitInfo: true },
});
console.log('Sample Product row with new fields:');
console.log(JSON.stringify(sampleProduct, null, 2));

// 2. Confirm ChainProductMapping table exists by counting
const mappingCount = await prisma.chainProductMapping.count();
console.log(`\nChainProductMapping row count: ${mappingCount} (should be 0)`);

// 3. Confirm the @unique constraint on barcode exists
const constraints = await prisma.$queryRaw`
  SELECT conname, contype
  FROM pg_constraint
  WHERE conrelid = 'products'::regclass
    AND contype = 'u'
  ORDER BY conname;
`;
console.log('\nUnique constraints on products table:');
constraints.forEach((c) => console.log(`  ${c.conname}`));

await prisma.$disconnect();
