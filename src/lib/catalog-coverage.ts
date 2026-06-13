const CHAINS = ['ab', 'kritikos', 'lidl', 'masoutis', 'mymarket', 'sklavenitis'];

// Images self-hosted on the Supabase mirror look like publicUrlFor() in
// src/scripts/lib/mirror-images.mjs — i.e. they contain this path. Everything
// else still points at a chain CDN and breaks if that host blocks us.
const MIRROR_MARKER = '/storage/v1/object/public/chain-images/';

type CountRow = { supermarket: string | null; _count: { _all: number } };
type PairRow = { supermarket: string | null; productId: string | null };

function countMap(rows: CountRow[]) {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.supermarket) continue;
    out.set(row.supermarket, row._count._all);
  }
  return out;
}

function pairMap(rows: PairRow[]) {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.supermarket || !row.productId) continue;
    out.set(row.supermarket, (out.get(row.supermarket) || 0) + 1);
  }
  return out;
}

const pct = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

export async function fetchCatalogCoverage(prisma: any, now = new Date()) {
  const activeWhere = { isActive: true, validUntil: { gt: now } };

  const [
    totalProducts,
    totalProductsWithImage,
    totalProductsWithBarcode,
    totalActiveOffers,
    totalLinkedActiveOffers,
    totalPendingMatches,
    totalMappings,
    totalNormalBaselineRows,
    sourceProducts,
    sourceProductsWithImage,
    sourceProductsWithBarcode,
    activeOffers,
    linkedActiveOffers,
    unlinkedActiveOffers,
    pendingMatches,
    mappingRows,
    activeLinkedProductRows,
    normalBaselineRows,
    normalBaselineProducts,
    totalProductsMirrored,
    sourceProductsMirrored,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { imageUrl: { not: null } } }),
    prisma.product.count({ where: { barcode: { not: null } } }),
    prisma.discount.count({ where: activeWhere }),
    prisma.discount.count({ where: { ...activeWhere, productId: { not: null } } }),
    prisma.pendingMatch.count(),
    prisma.chainProductMapping.count(),
    prisma.priceSnapshot.count({ where: { kind: 'normal' } }),

    prisma.product.groupBy({ by: ['supermarket'], _count: { _all: true } }),
    prisma.product.groupBy({ by: ['supermarket'], where: { imageUrl: { not: null } }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['supermarket'], where: { barcode: { not: null } }, _count: { _all: true } }),
    prisma.discount.groupBy({ by: ['supermarket'], where: activeWhere, _count: { _all: true } }),
    prisma.discount.groupBy({ by: ['supermarket'], where: { ...activeWhere, productId: { not: null } }, _count: { _all: true } }),
    prisma.discount.groupBy({ by: ['supermarket'], where: { ...activeWhere, productId: null }, _count: { _all: true } }),
    prisma.pendingMatch.groupBy({ by: ['supermarket'], _count: { _all: true } }),

    prisma.chainProductMapping.findMany({
      select: { supermarket: true, productId: true },
      distinct: ['supermarket', 'productId'],
    }),
    prisma.discount.findMany({
      where: { ...activeWhere, productId: { not: null } },
      select: { supermarket: true, productId: true },
      distinct: ['supermarket', 'productId'],
    }),
    prisma.priceSnapshot.groupBy({
      by: ['supermarket'],
      where: { kind: 'normal' },
      _count: { _all: true },
    }),
    prisma.priceSnapshot.findMany({
      where: { kind: 'normal' },
      select: { supermarket: true, productId: true },
      distinct: ['supermarket', 'productId'],
    }),

    // Catalog images self-hosted on the Supabase mirror (resilience metric).
    prisma.product.count({ where: { imageUrl: { contains: MIRROR_MARKER } } }),
    prisma.product.groupBy({ by: ['supermarket'], where: { imageUrl: { contains: MIRROR_MARKER } }, _count: { _all: true } }),
  ]);

  const sourceProductMap = countMap(sourceProducts);
  const sourceImageMap = countMap(sourceProductsWithImage);
  const sourceBarcodeMap = countMap(sourceProductsWithBarcode);
  const activeOfferMap = countMap(activeOffers);
  const linkedOfferMap = countMap(linkedActiveOffers);
  const unlinkedOfferMap = countMap(unlinkedActiveOffers);
  const pendingMap = countMap(pendingMatches);
  const normalRowsMap = countMap(normalBaselineRows);
  const mirroredImageMap = countMap(sourceProductsMirrored);
  const mappingProductMap = pairMap(mappingRows);
  const activeLinkedProductMap = pairMap(activeLinkedProductRows);
  const normalProductMap = pairMap(normalBaselineProducts);

  const chains = CHAINS.map((chain) => {
    const offerRows = activeOfferMap.get(chain) || 0;
    const linkedRows = linkedOfferMap.get(chain) || 0;
    const baselineProducts = normalProductMap.get(chain) || 0;
    const mode = baselineProducts > 0
      ? 'full-catalog-baseline'
      : offerRows > 0
        ? 'offers-only'
        : 'missing';

    return {
      chain,
      mode,
      sourceProducts: sourceProductMap.get(chain) || 0,
      sourceProductsWithImage: sourceImageMap.get(chain) || 0,
      sourceProductsWithBarcode: sourceBarcodeMap.get(chain) || 0,
      sourceProductsMirrored: mirroredImageMap.get(chain) || 0,
      mirroredImageRate: pct(mirroredImageMap.get(chain) || 0, sourceImageMap.get(chain) || 0),
      activeOffers: offerRows,
      linkedActiveOffers: linkedRows,
      unlinkedActiveOffers: unlinkedOfferMap.get(chain) || 0,
      linkedOfferRate: pct(linkedRows, offerRows),
      activeLinkedProducts: activeLinkedProductMap.get(chain) || 0,
      mappedProducts: mappingProductMap.get(chain) || 0,
      pendingMatches: pendingMap.get(chain) || 0,
      normalBaselineRows: normalRowsMap.get(chain) || 0,
      normalBaselineProducts: baselineProducts,
    };
  });

  return {
    checkedAt: now.toISOString(),
    totals: {
      products: totalProducts,
      productsWithImage: totalProductsWithImage,
      productsWithBarcode: totalProductsWithBarcode,
      productsMirrored: totalProductsMirrored,
      mirroredImageRate: pct(totalProductsMirrored, totalProductsWithImage),
      activeOffers: totalActiveOffers,
      linkedActiveOffers: totalLinkedActiveOffers,
      unlinkedActiveOffers: totalActiveOffers - totalLinkedActiveOffers,
      linkedOfferRate: pct(totalLinkedActiveOffers, totalActiveOffers),
      pendingMatches: totalPendingMatches,
      chainMappings: totalMappings,
      normalBaselineRows: totalNormalBaselineRows,
    },
    chains,
  };
}
