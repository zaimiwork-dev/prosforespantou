// Creates (if missing) the trigram index that /api/v1/search and the site's
// search use. Safe to run again at any time; run it after any `prisma db push`,
// because Prisma cannot describe an expression index and may drop it.
//
//   node src/scripts/ensure-search-index.mjs
//
// What it creates:
//   - extension pg_trgm in schema `extensions` (Supabase convention)
//   - public.f_unaccent(text): an IMMUTABLE wrapper around unaccent(). The
//     extension's own function is only STABLE, and Postgres refuses STABLE
//     functions in an index. The search query calls f_unaccent() so the
//     planner can match the index; the query still works (slowly) without it.
//   - discounts_search_trgm: GIN trigram index on exactly the expression
//     src/actions/search-deals.ts filters on.
//
// Measured 2026-11-22 in a rolled-back transaction on production data: the
// candidate query went from ~100 ms to 2-15 ms for nine common searches with
// identical results; the index is ~8.5 MB and builds in ~4 s (writes to
// `discounts` wait during the build, reads do not).
//
// Uses the pooled DATABASE_URL in one explicit transaction (the 5432 session
// pooler is unreachable from the dev PC; see CONTEXT.md).
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Must stay identical to SEARCH_TEXT_SQL in src/actions/search-deals.ts.
const EXPR = `translate(public.f_unaccent(lower(product_name || ' ¦ ' || COALESCE(description, '') || ' ¦ ' || COALESCE(category, ''))), 'ς', 'σ')`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL statement_timeout = '120s'`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions`);
  await client.query(`CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$`);
  const t0 = Date.now();
  await client.query(`CREATE INDEX IF NOT EXISTS discounts_search_trgm ON discounts USING gin ((${EXPR}) extensions.gin_trgm_ops)`);
  await client.query('COMMIT');
  console.log(`ok: pg_trgm, f_unaccent and discounts_search_trgm in place (${Date.now() - t0} ms)`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed, nothing changed:', error.message);
  process.exitCode = 1;
} finally {
  const check = await client.query(
    `SELECT (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'discounts_search_trgm') AS idx,
            (SELECT count(*)::int FROM pg_proc WHERE proname = 'f_unaccent') AS fn,
            (SELECT count(*)::int FROM pg_extension WHERE extname = 'pg_trgm') AS ext`,
  );
  console.log('present:', JSON.stringify(check.rows[0]));
  await client.end();
}
