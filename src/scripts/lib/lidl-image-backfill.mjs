// Lidl own-image backfill.
//
// Lidl offers come from leaflet OCR (adapters/lidl.mjs) with imageUrl:null — the
// leaflet gives us no per-tile image URL. The card therefore falls back to the
// linked canonical Product's image, which for ~40% of Lidl offers is a DIFFERENT
// chain's packaging (the GTIN-canonical product was first surfaced by AB/etc.),
// and when that cross-chain host fails to load the card shows a blank tile.
//
// Lidl's own e-shop catalog (scripts/lidl-catalog.mjs) DOES carry real Lidl
// product images. This backfill copies a Lidl-sourced image onto each Lidl
// Discount so the card shows correct Lidl packaging from a reliable host
// (offer.imageUrl is preferred over the product image in ProductCard/details).
//
//   1. Linked product is a Lidl product with an image → copy it (authoritative).
//   2. Otherwise fuzzy-match the OCR product name against the Lidl catalog and,
//      above a confidence threshold, use that Lidl product's image.
//   3. No confident source → leave null (unchanged fallback behaviour; never
//      stamp a cross-chain image onto the offer).
//
// Idempotent: only fills Discounts whose imageUrl is still null. Safe to re-run.
// Called at the end of runLidlAdapter (auto-applies each weekly scrape) and
// runnable standalone via scripts/backfill-lidl-images.mjs.

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Distinctive tokens only: drop 1–2 char noise and pure-number/unit fragments so
// "250 ml" / "spf" don't dominate the score. Brand tokens (cien, vitasia,
// parkside, esmara…) survive and carry the match.
function tokens(s) {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !UNIT_NOISE.has(t));
}

const UNIT_NOISE = new Set(['ml', 'gr', 'kg', 'lt', 'τεμ', 'pcs', 'spf', 'τμχ']);

// Weighted token overlap: shared tokens / smaller side. Brand-safety GATE: the
// offer's leading (head/brand) token MUST appear in the candidate, else score 0.
// Lidl flyers lead branded items with the brand (LURPAK, ΗΠΕΙΡΟΣ, ΔΩΔΩΝΗ) while
// the Lidl catalog only carries the own-brand generic ("Βούτυρο ανάλατο") — so
// without this gate we'd stamp Lidl's generic packaging onto a branded offer.
// Generic offers lead with the product noun, which the gate keeps. Range ~0..1.
function score(offerName, catName) {
  const a = tokens(offerName);
  const b = tokens(catName);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  if (!setB.has(a[0])) return 0; // head/brand token must align
  let shared = 0;
  for (const t of a) if (setB.has(t)) shared++;
  return shared / Math.min(a.length, b.length);
}

const MATCH_THRESHOLD = 0.6;

export async function backfillLidlImages({ dryRun = false, prisma } = {}) {
  if (!prisma) {
    ({ default: prisma } = await import('../../lib/prisma.ts'));
  }
  const now = new Date();

  const discounts = await prisma.discount.findMany({
    where: { supermarket: 'lidl', isActive: true, validUntil: { gte: now }, imageUrl: null },
    select: { id: true, productName: true, product: { select: { supermarket: true, imageUrl: true } } },
  });

  const catalog = await prisma.product.findMany({
    where: { supermarket: 'lidl', imageUrl: { not: null } },
    select: { name: true, imageUrl: true },
  });

  const out = { candidates: discounts.length, fromLinkedProduct: 0, fromFuzzy: 0, unmatched: 0, updated: 0 };
  const updates = []; // { id, imageUrl, via, name, match? }

  for (const d of discounts) {
    // 1. Linked Lidl product image — authoritative.
    if (d.product?.supermarket === 'lidl' && d.product.imageUrl) {
      updates.push({ id: d.id, imageUrl: d.product.imageUrl, via: 'linked', name: d.productName });
      out.fromLinkedProduct++;
      continue;
    }
    // 2. Fuzzy match against the Lidl catalog.
    let best = null;
    let bestScore = 0;
    for (const c of catalog) {
      const s = score(d.productName, c.name);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= MATCH_THRESHOLD) {
      updates.push({ id: d.id, imageUrl: best.imageUrl, via: 'fuzzy', name: d.productName, match: best.name, score: +bestScore.toFixed(2) });
      out.fromFuzzy++;
    } else {
      out.unmatched++;
    }
  }

  if (dryRun) {
    console.log(`   [dry] Lidl image backfill: ${out.fromLinkedProduct} linked + ${out.fromFuzzy} fuzzy / ${out.candidates} null-image offers (${out.unmatched} left null)`);
    for (const u of updates.filter((x) => x.via === 'fuzzy')) {
      console.log(`     fuzzy ${u.score}  "${u.name}"  →  "${u.match}"`);
    }
    return out;
  }

  for (const u of updates) {
    await prisma.discount.update({ where: { id: u.id }, data: { imageUrl: u.imageUrl } });
    out.updated++;
  }
  console.log(`   🖼️ Lidl image backfill: ${out.updated} offers imaged (${out.fromLinkedProduct} linked, ${out.fromFuzzy} fuzzy; ${out.unmatched} left null)`);
  return out;
}
