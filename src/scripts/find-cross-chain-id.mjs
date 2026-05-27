import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const rows = await prisma.$queryRaw`
  SELECT d.id, d.supermarket, d.product_name, d.discounted_price
  FROM discounts d
  WHERE d.product_id IN (
    SELECT p.id FROM products p
    JOIN discounts d2 ON d2.product_id = p.id
    WHERE d2.is_active = true AND d2.valid_until > NOW()
    GROUP BY p.id HAVING COUNT(DISTINCT d2.supermarket) >= 2
  )
  AND d.is_active = true AND d.valid_until > NOW()
  ORDER BY d.product_name, d.discounted_price
  LIMIT 4
`;
for (const r of rows) {
  console.log(`${r.supermarket}  | ${r.id} | €${r.discounted_price} | ${r.product_name?.slice(0, 50)}`);
}
await prisma.$disconnect();
