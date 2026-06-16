// Shared FULL-CATALOG ingestion — the canonical-catalog writer.
//
// ingest-offers.mjs writes Discounts and NEVER invents a Product (unmatched →
// Review Queue). This companion is the one place allowed to GROW the Product
// catalog from a chain's complete listing — but only with a DETERMINISTIC
// identity, never an LLM guess:
//   • real barcode (GTIN) when the source exposes one → dedupes cross-chain, or
//   • the chain's own stable SKU via ChainProductMapping → chain-local product
//     (same shape as the existing barcode-less Masoutis catalog rows).
// That deterministic key is the catalog-purity line PHASES.md draws.
//
// It records each item's shelf price as a `kind:'normal'` PriceSnapshot
// (on-change), and — the payoff that compounds — creating ChainProductMapping
// (chain, sku) here means the OFFERS pipeline's step-1 lookup hits instantly on
// the next run, so a chain's offer link-rate climbs toward 100% as its catalog
// fills in.
//
// items: [{ chainItemcode, name, price, imageUrl?, brand?, unitInfo?, barcode?,
//           baseline? }]
//   baseline:false  → create/keep the Product + SKU mapping but DON'T snapshot a
//                     shelf price (use for rows whose `price` is a promo price,
//                     e.g. an on-offer card — its real shelf price arrives on a
//                     future run when it's off-offer).
//
// Batched for 10k–20k-row catalogs. Safety: 0 valid items → no-op, never deletes.

import { SM_MAPPING, normalizeBarcode, withDbRetry } from './ingest-offers.mjs';

async function recordCatalogRun(prisma, chain, runStart, out, dryRun) {
  if (dryRun) return;
  try {
    await prisma.ingestRun.create({
      data: {
        chain,
        source: 'catalog',
        startedAt: runStart,
        scrapedItems: out.total,
        matched: out.existing + out.mapped,
        reviewQueued: out.skipped,
        unmatchedShown: 0,
        priceChanges: out.snapshots,
        deactivated: 0,
        errors: out.errors,
        healthOk: out.healthOk,
        warnings: out.warnings,
      },
    });
  } catch (e) {
    console.log(`   ⚠️ could not record catalog IngestRun: ${e.message}`);
  }
}

export async function ingestCatalog({ chain, items, dryRun = false, extraWarnings = [] }) {
  if (!chain || !SM_MAPPING[chain]) throw new Error(`Unknown chain slug: "${chain}"`);
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const runStart = new Date();
  const out = {
    total: items.length,
    created: 0,
    existing: 0,
    mapped: 0,
    snapshots: 0,
    unchanged: 0,
    skipped: 0,
    errors: 0,
    healthOk: extraWarnings.length === 0,
    warnings: [...extraWarnings],
  };

  // A catalog item needs a stable per-chain SKU (identity), a name, and a price.
  const valid = items.filter((it) => it && it.name && it.chainItemcode && it.price > 0);
  out.skipped = items.length - valid.length;
  if (valid.length === 0) {
    out.healthOk = false;
    out.warnings.push('Catalog adapter returned 0 valid items — treated as a broken scrape.');
    console.log(`   🗂️ catalog [${chain}]: no valid items — skipping (nothing deleted)`);
    if (!dryRun) {
      const { default: prisma } = await import('../../lib/prisma.ts');
      await recordCatalogRun(prisma, chain, runStart, out, dryRun);
      await prisma.$disconnect();
    }
    return out;
  }

  const { default: prisma } = await import('../../lib/prisma.ts');

  // Preload this chain's SKU→productId map + a barcode index in a few queries.
  const mappings = await withDbRetry('catalog mappings', () =>
    prisma.chainProductMapping.findMany({ where: { supermarket: chain }, select: { chainItemcode: true, productId: true } }));
  const skuToPid = new Map(mappings.map((m) => [String(m.chainItemcode), m.productId]));

  const barcodes = [...new Set(valid.map((it) => normalizeBarcode(it.barcode)).filter(Boolean))];
  const barcodeToPid = new Map();
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const prods = await withDbRetry('catalog barcodes', () =>
      prisma.product.findMany({ where: { barcode: { in: chunk } }, select: { id: true, barcode: true } }));
    for (const p of prods) if (p.barcode) barcodeToPid.set(p.barcode, p.id);
  }

  if (dryRun) {
    let create = 0;
    for (const it of valid) {
      const bc = normalizeBarcode(it.barcode);
      if (skuToPid.has(String(it.chainItemcode)) || (bc && barcodeToPid.has(bc))) continue;
      create++;
    }
    console.log(`   🗂️ catalog [${chain}] (dry): ${valid.length} valid → ~${create} new Products, ${valid.length - create} existing`);
    return out;
  }

  const store = await withDbRetry('catalog store', () =>
    prisma.store.upsert({ where: { name: SM_MAPPING[chain] }, create: { name: SM_MAPPING[chain] }, update: {} }));

  // Resolve every item → productId (create when neither SKU nor barcode known).
  // Existing rows aren't field-churned every run — only identity + the SKU
  // mapping are ensured; image/brand refresh is left to the offer scrape and
  // the catalog-image mirror, so steady-state runs stay cheap.
  const wantPrice = new Map(); // productId → shelf price to snapshot (first wins)
  for (const it of valid) {
    const sku = String(it.chainItemcode);
    const bc = normalizeBarcode(it.barcode);
    try {
      let pid = skuToPid.get(sku) || (bc ? barcodeToPid.get(bc) : null);
      if (pid) {
        out.existing++;
        // Matched by barcode but no SKU mapping yet → add it (links offers next run).
        if (!skuToPid.has(sku)) {
          await withDbRetry('catalog map', () => prisma.chainProductMapping.upsert({
            where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: sku } },
            create: { supermarket: chain, chainItemcode: sku, productId: pid },
            update: { productId: pid },
          }));
          skuToPid.set(sku, pid);
          out.mapped++;
        }
      } else {
        const created = await withDbRetry('catalog create', () => prisma.product.create({
          data: {
            name: it.name.trim(),
            barcode: bc || null,
            imageUrl: it.imageUrl || null,
            brand: it.brand?.trim() || null,
            unitInfo: it.unitInfo?.trim() || null,
            supermarket: chain,
            storeId: store.id,
          },
        }));
        pid = created.id;
        await withDbRetry('catalog map-new', () => prisma.chainProductMapping.upsert({
          where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: sku } },
          create: { supermarket: chain, chainItemcode: sku, productId: pid },
          update: { productId: pid },
        }));
        skuToPid.set(sku, pid);
        if (bc) barcodeToPid.set(bc, pid);
        out.created++;
      }
      if (it.baseline !== false && !wantPrice.has(pid)) wantPrice.set(pid, it.price);
    } catch {
      out.errors++;
    }
  }

  // Shelf-price snapshots, on-change (DISTINCT ON latest 'normal' per product).
  const pids = [...wantPrice.keys()];
  const lastNormal = new Map();
  for (let i = 0; i < pids.length; i += 1000) {
    const chunk = pids.slice(i, i + 1000);
    const snaps = await withDbRetry('catalog last-normal', () =>
      prisma.priceSnapshot.findMany({
        where: { supermarket: chain, kind: 'normal', productId: { in: chunk } },
        orderBy: [{ productId: 'asc' }, { recordedAt: 'desc' }],
        distinct: ['productId'],
        select: { productId: true, price: true },
      }));
    for (const s of snaps) lastNormal.set(s.productId, s.price);
  }
  const toWrite = [];
  for (const [pid, price] of wantPrice) {
    if (lastNormal.get(pid) === price) { out.unchanged++; continue; }
    toWrite.push({ productId: pid, supermarket: chain, price, isDiscounted: false, kind: 'normal' });
  }
  for (let i = 0; i < toWrite.length; i += 1000) {
    const chunk = toWrite.slice(i, i + 1000);
    await withDbRetry('catalog snap insert', () => prisma.priceSnapshot.createMany({ data: chunk }));
    out.snapshots += chunk.length;
  }

  if (out.errors > 0) {
    out.healthOk = false;
    out.warnings.push(`${out.errors} catalog item(s) failed while writing.`);
  }

  console.log(`   🗂️ catalog [${chain}]: ${out.created} created, ${out.existing} existing (+${out.mapped} newly mapped), ${out.snapshots} snapshots, ${out.unchanged} unchanged, ${out.errors} err (of ${out.total})`);
  await recordCatalogRun(prisma, chain, runStart, out, dryRun);
  return out;
}
