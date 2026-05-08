import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');

const rows = await prisma.$queryRawUnsafe(`
  SELECT source, count(*)::int AS total,
         count(*) FILTER (WHERE is_active) ::int AS active
  FROM discounts
  WHERE supermarket = 'masoutis'
  GROUP BY source
  ORDER BY source;
`);
console.log('Masoutis discounts by source:');
console.table(rows);

const dual = await prisma.$queryRawUnsafe(`
  SELECT product_id, count(*)::int AS sources_per_product
  FROM discounts
  WHERE supermarket = 'masoutis' AND is_active = true AND product_id IS NOT NULL
  GROUP BY product_id
  HAVING count(DISTINCT source) >= 2
  LIMIT 5;
`);
console.log(`\nProducts with active rows in BOTH web and leaflet (sample of up to 5):`);
console.table(dual);

process.exit(0);
