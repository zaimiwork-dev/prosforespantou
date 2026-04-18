// Run with: node --env-file=.env.local src/scripts/check-match-data.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const totalProducts = await prisma.product.count();
  const withBarcode = await prisma.product.count({ where: { barcode: { not: null } } });

  const activeDiscounts = await prisma.discount.count({
    where: { isActive: true, validUntil: { gt: now } },
  });
  const discountsWithProduct = await prisma.discount.count({
    where: { isActive: true, validUntil: { gt: now }, productId: { not: null } },
  });

  const perSupermarket = await prisma.discount.groupBy({
    by: ['supermarket'],
    where: { isActive: true, validUntil: { gt: now } },
    _count: { _all: true },
  });

  const sharedBarcodes = await prisma.$queryRaw`
    SELECT barcode, COUNT(DISTINCT supermarket) AS n_supermarkets, COUNT(*) AS n_products
    FROM products
    WHERE barcode IS NOT NULL
    GROUP BY barcode
    HAVING COUNT(DISTINCT supermarket) > 1
    LIMIT 20
  `;

  console.log('=== PRODUCTS ===');
  console.log('Total products:', totalProducts);
  console.log('With barcode:', withBarcode, `(${((withBarcode / totalProducts) * 100).toFixed(1)}%)`);

  console.log('\n=== ACTIVE DISCOUNTS ===');
  console.log('Total active:', activeDiscounts);
  console.log('Linked to a product:', discountsWithProduct, `(${((discountsWithProduct / activeDiscounts) * 100).toFixed(1)}%)`);

  console.log('\n=== ACTIVE DISCOUNTS PER SUPERMARKET ===');
  for (const r of perSupermarket) console.log(`  ${r.supermarket || '(null)'}: ${r._count._all}`);

  console.log('\n=== BARCODES SHARED ACROSS SUPERMARKETS (sample of 20) ===');
  if (sharedBarcodes.length === 0) {
    console.log('  NONE — no cross-supermarket matches possible via barcode.');
  } else {
    for (const r of sharedBarcodes) {
      console.log(`  ${r.barcode}: ${r.n_supermarkets} supermarkets, ${r.n_products} products`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
