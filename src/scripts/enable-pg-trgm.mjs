import prisma from '../lib/prisma.ts';

// Run once against the production DB (`node src/scripts/enable-pg-trgm.mjs`)
// to install pg_trgm + a GIN trigram index for fast accent-insensitive LIKE
// search on Discount.product_name and description.
//
// Why the f_unaccent wrapper: the unaccent() function from the extension is
// declared STABLE, not IMMUTABLE, so Postgres refuses to use it directly in an
// index expression. The wrapper is a safe IMMUTABLE proxy.
//
// search-deals.ts must call f_unaccent(...) (not unaccent(...)) to hit the index.

async function run() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log('✅ pg_trgm extension enabled.');

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.f_unaccent(text)
        RETURNS text AS $$
          SELECT public.unaccent('public.unaccent', $1)
        $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
    `);
    console.log('✅ f_unaccent wrapper created.');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_discounts_product_name_trgm
        ON discounts USING gin (f_unaccent(lower(product_name)) gin_trgm_ops);
    `);
    console.log('✅ idx_discounts_product_name_trgm created.');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_discounts_description_trgm
        ON discounts USING gin (f_unaccent(lower(coalesce(description, ''))) gin_trgm_ops);
    `);
    console.log('✅ idx_discounts_description_trgm created.');

    console.log('Done. Update search-deals.ts to call f_unaccent(...) instead of unaccent(...) so the index is used.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

run();
