import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');
const rows = await prisma.$queryRaw`
  WITH stats AS (
    SELECT product_id, MIN(price) AS min_p, MAX(price) AS max_p, COUNT(*)::int AS snaps
    FROM price_snapshots GROUP BY product_id
  )
  SELECT d.id, d.product_name, d.discounted_price, s.min_p, s.max_p, s.snaps
  FROM discounts d
  JOIN stats s ON s.product_id = d.product_id
  WHERE d.is_active = true AND d.valid_until > NOW()
    AND s.snaps > 10 AND s.max_p > s.min_p * 1.3
    AND d.discounted_price <= s.min_p + 0.01
  LIMIT 3
`;
for (const r of rows) console.log(`min=${r.min_p} max=${r.max_p} current=${r.discounted_price} | ${r.id} | ${r.product_name?.slice(0,55)}`);
await prisma.$disconnect();
