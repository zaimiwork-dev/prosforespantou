import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');

const line = (s = '') => console.log(s);
const heading = (s) => { line(); line('═'.repeat(78)); line(s); line('═'.repeat(78)); };

heading('1. Active Masoutis discounts by source');
const bySource = await prisma.$queryRawUnsafe(`
  SELECT source, count(*)::int AS total,
         count(*) FILTER (WHERE is_active) ::int AS active,
         count(*) FILTER (WHERE original_price IS NOT NULL AND is_active) ::int AS active_with_strikethrough
  FROM discounts WHERE supermarket = 'masoutis'
  GROUP BY source ORDER BY source;
`);
console.table(bySource);

heading('2. Sample 8 random ACTIVE web matches — verify product fit');
const webSample = await prisma.discount.findMany({
  where: { supermarket: 'masoutis', source: 'web', isActive: true },
  include: { product: { select: { name: true, imageUrl: true } } },
  take: 8,
});
for (const d of webSample) {
  line(`  PROD : ${d.product?.name ?? '(no product link!)'}`);
  line(`  RAW  : ${d.productName}`);
  line(`  PRICE: ${d.discountedPrice}€   orig=${d.originalPrice}   pct=${d.discountPercent}`);
  line(`  CAT  : ${d.category}`);
  line(`  VALID: ${d.validFrom?.toISOString().slice(0,10)} → ${d.validUntil?.toISOString().slice(0,10)}`);
  line('  ─');
}

heading('3. Sample 8 random ACTIVE leaflet matches — verify product fit');
const leafletSample = await prisma.discount.findMany({
  where: { supermarket: 'masoutis', source: 'leaflet', isActive: true },
  include: { product: { select: { name: true, imageUrl: true } } },
  take: 8,
});
for (const d of leafletSample) {
  line(`  PROD : ${d.product?.name ?? '(no product link!)'}`);
  line(`  RAW  : ${d.productName}`);
  line(`  PRICE: ${d.discountedPrice}€   orig=${d.originalPrice}   pct=${d.discountPercent}`);
  line(`  CAT  : ${d.category}`);
  line('  ─');
}

heading('4. Suspicious rows — discountedPrice >= originalPrice (price polluted)');
const polluted = await prisma.$queryRawUnsafe(`
  SELECT source, product_name, discounted_price, original_price, discount_percent
  FROM discounts
  WHERE supermarket = 'masoutis' AND is_active
    AND original_price IS NOT NULL
    AND discounted_price >= original_price
  LIMIT 5;
`);
console.table(polluted.length ? polluted : [{ msg: 'none — good' }]);

heading('5. Active rows with no productId (orphaned)');
const orphans = await prisma.$queryRawUnsafe(`
  SELECT source, count(*)::int AS rows_without_product_link
  FROM discounts
  WHERE supermarket = 'masoutis' AND is_active AND product_id IS NULL
  GROUP BY source;
`);
console.table(orphans.length ? orphans : [{ msg: 'all active rows linked to a product' }]);

heading('6. Multi-source coverage — products active in BOTH web and leaflet');
const dual = await prisma.$queryRawUnsafe(`
  SELECT p.name AS product_name,
         max(CASE WHEN d.source='web' THEN d.discounted_price END) AS web_price,
         max(CASE WHEN d.source='leaflet' THEN d.discounted_price END) AS leaflet_price
  FROM discounts d
  JOIN products p ON p.id = d.product_id
  WHERE d.supermarket = 'masoutis' AND d.is_active
  GROUP BY p.id, p.name
  HAVING count(DISTINCT d.source) >= 2
  ORDER BY p.name
  LIMIT 10;
`);
console.table(dual.length ? dual : [{ msg: 'no dual-source products yet' }]);

heading('7. Pending matches in review queue — top categories of stuck items');
const pending = await prisma.$queryRawUnsafe(`
  SELECT supermarket, count(*)::int AS waiting,
         min(created_at) AS oldest,
         max(created_at) AS newest
  FROM pending_matches
  GROUP BY supermarket;
`);
console.table(pending);

heading('8. Sample 10 oldest pending matches — would these realistically match the catalog?');
const pendingSample = await prisma.pendingMatch.findMany({
  where: { supermarket: 'masoutis' },
  take: 10,
  orderBy: { createdAt: 'asc' },
});
for (const p of pendingSample) {
  line(`  ${p.rawName.slice(0, 80)}`);
  line(`     ${p.aiConfidence}% conf • ${p.imageUrl ? 'has image' : 'NO image'}`);
}

heading('9. Stale data check — anything still active past validUntil?');
const stale = await prisma.$queryRawUnsafe(`
  SELECT source, count(*)::int AS expired_but_active
  FROM discounts
  WHERE supermarket = 'masoutis' AND is_active AND valid_until < NOW()
  GROUP BY source;
`);
console.table(stale.length ? stale : [{ msg: 'all active rows have valid_until in future' }]);

heading('10. Distribution of active discount % by source');
const pctDist = await prisma.$queryRawUnsafe(`
  SELECT source,
         count(*) FILTER (WHERE discount_percent IS NULL)::int AS no_pct,
         count(*) FILTER (WHERE discount_percent BETWEEN 1 AND 19)::int AS pct_1_19,
         count(*) FILTER (WHERE discount_percent BETWEEN 20 AND 39)::int AS pct_20_39,
         count(*) FILTER (WHERE discount_percent BETWEEN 40 AND 100)::int AS pct_40plus,
         count(*) FILTER (WHERE discount_percent < 0 OR discount_percent > 100)::int AS pct_invalid
  FROM discounts
  WHERE supermarket = 'masoutis' AND is_active
  GROUP BY source;
`);
console.table(pctDist);

process.exit(0);
