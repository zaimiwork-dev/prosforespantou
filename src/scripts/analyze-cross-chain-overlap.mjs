// Analyze WHY cross-chain overlap is what it is.
// Look at GTIN format distribution, find suspicious near-misses,
// and identify whether GTIN normalization would increase overlap.

import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');

console.log('━━ GTIN format distribution per chain ━━\n');

const buckets = await prisma.$queryRaw`
  SELECT
    supermarket,
    LENGTH(barcode) AS len,
    LEFT(barcode, 3) AS prefix3,
    COUNT(*)::int AS n
  FROM products
  WHERE barcode IS NOT NULL
  GROUP BY supermarket, LENGTH(barcode), LEFT(barcode, 3)
  ORDER BY supermarket, len, prefix3;
`;

const byChain = {};
for (const b of buckets) {
  byChain[b.supermarket] = byChain[b.supermarket] || {};
  byChain[b.supermarket][`${b.len}d ${b.prefix3}xx`] = b.n;
}

for (const [chain, dist] of Object.entries(byChain)) {
  console.log(`Chain: ${chain}`);
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  let total = 0;
  for (const [k, v] of sorted) total += v;
  console.log(`  total: ${total}`);
  for (const [k, v] of sorted.slice(0, 10)) {
    console.log(`  ${k.padEnd(15)} ${String(v).padStart(5)}  (${((v/total)*100).toFixed(1)}%)`);
  }
  console.log('');
}

console.log('━━ Check GTIN-13/14 mismatch hypothesis ━━');
console.log('If AB stores 15203278051718 and Masoutis stores 5203278051711 (different),');
console.log('would normalizing (strip leading "1") collapse them?\n');

// Look for pairs where one is the 14-digit "1XXXXXXXXXXXX" form and the other is 13-digit "XXXXXXXXXXXXX"
const matches = await prisma.$queryRaw`
  SELECT
    p14.barcode AS gtin14,
    p13.barcode AS gtin13,
    p14.name AS name14,
    p13.name AS name13,
    p14.supermarket AS chain14,
    p13.supermarket AS chain13
  FROM products p14
  JOIN products p13 ON
    LENGTH(p14.barcode) = 14
    AND LEFT(p14.barcode, 1) = '1'
    AND p13.barcode = SUBSTRING(p14.barcode, 2, 13)
  LIMIT 20;
`;

console.log(`Cross-format near-misses found: ${matches.length}\n`);
matches.slice(0, 10).forEach((m) => {
  console.log(`  GTIN-14 ${m.gtin14} [${m.chain14}]  =  GTIN-13 ${m.gtin13} [${m.chain13}]`);
  console.log(`    ${m.name14.slice(0, 60)}`);
  console.log(`    ${m.name13.slice(0, 60)}`);
});

// How many of these near-misses are there in total?
const countMatches = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS n
  FROM products p14
  JOIN products p13 ON
    LENGTH(p14.barcode) = 14
    AND LEFT(p14.barcode, 1) = '1'
    AND p13.barcode = SUBSTRING(p14.barcode, 2, 13);
`;
console.log(`\nTOTAL GTIN-14↔GTIN-13 near-misses: ${countMatches[0].n}`);

await prisma.$disconnect();
