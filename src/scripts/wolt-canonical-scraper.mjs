// Wolt canonical-catalog scraper.
// Walks a Wolt venue's assortment + per-category endpoints and upserts Product rows by `barcode`.
//
// Usage:
//   node src/scripts/wolt-canonical-scraper.mjs <venue-slug> [chain-slug]
//
// Examples:
//   node src/scripts/wolt-canonical-scraper.mjs masoutis-makedonias masoutis
//   node src/scripts/wolt-canonical-scraper.mjs ab-vasilopoulos-pylaia ab
//
// Env:
//   DRY_RUN=1   → don't write to DB; just count + sample
//   LIMIT=N     → stop after N items (smoke test)
//   PACE_MS=200 → throttle between category fetches (default 200)

import 'dotenv/config';
import { envInt, fetchWithBackoff, pace } from './lib/polite-http.mjs';

const VENUE_SLUG = process.argv[2];
if (!VENUE_SLUG) {
  console.error('Usage: node src/scripts/wolt-canonical-scraper.mjs <venue-slug> [chain-slug]');
  process.exit(1);
}
const CHAIN_SLUG = process.argv[3] || VENUE_SLUG.split('-')[0];

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const PACE_MS = envInt('PACE_MS', 750);
const JITTER_MS = envInt('JITTER_MS', 350);

const SM_MAPPING = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
};

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://wolt.com',
  Referer: 'https://wolt.com/',
};

const BASE = 'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1';

// GTIN-13 check digit (mod-10 weighted sum, positions alternate ×1 ×3 from left).
function gtin13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(twelve[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

// Normalize Wolt's barcode_gtin to a canonical form.
// 13-digit → keep as-is (already GTIN-13).
// 14-digit with logistic indicator 0 or 1 → strip indicator + recalc check digit → GTIN-13.
// 14-digit with indicator 2-9 → packaging hierarchy (case-of-N), NOT equivalent to consumer unit. Leave as-is.
// 8-digit or shorter → chain-specific code (produce, weight items). Leave as-is.
function normalizeBarcode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return s;
  if (s.length === 14 && /^[01]/.test(s)) {
    const twelve = s.slice(1, 13);
    return twelve + gtin13CheckDigit(twelve);
  }
  return s;
}

async function getJson(url) {
  const res = await fetchWithBackoff(url, { headers: HEADERS }, { label: `Wolt ${url}` });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${url} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

function flattenCategories(categories) {
  const out = [];
  function walk(node) {
    if (node.slug) out.push({ slug: node.slug, name: node.name });
    (node.subcategories || []).forEach(walk);
  }
  (categories || []).forEach(walk);
  return out;
}

async function fetchVenueItems(venueSlug) {
  console.log(`🌐 venue=${venueSlug} — fetching assortment`);
  const assortment = await getJson(`${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment`);
  const cats = flattenCategories(assortment.categories);
  console.log(`   ${cats.length} categories+subcategories`);

  const itemsById = new Map();
  let catIdx = 0;
  for (const c of cats) {
    catIdx++;
    try {
      const url = `${BASE}/venues/slug/${encodeURIComponent(venueSlug)}/assortment/categories/slug/${encodeURIComponent(c.slug)}`;
      const data = await getJson(url);
      for (const it of data.items || []) {
        if (!itemsById.has(it.id)) itemsById.set(it.id, { ...it, _category: c.name });
      }
      process.stdout.write(`\r   category ${catIdx}/${cats.length} — unique items so far: ${itemsById.size}        `);
    } catch (e) {
      console.log(`\n   ⚠️  failed category "${c.slug}": ${e.message}`);
    }
    if (itemsById.size >= LIMIT) break;
    await pace(PACE_MS, JITTER_MS);
  }
  console.log('');
  return [...itemsById.values()];
}

function pickImageUrl(item) {
  const img = (item.images || [])[0];
  return img?.url || null;
}

async function ensureStore(prisma, chainSlug) {
  const name = SM_MAPPING[chainSlug] || chainSlug;
  let store = await prisma.store.findUnique({ where: { name } });
  if (!store) {
    console.log(`   creating Store "${name}"`);
    store = await prisma.store.create({ data: { name } });
  }
  return store;
}

async function upsertProduct(prisma, item, storeId, chainSlug) {
  const barcode = normalizeBarcode(item.barcode_gtin);
  if (!barcode) return { status: 'skipped-no-barcode', productId: null };
  // Fields refreshed on EVERY upsert (latest Wolt data wins).
  const updatableData = {
    name: item.name,
    description: item.description || null,
    imageUrl: pickImageUrl(item),
    unitInfo: item.unit_info || null,
    // brand left null — Wolt assortment doesn't expose it directly; chain scrapers will set it
  };
  // Find by barcode first (canonical key)
  const existing = await prisma.product.findUnique({ where: { barcode } });
  if (existing) {
    // Preserve `supermarket` and `storeId` from first creation — don't re-tag shared products
    await prisma.product.update({ where: { id: existing.id }, data: updatableData });
    return { status: 'updated', productId: existing.id };
  }
  const created = await prisma.product.create({
    data: { ...updatableData, barcode, storeId, supermarket: chainSlug },
  });
  return { status: 'created', productId: created.id };
}

// Write a Discount row only when item is ACTUALLY on offer (original_price > price).
// Wolt stores prices in cents. Idempotent: one active Wolt Discount per (product, chain).
async function upsertDiscount(prisma, item, productId, storeId, chainSlug, categoryName) {
  const finalPrice = item.price / 100;
  const originalPrice = (item.original_price && item.original_price > item.price)
    ? item.original_price / 100 : null;
  if (!originalPrice) return 'no-discount';

  const now = new Date();
  const validUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const existing = await prisma.discount.findFirst({
    where: { productId, supermarket: chainSlug, source: 'wolt', isActive: true },
  });

  if (existing) {
    await prisma.discount.update({
      where: { id: existing.id },
      data: {
        productName: item.name,
        discountedPrice: finalPrice,
        originalPrice,
        validUntil,
      },
    });
    return 'discount-updated';
  }

  await prisma.discount.create({
    data: {
      productName: item.name,
      category: categoryName || 'Άλλο',
      discountedPrice: finalPrice,
      originalPrice,
      validFrom: now,
      validUntil,
      storeId,
      productId,
      supermarket: chainSlug,
      source: 'wolt',
      isActive: true,
    },
  });
  return 'discount-created';
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');

  const items = await fetchVenueItems(VENUE_SLUG);
  const withGtin = items.filter((it) => it.barcode_gtin);
  const withoutGtin = items.length - withGtin.length;
  console.log(`\n📦 ${items.length} unique items total, ${withGtin.length} have barcode_gtin (${withoutGtin} skipped)`);

  if (DRY_RUN) {
    console.log('\n🔎 DRY_RUN — sample of first 5 items that would be written:');
    withGtin.slice(0, 5).forEach((it) => {
      console.log(`   ${it.barcode_gtin}  ${it.name}  (${it.unit_info || ''})  ${pickImageUrl(it) ? '[has image]' : ''}`);
    });
    console.log('\n(no DB writes — set DRY_RUN=0 or remove env var to commit)');
    await prisma.$disconnect();
    return;
  }

  const store = await ensureStore(prisma, CHAIN_SLUG);
  console.log(`   storeId=${store.id} chain="${CHAIN_SLUG}"`);

  let created = 0, updated = 0, skipped = 0, errors = 0;
  let discountsCreated = 0, discountsUpdated = 0, noDiscount = 0;
  let idx = 0;
  for (const it of withGtin) {
    idx++;
    try {
      const r = await upsertProduct(prisma, it, store.id, CHAIN_SLUG);
      if (r.status === 'created') created++;
      else if (r.status === 'updated') updated++;
      else { skipped++; continue; }
      // Write a Discount row only if the item is on offer (original_price > price).
      const dr = await upsertDiscount(prisma, it, r.productId, store.id, CHAIN_SLUG, it._category);
      if (dr === 'discount-created') discountsCreated++;
      else if (dr === 'discount-updated') discountsUpdated++;
      else noDiscount++;
    } catch (e) {
      errors++;
      console.log(`\n   ❌ item ${it.id} (${it.name}) — ${e.message}`);
    }
    if (idx % 100 === 0) process.stdout.write(`\r   ${idx}/${withGtin.length} products: c=${created} u=${updated} | discounts: c=${discountsCreated} u=${discountsUpdated} (no-discount=${noDiscount}) | err=${errors}        `);
  }
  console.log('');

  console.log(`\n✅ DONE for venue "${VENUE_SLUG}"`);
  console.log(`   total fetched:        ${items.length}`);
  console.log(`   with barcode_gtin:    ${withGtin.length}`);
  console.log(`   skipped (no GTIN):    ${withoutGtin}`);
  console.log(`   Product rows created: ${String(created).padStart(5)}`);
  console.log(`   Product rows updated: ${String(updated).padStart(5)}`);
  console.log(`   Discounts created:    ${String(discountsCreated).padStart(5)}`);
  console.log(`   Discounts updated:    ${String(discountsUpdated).padStart(5)}`);
  console.log(`   items without offer:  ${String(noDiscount).padStart(5)}`);
  console.log(`   errors:               ${errors}`);

  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
