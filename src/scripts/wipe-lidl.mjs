const { default: prisma } = await import('../lib/prisma.ts');
const d = await prisma.discount.deleteMany({ where: { supermarket: 'lidl' } });
const p = await prisma.product.deleteMany({ where: { supermarket: 'lidl' } });
console.log(`deleted ${d.count} discounts, ${p.count} products`);
process.exit(0);
