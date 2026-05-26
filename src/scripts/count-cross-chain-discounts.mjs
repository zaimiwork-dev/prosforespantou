import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

const masoutisDiscounts = await prisma.discount.count({
  where: { isActive: true, supermarket: 'masoutis', source: 'wolt' },
});
const abDiscounts = await prisma.discount.count({
  where: { isActive: true, supermarket: 'ab', source: 'wolt' },
});
console.log(`Active Wolt-sourced discounts:`);
console.log(`  Masoutis: ${masoutisDiscounts}`);
console.log(`  AB:       ${abDiscounts}`);

// Products with active Wolt discounts at BOTH chains
const crossChain = await prisma.$queryRaw`
  SELECT
    p.id, p.name, p.barcode, p.image_url,
    m.discounted_price AS masoutis_price, m.original_price AS masoutis_original,
    a.discounted_price AS ab_price,         a.original_price AS ab_original
  FROM products p
  JOIN discounts m ON m.product_id = p.id AND m.is_active = true AND m.supermarket = 'masoutis' AND m.source = 'wolt'
  JOIN discounts a ON a.product_id = p.id AND a.is_active = true AND a.supermarket = 'ab'       AND a.source = 'wolt'
  ORDER BY (m.discounted_price + a.discounted_price) ASC
  LIMIT 25;
`;
console.log(`\n🎯 Products on offer at BOTH chains right now: ${crossChain.length}`);
if (crossChain.length === 0) {
  console.log('   (none — overlap of currently-discounted items is empty)');
} else {
  console.log('\nSample comparison cards we could render today:\n');
  for (const r of crossChain.slice(0, 20)) {
    const mDelta = r.masoutis_original ? Math.round(((r.masoutis_original - r.masoutis_price) / r.masoutis_original) * 100) : 0;
    const aDelta = r.ab_original ? Math.round(((r.ab_original - r.ab_price) / r.ab_original) * 100) : 0;
    const winner = r.masoutis_price < r.ab_price ? '🏆 MASOUTIS' : (r.ab_price < r.masoutis_price ? '🏆 AB' : '🤝 tie');
    console.log(`  ${winner}  ${r.name.slice(0, 55)}`);
    console.log(`             Masoutis ${r.masoutis_price.toFixed(2)}€ (-${mDelta}%)   AB ${r.ab_price.toFixed(2)}€ (-${aDelta}%)`);
  }
}

await prisma.$disconnect();
