// Creates (if missing) the three tables the owner approved on 2026-11-23
// (+ the nullable chain_product_mappings.item_name column):
//   item_barcodes    — barcodes seen for a store's item, from ANY source
//   app_devices      — a phone's notification address (no login)
//   product_watches  — «Ειδοποίησέ με» on any product (app and/or email)
// Models ItemBarcode / AppDevice / ProductWatch in prisma/schema.prisma.
// Safe to run again at any time.
//
//   node src/scripts/ensure-alert-tables.mjs
//
// Why a script and not `prisma db push`: db push also "corrects" everything
// it does not know about, starting with the hand-made trigram search index on
// discounts (see ensure-search-index.mjs). The DDL below is what
// `prisma migrate diff --from-empty --to-schema` generates for these models,
// so a later db push sees no change. Pooled DATABASE_URL, one transaction.
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TABLES = ['item_barcodes', 'app_devices', 'product_watches'];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL statement_timeout = '30s'`);
  await client.query(`CREATE TABLE IF NOT EXISTS "item_barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "source_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "chain_itemcode" TEXT,
    "matched_via" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_barcodes_pkey" PRIMARY KEY ("id")
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS "app_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "push_token" TEXT,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    CONSTRAINT "app_devices_pkey" PRIMARY KEY ("id")
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS "product_watches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID,
    "subscriber_id" UUID,
    "chain" TEXT NOT NULL,
    "chain_itemcode" TEXT NOT NULL,
    "product_id" UUID,
    "name" TEXT NOT NULL,
    "on_offer" BOOLEAN NOT NULL DEFAULT true,
    "on_drop" BOOLEAN NOT NULL DEFAULT true,
    "target_price" DECIMAL(10,2),
    "start_price" DECIMAL(10,2),
    "last_notified_at" TIMESTAMP(3),
    "last_notified_price" DECIMAL(10,2),
    "notified_offer_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_watches_pkey" PRIMARY KEY ("id")
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS "item_barcodes_barcode_idx" ON "item_barcodes"("barcode")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "item_barcodes_chain_chain_itemcode_idx" ON "item_barcodes"("chain", "chain_itemcode")`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "item_barcodes_source_chain_source_item_id_barcode_key" ON "item_barcodes"("source", "chain", "source_item_id", "barcode")`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "app_devices_push_token_key" ON "app_devices"("push_token")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "product_watches_chain_chain_itemcode_idx" ON "product_watches"("chain", "chain_itemcode")`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "product_watches_device_id_chain_chain_itemcode_key" ON "product_watches"("device_id", "chain", "chain_itemcode")`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "product_watches_subscriber_id_chain_chain_itemcode_key" ON "product_watches"("subscriber_id", "chain", "chain_itemcode")`);
  // The store's own item name on its item-code record (same day, additive):
  // barcode matching by exact name needs it (lib/barcode-links).
  await client.query(`ALTER TABLE "chain_product_mappings" ADD COLUMN IF NOT EXISTS "item_name" TEXT`);
  // Foreign keys (no IF NOT EXISTS for constraints in Postgres: check first).
  const fks = await client.query(`SELECT conname FROM pg_constraint WHERE conname IN ('product_watches_device_id_fkey', 'product_watches_subscriber_id_fkey')`);
  const have = new Set(fks.rows.map((r) => r.conname));
  if (!have.has('product_watches_device_id_fkey')) {
    await client.query(`ALTER TABLE "product_watches" ADD CONSTRAINT "product_watches_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
  }
  if (!have.has('product_watches_subscriber_id_fkey')) {
    await client.query(`ALTER TABLE "product_watches" ADD CONSTRAINT "product_watches_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
  }
  await client.query('COMMIT');
  console.log('ok: item_barcodes, app_devices, product_watches in place');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed, nothing changed:', error.message);
  process.exitCode = 1;
} finally {
  const check = await client.query(
    `SELECT table_name, count(*)::int AS cols FROM information_schema.columns
     WHERE table_name = ANY($1) GROUP BY 1 ORDER BY 1`, [TABLES],
  );
  const idx = await client.query(`SELECT tablename, count(*)::int AS n FROM pg_indexes WHERE tablename = ANY($1) GROUP BY 1 ORDER BY 1`, [TABLES]);
  console.log('columns:', JSON.stringify(check.rows), 'indexes:', JSON.stringify(idx.rows));
  await client.end();
}
