import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');
const { groupDealsByProduct } = await import('../lib/group-deals.js');

// Pull all active masoutis discounts (the realistic query the homepage runs)
const deals = await prisma.discount.findMany({
  where: { supermarket: 'masoutis', isActive: true },
  include: { product: { select: { name: true } } },
});
console.log(`Raw active rows: ${deals.length}`);

const grouped = groupDealsByProduct(deals);
console.log(`After groupByProduct: ${grouped.length}  (${deals.length - grouped.length} duplicates collapsed)`);

const multi = grouped.filter((g) => g.sources.length > 1);
console.log(`\nProducts with multiple sources (these would have been duplicate cards):`);
console.log(`  count: ${multi.length}`);
for (const g of multi.slice(0, 8)) {
  console.log(`  • ${g.product?.name?.slice(0, 60) ?? g.productName.slice(0, 60)}`);
  console.log(`     sources: [${g.sources.join(', ')}]   chosen price: ${g.discountedPrice}€   original: ${g.originalPrice ?? 'NULL'}`);
}

const singleSource = grouped.filter((g) => g.sources.length === 1);
console.log(`\nProducts with one source: ${singleSource.length}`);
console.log(`  (web only: ${singleSource.filter((g) => g.sources[0] === 'web').length})`);
console.log(`  (leaflet only: ${singleSource.filter((g) => g.sources[0] === 'leaflet').length})`);

// Sanity: every grouped row should have at least one source on it
const noSource = grouped.filter((g) => g.sources.length === 0);
console.log(`\nGrouped rows missing source (BUG if > 0): ${noSource.length}`);

process.exit(0);
