// Writers for what every catalog run learns about a store's items beyond the
// price (2026-11-23, owner: «anywhere we get the items from we need the
// barcode»):
//   recordItemBarcodes — every (source, store, item, barcode) seen → item_barcodes
//   recordItemNames    — the store's own name for each item code → chain_product_mappings.item_name
//                        (with the store's own brand field in front when the name lacks it)
// Both batched (unnest), idempotent, and only touch rows that change.
// lib/barcode-links + src/scripts/barcode-links.mjs turn them into matches.
import { normalizeBarcode } from './ingest-offers.mjs';
import { statesBrand } from '../../lib/name-exact.ts';

// AB gives the brand in its own field and leaves it out of the name
// («Στιγμιαίος Καφές 200gr» for Nescafe Classic, brand «NESCAFE»). A brandless
// name cannot be linked to the other stores (or worse, looks like an
// own-label product), so the brand the store itself sent goes in front when
// the name does not already state it (2026-11-25).
export function nameWithBrand(name, brand) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  const b = String(brand ?? '').replace(/\s+/g, ' ').trim();
  if (!n || !b || b === '-' || statesBrand(n, b)) return n;
  return `${b} ${n}`;
}

const BATCH = 1000;

/**
 * rows: [{ source, chain, sourceItemId, name, barcode, chainItemcode?, matchedVia? }]
 * A row the store itself gave (chainItemcode known) keeps that code; a later
 * sighting never erases an attached code (COALESCE).
 */
export async function recordItemBarcodes(prisma, rows) {
  const clean = [];
  const seen = new Set();
  for (const r of rows) {
    const barcode = normalizeBarcode(r.barcode);
    if (!barcode || !r.source || !r.chain || !r.sourceItemId || !r.name) continue;
    const k = `${r.source}|${r.chain}|${r.sourceItemId}|${barcode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push([r.source, r.chain, String(r.sourceItemId), String(r.name).trim(), barcode, r.chainItemcode ? String(r.chainItemcode) : null, r.matchedVia ?? null]);
  }
  let written = 0;
  for (let i = 0; i < clean.length; i += BATCH) {
    const chunk = clean.slice(i, i + BATCH);
    const col = (j) => chunk.map((r) => r[j]);
    written += await prisma.$executeRawUnsafe(
      `INSERT INTO item_barcodes (source, chain, source_item_id, name, barcode, chain_itemcode, matched_via)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (source, chain, source_item_id, barcode) DO UPDATE SET
         name = EXCLUDED.name,
         last_seen_at = CURRENT_TIMESTAMP,
         chain_itemcode = COALESCE(item_barcodes.chain_itemcode, EXCLUDED.chain_itemcode),
         matched_via = COALESCE(item_barcodes.matched_via, EXCLUDED.matched_via)`,
      col(0), col(1), col(2), col(3), col(4), col(5), col(6),
    );
  }
  return { rows: clean.length, written };
}

/** items: [{ chainItemcode, name }] of ONE store; updates only names that differ. */
export async function recordItemNames(prisma, chain, items) {
  const byCode = new Map();
  for (const it of items) {
    if (!it?.chainItemcode || !it?.name) continue;
    byCode.set(String(it.chainItemcode), nameWithBrand(it.name, it.brand));
  }
  const pairs = [...byCode];
  let updated = 0;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const chunk = pairs.slice(i, i + BATCH);
    updated += await prisma.$executeRawUnsafe(
      `UPDATE chain_product_mappings m SET item_name = v.name
       FROM unnest($1::text[], $2::text[]) AS v(code, name)
       WHERE m.supermarket = $3 AND m.chain_itemcode = v.code AND m.item_name IS DISTINCT FROM v.name`,
      chunk.map((p) => p[0]), chunk.map((p) => p[1]), chain,
    );
  }
  return { items: pairs.length, updated };
}
