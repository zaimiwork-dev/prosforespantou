import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');

console.log('=== Active web rows after Groq re-run ===');
const counts = await prisma.$queryRawUnsafe(`
  SELECT count(*)::int AS active,
         count(*) FILTER (WHERE original_price IS NOT NULL)::int AS with_strikethrough
  FROM discounts WHERE supermarket = 'masoutis' AND source = 'web' AND is_active;
`);
console.table(counts);

console.log('\n=== Looking for the two specific bad matches that were in the old run ===');
const eggs = await prisma.discount.findFirst({
  where: { supermarket: 'masoutis', source: 'web', isActive: true, productName: { contains: 'Αυγοδιατροφική Αυγά Φρέσκα Μεσαία 10x53', mode: 'insensitive' } },
  include: { product: { select: { name: true } } },
});
console.log('Αυγοδιατροφική 10x53γρ:', eggs ? `MATCHED to "${eggs.product?.name}"` : 'NOT in active web rows (good — was bad match before)');

const fix = await prisma.discount.findFirst({
  where: { supermarket: 'masoutis', source: 'web', isActive: true, productName: { contains: 'Φιξ Ελλάς', mode: 'insensitive' } },
  include: { product: { select: { name: true } } },
});
console.log('Φιξ Ελλάς Lager 5+1:', fix ? `MATCHED to "${fix.product?.name}"` : 'NOT in active web rows (good — was bad match before)');

console.log('\n=== Random sample of 10 active web matches (verify quality) ===');
const sample = await prisma.discount.findMany({
  where: { supermarket: 'masoutis', source: 'web', isActive: true },
  include: { product: { select: { name: true } } },
  take: 10,
});
for (const d of sample) {
  const prod = d.product?.name ?? '(NO PRODUCT)';
  const looksWrong = prod.split(' ')[0]?.toLowerCase() !== d.productName.split(' ')[0]?.toLowerCase();
  console.log(`  ${looksWrong ? '⚠️ ' : '✓ '}RAW: ${d.productName.slice(0, 70)}`);
  console.log(`     PROD: ${prod.slice(0, 70)}`);
  console.log(`     ${d.discountedPrice}€  orig=${d.originalPrice}  pct=${d.discountPercent}`);
}

console.log('\n=== Pending review queue total ===');
const pending = await prisma.pendingMatch.count({ where: { supermarket: 'masoutis' } });
console.log(`  ${pending} items waiting for admin review`);

process.exit(0);
