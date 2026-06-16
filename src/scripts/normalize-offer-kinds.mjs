// Normalize existing offer kind data after adapters learned the stricter
// contract:
//   Discount.offerType: 'strikethrough' | 'mono'
//   PriceSnapshot.kind: 'normal' | 'strikethrough' | 'mono'
//
// Safe default is dry-run. Apply with:
//   APPLY=1 node src/scripts/normalize-offer-kinds.mjs

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const APPLY = process.env.APPLY === '1';
const { default: prisma } = await import('../lib/prisma.ts');

const discountPreview = await prisma.$queryRaw`
  SELECT
    supermarket AS chain,
    count(*)::int AS rows,
    count(*) FILTER (WHERE original_price IS NOT NULL AND original_price > discounted_price)::int AS to_strikethrough,
    count(*) FILTER (WHERE original_price IS NULL OR original_price <= discounted_price)::int AS to_mono
  FROM discounts
  WHERE offer_type IS NULL OR offer_type NOT IN ('mono', 'strikethrough')
  GROUP BY supermarket
  ORDER BY supermarket;
`;

const snapshotPreview = await prisma.$queryRaw`
  SELECT
    supermarket AS chain,
    count(*)::int AS rows,
    count(*) FILTER (WHERE is_discounted = true)::int AS to_strikethrough,
    count(*) FILTER (WHERE is_discounted = false)::int AS to_mono
  FROM price_snapshots
  WHERE kind IS NOT NULL AND kind NOT IN ('normal', 'mono', 'strikethrough')
  GROUP BY supermarket
  ORDER BY supermarket;
`;

console.log(`\nNormalize offer kinds${APPLY ? ' (APPLY)' : ' (DRY_RUN)'}`);
console.log('\nDiscount rows to normalize:');
console.table(discountPreview.length ? discountPreview : [{ ok: 'none' }]);
console.log('\nPriceSnapshot rows to normalize:');
console.table(snapshotPreview.length ? snapshotPreview : [{ ok: 'none' }]);

if (APPLY) {
  const discounts = await prisma.$executeRaw`
    UPDATE discounts
    SET offer_type = CASE
      WHEN original_price IS NOT NULL AND original_price > discounted_price THEN 'strikethrough'
      ELSE 'mono'
    END
    WHERE offer_type IS NULL OR offer_type NOT IN ('mono', 'strikethrough');
  `;

  const snapshots = await prisma.$executeRaw`
    UPDATE price_snapshots
    SET kind = CASE
      WHEN is_discounted = true THEN 'strikethrough'
      ELSE 'mono'
    END
    WHERE kind IS NOT NULL AND kind NOT IN ('normal', 'mono', 'strikethrough');
  `;

  console.log(`\nUpdated discounts=${discounts}, snapshots=${snapshots}`);
} else {
  console.log('\nNo rows changed. Re-run with APPLY=1 to normalize.');
}

await prisma.$disconnect();
