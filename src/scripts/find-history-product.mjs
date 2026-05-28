import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');
// Find an active Discount on a product that has lots of snapshots
const rows = await prisma.$queryRaw`
  SELECT d.id, d.supermarket, d.product_name, d.discounted_price,
         (SELECT COUNT(*) FROM price_snapshots WHERE product_id = d.product_id)::int AS snaps
  FROM discounts d
  WHERE d.is_active = true AND d.valid_until > NOW() AND d.product_id IS NOT NULL
  ORDER BY snaps DESC NULLS LAST
  LIMIT 3
`;
for (const r of rows) console.log(`${r.snaps} snaps | ${r.id} | ${r.supermarket} | €${r.discounted_price} | ${r.product_name?.slice(0,55)}`);
await prisma.$disconnect();
