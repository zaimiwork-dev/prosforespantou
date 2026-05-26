// Verify the Masoutis adapter's matches: for each active masoutis/web Discount,
// show the offer name vs the canonical Product it was linked to. Flags pairs
// where the names share few words — likely a wrong cached match.
import 'dotenv/config';

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-zα-ω0-9 ]/gi, ' ')
    .split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(normalize(a));
  const sb = new Set(normalize(b));
  if (!sa.size) return 0;
  let hit = 0;
  for (const w of sa) if (sb.has(w)) hit++;
  return hit / sa.size;
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');

  const discounts = await prisma.discount.findMany({
    where: { supermarket: 'masoutis', source: 'web', isActive: true },
    include: { product: true },
    orderBy: { discountedPrice: 'asc' },
  });

  console.log(`📋 ${discounts.length} active masoutis/web discounts\n`);

  const linked = discounts.filter((d) => d.product);
  const noProduct = discounts.length - linked.length;

  const scored = linked.map((d) => ({
    offer: d.productName,
    product: d.product.name,
    barcode: d.product.barcode || '—',
    price: d.discountedPrice,
    score: overlap(d.productName, d.product.name),
  })).sort((a, b) => a.score - b.score);

  const suspicious = scored.filter((s) => s.score < 0.34);
  const good = scored.filter((s) => s.score >= 0.34);

  console.log(`✅ ${good.length} matches with decent name overlap`);
  console.log(`⚠️  ${suspicious.length} matches with LOW overlap — likely wrong:\n`);
  for (const s of suspicious) {
    console.log(`   [${(s.score * 100).toFixed(0)}%] offer:  "${s.offer}"`);
    console.log(`         product:"${s.product}"  (barcode ${s.barcode})\n`);
  }

  console.log('— 8 random good matches for sanity —');
  for (let i = 0; i < 8 && good.length; i++) {
    const s = good[Math.floor(Math.random() * good.length)];
    console.log(`   [${(s.score * 100).toFixed(0)}%] "${s.offer}"  →  "${s.product}"`);
  }

  console.log(`\nsummary: ${good.length} ok / ${suspicious.length} suspicious / ${noProduct} with no product link`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
