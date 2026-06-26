// Read-only reconciliation of current official, product-level leaflet feeds.
//
// It deliberately audits only sources that expose stable offer SKUs. Other
// chains' leaflet viewers do not expose a product feed yet, so they are called
// out as unsupported instead of being reported as "covered" by assumption.
//
// Usage:
//   npm run audit:leaflets
//   STRICT=1 npm run audit:leaflets  # exits non-zero on a coverage mismatch

import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { default: prisma } = await import('../lib/prisma.ts');
const { collectLidlOffers } = await import('./adapters/lidl.mjs');
const { collectMasoutisOffers } = await import('./adapters/masoutis.mjs');

const STRICT = process.env.STRICT === '1';
const now = new Date();

const unsupportedChains = [
  ['ab', 'The official leaflet has no product-level collector yet.'],
  ['bazaar', 'The official leaflet has no product-level collector yet.'],
  ['kritikos', 'The official leaflet has no product-level collector yet.'],
  ['mymarket', 'The official leaflet has no product-level collector yet.'],
  ['sklavenitis', 'The official leaflet has no product-level collector yet.'],
];

function section(title) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

async function activeOffersBySku(chain, source) {
  const rows = await prisma.discount.findMany({
    where: {
      supermarket: chain,
      source,
      isActive: true,
      validUntil: { gt: now },
    },
    select: {
      chainItemcode: true,
      productName: true,
      discountedPrice: true,
    },
  });
  return new Map(rows.filter((row) => row.chainItemcode).map((row) => [String(row.chainItemcode), row]));
}

async function auditLeafletSource({ chain, collect }) {
  const collected = await collect();
  const items = collected.items || [];
  const activeBySku = await activeOffersBySku(chain, 'leaflet');
  const sourceSkus = new Set(items.map((item) => String(item.chainItemcode)));
  const missing = items.filter((item) => !activeBySku.has(String(item.chainItemcode)));
  const extraLive = [...activeBySku.values()].filter((row) => !sourceSkus.has(String(row.chainItemcode)));
  const priceMismatches = items.filter((item) => {
    const live = activeBySku.get(String(item.chainItemcode));
    return live && Math.abs(Number(live.discountedPrice) - Number(item.price)) > 0.001;
  });

  const status = collected.partial
    ? 'partial-source'
    : missing.length || extraLive.length || priceMismatches.length
      ? 'mismatch'
      : 'covered';

  console.table([{
    chain,
    sourceItems: items.length,
    activePublicRows: activeBySku.size,
    missingFromPublic: missing.length,
    extraPublicRows: extraLive.length,
    priceMismatches: priceMismatches.length,
    status,
  }]);

  const samples = [
    ...missing.slice(0, 10).map((item) => ({ issue: 'missing', sku: item.chainItemcode, name: item.name })),
    ...extraLive.slice(0, 10).map((item) => ({ issue: 'extra-live', sku: item.chainItemcode, name: item.productName })),
    ...priceMismatches.slice(0, 10).map((item) => ({ issue: 'price', sku: item.chainItemcode, name: item.name })),
  ];
  if (samples.length) console.table(samples);
  return { chain, status };
}

try {
  section('Direct leaflet coverage');
  const results = [];
  results.push(await auditLeafletSource({
    chain: 'lidl',
    collect: () => collectLidlOffers(),
  }));
  results.push(await auditLeafletSource({
    chain: 'masoutis',
    collect: () => collectMasoutisOffers({ source: 'leaflet', log: () => {} }),
  }));

  section('Leaflet sources not yet machine-verifiable');
  console.table(unsupportedChains.map(([chain, reason]) => ({ chain, status: 'unsupported', reason })));

  if (STRICT && results.some((result) => result.status !== 'covered')) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
