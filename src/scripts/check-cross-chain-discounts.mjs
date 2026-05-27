// One-shot: find Products that have active Discounts across multiple chains.
// Used to verify the cross-chain comparison UI has real data to display.
import 'dotenv/config';

const { default: prisma } = await import('../lib/prisma.ts');

const rows = await prisma.$queryRaw`
  SELECT p.id, p.name,
         COUNT(DISTINCT d.supermarket)::int AS chains,
         array_agg(DISTINCT d.supermarket) AS sms,
         array_agg(DISTINCT d.discounted_price ORDER BY d.discounted_price) AS prices
  FROM products p
  JOIN discounts d ON d.product_id = p.id
  WHERE d.is_active = true AND d.valid_until > NOW()
  GROUP BY p.id, p.name
  HAVING COUNT(DISTINCT d.supermarket) >= 2
  ORDER BY COUNT(DISTINCT d.supermarket) DESC, p.name
  LIMIT 15
`;

for (const r of rows) {
  console.log(`${r.chains}× | ${r.name.slice(0, 60)} | ${r.sms.join(',')} | €${r.prices.join(' / ')}`);
}

const totalRow = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS n FROM (
    SELECT p.id FROM products p
    JOIN discounts d ON d.product_id = p.id
    WHERE d.is_active = true AND d.valid_until > NOW()
    GROUP BY p.id HAVING COUNT(DISTINCT d.supermarket) >= 2
  ) AS x
`;
console.log(`\ntotal cross-chain Products: ${totalRow[0].n}`);

await prisma.$disconnect();
