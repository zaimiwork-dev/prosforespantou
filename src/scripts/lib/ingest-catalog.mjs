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
//           description?, baseline? }]
//   baseline:false  → create/keep the Product + SKU mapping but DON'T snapshot a
//                     shelf price (use for rows whose `price` is a promo price,
//                     e.g. an on-offer card — its real shelf price arrives on a
//                     future run when it's off-offer).
//
// writeMappings:false is for supplemental catalogs whose item id is NOT the
// chain's own SKU (e.g. Wolt venue item ids). Products/baselines can still be
// enriched by barcode, but we do not poison ChainProductMapping with fake SKUs.
// requireBarcode:true skips rows that cannot be deterministically canonicalized.
//
// Batched for 10k–20k-row catalogs. Safety: 0 valid items → no-op, never deletes.

import { SM_MAPPING, normalizeBarcode, withDbRetry } from './ingest-offers.mjs';
import {
  evaluateVolume,
  VOLUME_HISTORY,
  VOLUME_MIN_REFERENCE,
  CATALOG_VOLUME_MIN_SAMPLES,
} from '../../lib/pipeline-health.ts';
import { representativeCatalogCount } from '../../lib/catalog-run-count.ts';

async function recordCatalogRun(prisma, chain, runStart, out, dryRun, sourceLabel) {
  if (dryRun) return;
  try {
    await prisma.ingestRun.create({
      data: {
        chain,
        source: sourceLabel,
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

export async function ingestCatalog({
  chain,
  items,
  dryRun = false,
  extraWarnings = [],
  writeMappings = true,
  requireBarcode = false,
  // Opt-in: refresh name/description/image/brand/unitInfo on products we
  // already have. Off by default — a steady-state catalog run should not churn
  // 10k rows every Sunday (the offer scrape and the image mirror keep those
  // fields fresh). kritikos-canonical turns it on because that is exactly what
  // its hand-rolled upsert did before it was routed through here, and it is the
  // richest source of unitInfo/brand we have for that chain. Only rows whose
  // values actually differ are written.
  refreshFields = false,
  // Which IngestRun series this run belongs to. A chain's own catalog walk and
  // a supplemental Wolt enrichment cover different item counts (ab: ~11.7k vs
  // ~4.1k), so filing both under 'catalog' makes the series meaningless and
  // would read as a volume collapse to anything comparing consecutive runs.
  sourceLabel = 'catalog',
} = {}) {
  if (!chain || !SM_MAPPING[chain]) throw new Error(`Unknown chain slug: "${chain}"`);
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const runStart = new Date();
  const out = {
    total: items.length,
    created: 0,
    existing: 0,
    mapped: 0,
    // Provenance repair on mappings we already had (see the stamping block).
    stamped: 0,
    rebound: 0,
    refreshed: 0,
    snapshots: 0,
    unchanged: 0,
    skipped: 0,
    errors: 0,
    healthOk: extraWarnings.length === 0,
    warnings: [...extraWarnings],
  };

  // A catalog item needs a name, a price, and either a stable chain SKU
  // (normal chain catalogs) or a barcode (supplemental canonical catalogs).
  const valid = items.filter((it) => {
    if (!it || !it.name || !(it.price > 0)) return false;
    if (requireBarcode && !normalizeBarcode(it.barcode)) return false;
    return writeMappings ? Boolean(it.chainItemcode) : Boolean(it.chainItemcode || normalizeBarcode(it.barcode));
  });
  out.skipped = items.length - valid.length;
  if (valid.length === 0) {
    out.healthOk = false;
    out.warnings.push('Catalog adapter returned 0 valid items — treated as a broken scrape.');
    console.log(`   🗂️ catalog [${chain}]: no valid items — skipping (nothing deleted)`);
    if (!dryRun) {
      const { default: prisma } = await import('../../lib/prisma.ts');
      await recordCatalogRun(prisma, chain, runStart, out, dryRun, sourceLabel);
      await prisma.$disconnect();
    }
    return out;
  }

  const { default: prisma } = await import('../../lib/prisma.ts');

  // VOLUME GUARD — the twin of ingestOffers' SAFETY 2, which this writer never
  // had. A catalog walk that dies half-way (a killed scheduled task, a proxy
  // that starts 403-ing, a site that changes its pagination) still finishes
  // "successfully" with a fraction of the catalog, and was recorded
  // health_ok=true: Sklavenitis logged a 29-item run on 2026-09-13 against a
  // ~7.5k norm and nothing alarmed. Nothing here is destructive (ingestCatalog
  // never deactivates and never deletes), so a collapse does not stop the
  // write — stale shelf prices are worse than a short top-up. It flips the
  // health flag, which is what the Υγεία tab and the watchdog read.
  const priorRuns = await withDbRetry('catalog prior runs', () =>
    prisma.ingestRun.findMany({
      where: { chain, source: sourceLabel, healthOk: true },
      orderBy: { finishedAt: 'desc' },
      take: VOLUME_HISTORY,
      select: { scrapedItems: true },
    })).catch(() => []);
  // Prior runs recorded `scrapedItems` = everything the adapter handed over;
  // we compare the USABLE count against it, which is the stricter of the two
  // readings — a walk that comes back full of unparseable rows is as broken as
  // one that comes back short.
  //
  // Reference = the newest prior run that is itself at least half the recent
  // peak (lib/catalog-run-count), NOT a median: the Sklavenitis series holds
  // months of 29–34-item rows (the Wolt enrichment filed itself under
  // 'catalog' until 2026-09-15), and a median of those would bless the very
  // truncated walk this guard exists to catch.
  const reference = representativeCatalogCount(priorRuns);
  if (
    reference > VOLUME_MIN_REFERENCE &&
    evaluateVolume(valid.length, [reference], CATALOG_VOLUME_MIN_SAMPLES) === 'collapsed'
  ) {
    out.healthOk = false;
    out.warnings.push(
      `partial catalog (${valid.length} vs typical ${reference}) — ` +
      `${valid.length} usable of ${out.total} scraped; the walk returned a fraction of this chain's usual catalog ` +
      `and shelf prices for the missing items keep their previous values.`
    );
    console.log(`   ⚠️ catalog [${chain}]: partial run — ${valid.length} items vs typical ${reference}`);
  }

  // Preload this chain's SKU→productId map + a barcode index in a few queries.
  // matchedVia rides along so the stamping pass below can skip rows that are
  // already barcode-proven without a second query per item.
  const mappings = writeMappings
    ? await withDbRetry('catalog mappings', () =>
        prisma.chainProductMapping.findMany({ where: { supermarket: chain }, select: { chainItemcode: true, productId: true, matchedVia: true } }))
    : [];
  const skuToPid = new Map(mappings.map((m) => [String(m.chainItemcode), m.productId]));
  const skuToVia = new Map(mappings.map((m) => [String(m.chainItemcode), m.matchedVia]));

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
    // The real write loop registers each new barcode as it goes, so two batch
    // items sharing a barcode create ONE product. Mirror that here or the dry
    // run overstates its own yield — which matters now that multi-venue Wolt
    // runs legitimately carry the same product several times.
    const wouldCreate = new Set();
    for (const it of valid) {
      const bc = normalizeBarcode(it.barcode);
      if (skuToPid.has(String(it.chainItemcode)) || (bc && barcodeToPid.has(bc))) continue;
      if (bc) {
        if (wouldCreate.has(bc)) continue;
        wouldCreate.add(bc);
      }
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
  const toStamp = []; // SKUs whose existing mapping is proven by this run's GTIN
  const toRefresh = []; // [productId, item] — only when refreshFields is on
  for (const it of valid) {
    const sku = String(it.chainItemcode);
    const bc = normalizeBarcode(it.barcode);
    try {
      let pid = skuToPid.get(sku) || (bc ? barcodeToPid.get(bc) : null);
      if (pid) {
        out.existing++;
        // The SKU mapping already existed and this item carries a GTIN → the
        // catalog can PROVE what the mapping only asserted. Without this the
        // stamp landed once, on the run that created the mapping, and never
        // again (matched_via was NULL on ~98% of rows on 2026-09-15).
        if (writeMappings && skuToPid.has(sku) && bc && skuToVia.get(sku) !== 'barcode') {
          const byBarcode = barcodeToPid.get(bc);
          if (byBarcode && byBarcode === pid) {
            toStamp.push(sku); // batched below
            skuToVia.set(sku, 'barcode');
          } else if (byBarcode) {
            // The chain's own GTIN names a DIFFERENT product than the stored
            // mapping. A barcode is proof: rebind, and say so out loud — a
            // rebind means the previous (name-based) link was wrong and any
            // comparison built on it was too.
            await withDbRetry('catalog rebind', () => prisma.chainProductMapping.update({
              where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: sku } },
              data: { productId: byBarcode, matchedVia: 'barcode', verifiedAt: new Date() },
            }));
            pid = byBarcode;
            skuToPid.set(sku, byBarcode);
            skuToVia.set(sku, 'barcode');
            out.rebound++;
          }
        }
        // Matched by barcode but no SKU mapping yet → add it (links offers next run).
        if (writeMappings && !skuToPid.has(sku)) {
          await withDbRetry('catalog map', () => prisma.chainProductMapping.upsert({
            where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: sku } },
            // Reached only when the SKU was unknown and `pid` came from the
            // barcode index — i.e. the chain's own GTIN matched this Product.
            create: { supermarket: chain, chainItemcode: sku, productId: pid, matchedVia: 'barcode', verifiedAt: new Date() },
            update: { productId: pid, matchedVia: 'barcode', verifiedAt: new Date() },
          }));
          skuToPid.set(sku, pid);
          skuToVia.set(sku, 'barcode');
          out.mapped++;
        }
        // Existing Product → optionally refresh its descriptive fields (batched
        // below so a run that changes nothing writes nothing).
        if (refreshFields) toRefresh.push([pid, it]);
      } else {
        const created = await withDbRetry('catalog create', () => prisma.product.create({
          data: {
            name: it.name.trim(),
            barcode: bc || null,
            description: it.description?.trim() || null,
            imageUrl: it.imageUrl || null,
            brand: it.brand?.trim() || null,
            unitInfo: it.unitInfo?.trim() || null,
            supermarket: chain,
            storeId: store.id,
          },
        }));
        pid = created.id;
        if (writeMappings) {
          await withDbRetry('catalog map-new', () => prisma.chainProductMapping.upsert({
            where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: sku } },
            // Product was just created FROM this catalog item, so the mapping
            // is right by construction — but only a GTIN makes it comparable
            // across chains.
            create: { supermarket: chain, chainItemcode: sku, productId: pid, matchedVia: bc ? 'barcode' : 'catalog', verifiedAt: new Date() },
            update: { productId: pid },
          }));
          skuToPid.set(sku, pid);
          skuToVia.set(sku, bc ? 'barcode' : 'catalog');
        }
        if (bc) barcodeToPid.set(bc, pid);
        out.created++;
      }
      if (it.baseline !== false && !wantPrice.has(pid)) wantPrice.set(pid, it.price);
    } catch {
      out.errors++;
    }
  }

  // Provenance stamps for mappings we already had, batched: one UPDATE per 500
  // SKUs instead of one per item. NOT matchedVia:'barcode' is belt-and-braces —
  // the in-memory filter above already excluded those, but the guard means a
  // concurrent run can never downgrade a stamp.
  for (let i = 0; i < toStamp.length; i += 500) {
    const chunk = toStamp.slice(i, i + 500);
    const res = await withDbRetry('catalog stamp', () => prisma.chainProductMapping.updateMany({
      where: { supermarket: chain, chainItemcode: { in: chunk }, NOT: { matchedVia: 'barcode' } },
      data: { matchedVia: 'barcode', verifiedAt: new Date() },
    }));
    out.stamped += res.count;
  }

  // Optional descriptive-field refresh (refreshFields). Reads the current
  // values first and writes only real diffs, so the steady state is ~2 queries
  // per 500 products instead of one UPDATE per product.
  if (toRefresh.length > 0) {
    const byPid = new Map(toRefresh); // last item wins for a duplicated product
    const ids = [...byPid.keys()];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const current = await withDbRetry('catalog refresh read', () => prisma.product.findMany({
        where: { id: { in: chunk } },
        select: { id: true, name: true, description: true, imageUrl: true, brand: true, unitInfo: true },
      }));
      for (const row of current) {
        const it = byPid.get(row.id);
        if (!it) continue;
        const next = {
          name: it.name.trim(),
          description: it.description?.trim() || null,
          imageUrl: it.imageUrl || null,
          brand: it.brand?.trim() || null,
          unitInfo: it.unitInfo?.trim() || null,
        };
        // Never blank a field we already have with a null the source omitted.
        for (const k of Object.keys(next)) if (next[k] == null) next[k] = row[k];
        if (Object.keys(next).every((k) => next[k] === row[k])) continue;
        try {
          await withDbRetry('catalog refresh', () => prisma.product.update({ where: { id: row.id }, data: next }));
          out.refreshed++;
        } catch {
          out.errors++;
        }
      }
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
  console.log(`      provenance: ${out.stamped} stamped 'barcode', ${out.rebound} rebound by GTIN${refreshFields ? `, ${out.refreshed} products refreshed` : ''}`);
  await recordCatalogRun(prisma, chain, runStart, out, dryRun, sourceLabel);
  return out;
}
