// Shared offer-ingestion pipeline.
//
// Every chain adapter (src/scripts/adapters/*.mjs) produces a list of OfferItem
// objects and hands them here. This file is the ONLY place that writes Discount,
// PriceSnapshot, ChainProductMapping and PendingMatch rows for chain-direct
// ingestion — so the matching logic and the safety rules live in one spot.
//
// See src/scripts/adapters/CONTRACT.md for the OfferItem shape.

import 'dotenv/config';
import { computeHotScore } from '../../lib/hotness.ts';
import { categorizeForChain, hasChainMap } from '../../lib/categories.ts';

// Chain slug → Store.name (must match what's already in the DB).
const SM_MAPPING = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
  galaxias: 'Γαλαξίας',
  efresh: 'e-fresh',
};

// ── Barcode normalization (GTIN-14 → GTIN-13) ───────────────────────────────
// Same logic as wolt-canonical-scraper.mjs — kept identical so a barcode from
// any source normalizes to the same canonical key.
function gtin13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(twelve[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
function normalizeBarcode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 14 && /^[01]/.test(s)) {
    const twelve = s.slice(1, 13);
    return twelve + gtin13CheckDigit(twelve);
  }
  return s;
}

// ── Small DB retry — survives Neon/Supabase pooler cold-start ────────────────
const RETRY_DELAYS = [5000, 10000, 20000, 30000];
async function withDbRetry(label, fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const transient = /EAUTHTIMEOUT|ECONNREFUSED|ETIMEDOUT|Connection terminated/i.test(e.message || '');
      if (!transient || attempt >= RETRY_DELAYS.length) throw e;
      const delay = RETRY_DELAYS[attempt];
      console.log(`   ⏳ DB hiccup on ${label} — retry ${attempt + 1} in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ── Per-item match: barcode-first waterfall, never invents a Product ─────────
// Returns { productId } or { productId: null } (→ caller routes to Review Queue).
// When dryRun is true, performs only reads — never writes mappings/cache.
async function matchItem(prisma, item, chain, dryRun) {
  // Bind a chain SKU → Product mapping so future runs hit step 1 directly.
  async function bind(productId) {
    if (dryRun || !item.chainItemcode) return;
    await prisma.chainProductMapping.upsert({
      where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: String(item.chainItemcode) } },
      create: { supermarket: chain, chainItemcode: String(item.chainItemcode), productId },
      update: { productId },
    });
  }

  // 1. Known chain SKU → instant hit, no work.
  if (item.chainItemcode) {
    const mapping = await prisma.chainProductMapping.findUnique({
      where: { supermarket_chainItemcode: { supermarket: chain, chainItemcode: String(item.chainItemcode) } },
    });
    if (mapping) return { productId: mapping.productId, via: 'mapping' };
  }

  // 2. Barcode → canonical Product. Record a mapping so step 1 hits next time.
  const barcode = normalizeBarcode(item.barcode);
  if (barcode) {
    const product = await prisma.product.findUnique({ where: { barcode } });
    if (product) {
      await bind(product.id);
      return { productId: product.id, via: 'barcode' };
    }
  }

  // 3. MatchCache — a name match a previous LLM run already resolved.
  const cached = await prisma.matchCache.findUnique({
    where: { rawName_supermarket: { rawName: item.name, supermarket: chain } },
  });
  if (cached) {
    if (!dryRun) {
      await prisma.matchCache.update({ where: { id: cached.id }, data: { lastUsedAt: new Date() } });
    }
    await bind(cached.productId);
    return { productId: cached.productId, via: 'cache' };
  }

  // 4. No deterministic match — the LLM matcher (separate pass) handles these.
  return { productId: null, via: 'none' };
}

// ── Write/update one Discount + a PriceSnapshot if the price moved ───────────
// productId may be NULL (display-first): the offer is shown to users with the
// chain's own data, and the resolver/admin claims the row with a productId
// later. The chain's SKU is the dedup key for these rows — without it a
// productless offer can't be written (no stable identity across runs).
async function writeOffer(prisma, item, productId, storeId, chain, source, runStart, unmappedLabels) {
  const now = new Date();
  const chainItemcode = item.chainItemcode != null ? String(item.chainItemcode) : null;
  if (!productId && !chainItemcode) return { snapshotWritten: false, skipped: true };
  const validFrom = item.validFrom ? new Date(item.validFrom) : now;
  const validUntil = item.validUntil
    ? new Date(item.validUntil)
    : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const originalPrice =
    item.originalPrice && item.originalPrice > item.price ? item.originalPrice : null;
  const discountPercent = originalPrice
    ? Math.round((1 - item.price / originalPrice) * 100)
    : null;

  // The adapter's item.category is the chain's native label → keep it as the
  // subcategory (provenance!) and derive the department through the per-chain
  // native map first, keywords as fallback. Labels the map doesn't know are
  // collected so the run report can surface them for curation.
  const nativeCat = item.category && item.category !== 'Άλλο' ? item.category : null;
  const { dept, mapped } = categorizeForChain(chain, item.name, nativeCat);
  if (!mapped && nativeCat && hasChainMap(chain) && unmappedLabels) unmappedLabels.add(nativeCat);
  const data = {
    productName: item.name,
    category: dept,
    subcategory: nativeCat,
    discountedPrice: item.price,
    originalPrice,
    discountPercent,
    validFrom,
    validUntil,
    imageUrl: item.imageUrl || null,
    // Adapters use `description` for chain-printed sticker text ("-25%",
    // "1+1", "ΧΑΜΗΛΗ ΤΙΜΗ", weight/pack size, etc). The UI surfaces this as
    // a fallback badge when discountPercent is null.
    description: item.description || null,
    storeId,
    productId,
    supermarket: chain,
    source,
    chainItemcode,
    isActive: true,
  };

  // Dedup: the chain's SKU is the strongest identity (works with or without a
  // product match); fall back to (productId, chain, source) for legacy rows
  // written before chainItemcode existed.
  let existing = chainItemcode
    ? await prisma.discount.findFirst({
        where: { supermarket: chain, source, chainItemcode },
      })
    : null;
  if (!existing && productId) {
    existing = await prisma.discount.findFirst({
      where: { productId, supermarket: chain, source },
    });
  }

  // Two chain SKUs mapped to one productId (usually a stale mis-mapping, e.g.
  // pack-size variants) used to take turns overwriting the same row — the
  // visible price flip-flopped between runs and every flip wrote a bogus
  // PriceSnapshot. First writer this run owns the row; later SKUs are skipped.
  if (
    existing && chainItemcode && existing.chainItemcode &&
    existing.chainItemcode !== chainItemcode && existing.updatedAt >= runStart
  ) {
    return { snapshotWritten: false, skipped: true, sharedRow: true };
  }
  // hotScore at write time uses clicks=0 for new rows or the existing lifetime
  // clickCount on update; the daily recompute cron is the authoritative pass.
  const hotScore = computeHotScore({
    productName: data.productName,
    description: data.description,
    discountPercent,
    createdAt: existing ? existing.createdAt : now,
    clicks: existing ? existing.clickCount : 0,
  });
  if (existing) {
    await prisma.discount.update({ where: { id: existing.id }, data: { ...data, hotScore } });
  } else {
    await prisma.discount.create({ data: { ...data, hotScore } });
  }

  // PriceSnapshot — only when THIS offer's stored price actually moved
  // (guards against shared-productId rows re-recording each other's price).
  // Snapshots hang off the Product, so productless offers get history only
  // once they're claimed.
  const priceMoved = !existing || existing.discountedPrice !== item.price;
  if (productId && priceMoved) {
    const last = await prisma.priceSnapshot.findFirst({
      where: { productId, supermarket: chain },
      orderBy: { recordedAt: 'desc' },
    });
    if (!last || last.price !== item.price) {
      await prisma.priceSnapshot.create({
        data: { productId, supermarket: chain, price: item.price, isDiscounted: !!originalPrice },
      });
      return { snapshotWritten: true };
    }
  }
  return { snapshotWritten: false };
}

// ── Main entry point ─────────────────────────────────────────────────────────
// showUnmatched: display-first — items with no Product match are still written
// as visible productless Discounts (the chain's own name/price/image/dates),
// alongside their PendingMatch row. Opt OUT for feeds whose item data isn't
// trustworthy enough to publish unreviewed (e.g. Lidl's vision-OCR output).
// extraWarnings: pre-ingest notes from the adapter (e.g. image-mirror failures)
// that should ride along into the IngestRun record / Υγεία tab. They never
// affect healthOk.
export async function ingestOffers({ chain, source, items, dryRun = false, showUnmatched = true, extraWarnings = [] }) {
  if (!chain || !SM_MAPPING[chain]) throw new Error(`Unknown chain slug: "${chain}"`);
  if (source !== 'web' && source !== 'leaflet') throw new Error(`source must be 'web' or 'leaflet', got "${source}"`);
  if (!Array.isArray(items)) throw new Error('items must be an array');

  const report = {
    chain, source, scrapedItems: items.length,
    matched: 0, viaMapping: 0, viaBarcode: 0, viaCache: 0,
    reviewQueued: 0, unmatchedShown: 0, priceChanges: 0, errors: 0, deactivated: 0,
    healthOk: true, warnings: [...extraWarnings],
  };

  const { default: prisma } = await import('../../lib/prisma.ts');
  const runStart = new Date();

  // Flight recorder — one IngestRun row per real run (dry runs skipped).
  // Non-fatal: a recording failure must never fail the ingest itself.
  async function recordRun() {
    if (dryRun) return;
    try {
      await prisma.ingestRun.create({
        data: {
          chain, source, startedAt: runStart,
          scrapedItems: report.scrapedItems, matched: report.matched,
          reviewQueued: report.reviewQueued, unmatchedShown: report.unmatchedShown,
          priceChanges: report.priceChanges,
          deactivated: report.deactivated, errors: report.errors,
          healthOk: report.healthOk, warnings: report.warnings,
        },
      });
    } catch (e) {
      console.log(`   ⚠️ could not record IngestRun: ${e.message}`);
    }
  }

  try {
    // SAFETY 1: an adapter returning nothing is a broken scrape, not "no offers".
    if (items.length === 0) {
      report.healthOk = false;
      report.warnings.push('Adapter returned 0 items — treated as a broken scrape. Nothing written, nothing deactivated.');
      await recordRun();
      return report;
    }
    const storeName = SM_MAPPING[chain];
    const store = await withDbRetry('ensureStore', () =>
      prisma.store.upsert({ where: { name: storeName }, create: { name: storeName }, update: {} })
    );

    // SAFETY 2: compare this run's size to what's currently live for this chain+source.
    const existingActive = await prisma.discount.count({
      where: { supermarket: chain, source, isActive: true },
    });
    const suspiciouslyLow = existingActive > 20 && items.length < existingActive * 0.5;
    if (suspiciouslyLow) {
      report.healthOk = false;
      report.warnings.push(
        `Run has ${items.length} items but ${existingActive} are currently active for ${chain}/${source}. ` +
        `Looks like a partial scrape — stale offers will NOT be deactivated this run.`
      );
    }

    if (dryRun) {
      report.warnings.push('DRY_RUN — no DB writes.');
      // still run matching so the report is meaningful
      for (const item of items) {
        try {
          const { via } = await matchItem(prisma, item, chain, true);
          if (via === 'none') report.reviewQueued++;
          else { report.matched++; report[`via${via[0].toUpperCase()}${via.slice(1)}`]++; }
        } catch { report.errors++; }
      }
      return report;
    }

    let idx = 0;
    let sharedRowSkips = 0;
    const unmappedLabels = new Set();
    for (const item of items) {
      idx++;
      try {
        const { productId, via } = await withDbRetry(`match ${item.name}`, () =>
          matchItem(prisma, item, chain, false)
        );
        if (!productId) {
          await prisma.pendingMatch.upsert({
            where: { rawName_supermarket: { rawName: item.name, supermarket: chain } },
            create: {
              rawName: item.name, rawPrice: item.price, supermarket: chain,
              brand: item.brand || null,
              imageUrl: item.imageUrl || null,
            },
            update: {
              rawPrice: item.price,
              brand: item.brand || null,
              imageUrl: item.imageUrl || null,
            },
          });
          report.reviewQueued++;
          // Display-first: the offer is real even before it's matched — write
          // it as a productless Discount so users see it. The resolver/admin
          // claims the row (sets productId) without touching what's shown.
          if (showUnmatched) {
            const { skipped } = await withDbRetry(`write unmatched ${item.name}`, () =>
              writeOffer(prisma, item, null, store.id, chain, source, runStart, unmappedLabels)
            );
            if (!skipped) report.unmatchedShown++;
          }
        } else {
          const { snapshotWritten, sharedRow } = await withDbRetry(`write ${item.name}`, () =>
            writeOffer(prisma, item, productId, store.id, chain, source, runStart, unmappedLabels)
          );
          if (snapshotWritten) report.priceChanges++;
          if (sharedRow) sharedRowSkips++;
          report.matched++;
          if (via === 'mapping') report.viaMapping++;
          else if (via === 'barcode') report.viaBarcode++;
          else if (via === 'cache') report.viaCache++;
        }
      } catch (e) {
        report.errors++;
        console.log(`   ❌ "${item.name}" — ${e.message}`);
      }
      if (idx % 100 === 0) {
        process.stdout.write(`\r   ${idx}/${items.length} — matched=${report.matched} review=${report.reviewQueued} err=${report.errors}   `);
      }
    }
    if (items.length >= 100) console.log('');

    if (sharedRowSkips > 0) {
      report.warnings.push(
        `${sharedRowSkips} item(s) share a productId with another chain SKU (winner-takes-row this run). ` +
        `Likely stale mis-mappings — audit ChainProductMapping for ${chain}.`
      );
    }

    // New chain taxonomy labels we haven't mapped yet — these rows fell back to
    // keyword guessing. Add them to native-category-maps.ts and re-run the
    // category backfill.
    if (unmappedLabels.size > 0) {
      const sample = [...unmappedLabels].slice(0, 8).map((l) => `"${l}"`).join(', ');
      report.warnings.push(
        `${unmappedLabels.size} native categor${unmappedLabels.size === 1 ? 'y' : 'ies'} have no map entry (keyword fallback used): ${sample}${unmappedLabels.size > 8 ? ', …' : ''}`
      );
    }

    // End-of-run deactivation — only when the health check is clean.
    if (report.healthOk) {
      const res = await withDbRetry('deactivate stale', () =>
        prisma.discount.updateMany({
          where: { supermarket: chain, source, isActive: true, updatedAt: { lt: runStart } },
          data: { isActive: false },
        })
      );
      report.deactivated = res.count;
    }

    await recordRun();
    return report;
  } finally {
    await prisma.$disconnect();
  }
}

// ── CLI helper: print a clean summary ────────────────────────────────────────
export function printReport(report) {
  console.log(`\n📊 Ingest report — ${report.chain} / ${report.source}`);
  console.log(`   scraped items:    ${report.scrapedItems}`);
  console.log(`   matched:          ${report.matched}  (mapping=${report.viaMapping} barcode=${report.viaBarcode} cache=${report.viaCache})`);
  console.log(`   → Review Queue:   ${report.reviewQueued}  (shown unmatched: ${report.unmatchedShown})`);
  console.log(`   price changes:    ${report.priceChanges}`);
  console.log(`   deactivated:      ${report.deactivated}`);
  console.log(`   errors:           ${report.errors}`);
  if (report.warnings.length) {
    console.log(`   ⚠️  warnings:`);
    report.warnings.forEach((w) => console.log(`      - ${w}`));
  }
  console.log(report.healthOk ? '   health: ✅ OK' : '   health: ⚠️  TRIPPED — check the adapter');
}
