import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

// How many snapshots, oldest, distribution per product
const overall = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS total,
         MIN(recorded_at) AS oldest,
         MAX(recorded_at) AS newest
  FROM price_snapshots
`;
console.log('overall:', overall[0]);

const perProduct = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS snapshots_per_product, COUNT(*)::int AS products
  FROM (
    SELECT product_id, COUNT(*) AS c FROM price_snapshots GROUP BY product_id
  ) sub
  GROUP BY c
  ORDER BY c DESC
  LIMIT 8
`;
console.log('\nproducts with N snapshots:');
console.log(perProduct);

// Top 5 products with most snapshots — these are the proof cases
const top = await prisma.$queryRaw`
  SELECT p.name, COUNT(ps.*)::int AS snaps,
         MIN(ps.price) AS min_p, MAX(ps.price) AS max_p,
         array_agg(DISTINCT ps.supermarket) AS chains
  FROM price_snapshots ps JOIN products p ON p.id = ps.product_id
  GROUP BY p.id, p.name
  ORDER BY snaps DESC
  LIMIT 5
`;
console.log('\ntop products with most snapshots:');
for (const r of top) {
  console.log(`  ${r.snaps} snaps | €${r.min_p}-€${r.max_p} | ${r.chains.join(',')} | ${r.name.slice(0, 50)}`);
}

await prisma.$disconnect();
