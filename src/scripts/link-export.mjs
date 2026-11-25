// Linker data export (nightly since 2026-11-23; was a one-off in .local-scratch).
// READ-ONLY: writes the JSON-lines files link-products-offline.mjs reads.
//
//   LINK_DATA_DIR=/tmp/link-data node src/scripts/link-export.mjs
//
// Chain-side names come from two places: what a store called the item in its
// offers (discounts.product_name), and — since 2026-11-23 — each store's OWN
// catalogue name for each item code (chain_product_mappings.item_name). The
// latter matters for items never on offer and for products created by another
// store's wording. Retired stores are left out.
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import { RETIRED_SUPERMARKET_IDS } from '../lib/constants.js';

const OUT = process.env.LINK_DATA_DIR;
if (!OUT) { console.error('LINK_DATA_DIR is required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const { default: prisma } = await import('../lib/prisma.ts');
const retired = [...RETIRED_SUPERMARKET_IDS];
const q = (sql) => prisma.$queryRawUnsafe(sql, retired);
const jsonl = (file, rows) => {
  fs.writeFileSync(path.join(OUT, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`   ${file}: ${rows.length}`);
};

try {
  console.log(`🔗 linker export → ${OUT}`);
  jsonl('products.jsonl', await q(`
    select p.id, p.name, p.brand, p.unit_info as unit, p.barcode,
           array_agg(distinct m.supermarket) as chains
    from products p join chain_product_mappings m on m.product_id = p.id
    where m.supermarket <> all($1::text[]) group by p.id`));
  jsonl('mappings.jsonl', await q(`
    select product_id as "productId", supermarket as chain, chain_itemcode as itemcode, matched_via as via
    from chain_product_mappings where supermarket <> all($1::text[])`));
  jsonl('chain_names.jsonl', await q(`
    select * from (
      select distinct on (product_id, supermarket, product_name)
             product_id as "productId", supermarket as chain, product_name as name,
             discounted_price as price, original_price as was, category,
             (is_active and valid_until > now()) as active, false as own
      from discounts
      where product_id is not null and supermarket is not null and supermarket <> all($1::text[])
      order by product_id, supermarket, product_name, updated_at desc) d
    union all
    select m.product_id, m.supermarket, m.item_name, null, null, null, false, true
    from chain_product_mappings m where m.item_name is not null and m.supermarket <> all($1::text[])`));
  jsonl('shelf_prices.jsonl', await q(`
    select distinct on (product_id, supermarket) product_id as "productId", supermarket as chain,
           price, coalesce(last_seen_at, recorded_at) as "recordedAt"
    from price_snapshots where kind = 'normal' and supermarket <> all($1::text[])
    order by product_id, supermarket, recorded_at desc`));
} finally {
  await prisma.$disconnect();
}
