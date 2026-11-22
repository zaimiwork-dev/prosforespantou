// Creates (if missing) the comparison_verdicts table — the AI verdicts on
// cross-chain comparison pairs (model ComparisonVerdict in prisma/schema.prisma,
// read through src/lib/comparison-verdict.ts). Safe to run again at any time.
//
//   node src/scripts/ensure-comparison-verdicts.mjs
//
// Why a script and not `prisma db push`: db push also "corrects" everything
// else it does not know about, starting with the hand-made trigram search
// index on discounts (see ensure-search-index.mjs). The DDL below is what
// Prisma itself generates for the model, so a later db push sees no change.
//
// Uses the pooled DATABASE_URL in one explicit transaction (the 5432 session
// pooler is unreachable from the dev PC; see CONTEXT.md).
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL statement_timeout = '30s'`);
  await client.query(`CREATE TABLE IF NOT EXISTS "comparison_verdicts" (
    "pair_key" TEXT NOT NULL,
    "chain_a" TEXT NOT NULL,
    "name_a" TEXT NOT NULL,
    "chain_b" TEXT NOT NULL,
    "name_b" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comparison_verdicts_pkey" PRIMARY KEY ("pair_key")
  )`);
  // 2026-11-22: rows keyed by chain item codes («slots»); index names are the
  // ones Prisma generates for @@index([chainA, codeA]) / ([chainB, codeB]).
  await client.query(`ALTER TABLE "comparison_verdicts" ADD COLUMN IF NOT EXISTS "code_a" TEXT`);
  await client.query(`ALTER TABLE "comparison_verdicts" ADD COLUMN IF NOT EXISTS "code_b" TEXT`);
  await client.query(`CREATE INDEX IF NOT EXISTS "comparison_verdicts_chain_a_code_a_idx" ON "comparison_verdicts"("chain_a", "code_a")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "comparison_verdicts_chain_b_code_b_idx" ON "comparison_verdicts"("chain_b", "code_b")`);
  await client.query('COMMIT');
  console.log('ok: comparison_verdicts in place (with item-code columns)');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed, nothing changed:', error.message);
  process.exitCode = 1;
} finally {
  const check = await client.query(
    `SELECT (SELECT count(*)::int FROM information_schema.tables WHERE table_name = 'comparison_verdicts') AS tbl,
            (SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'comparison_verdicts') AS cols,
            (SELECT count(*)::int FROM pg_indexes WHERE tablename = 'comparison_verdicts') AS idx`,
  );
  console.log('present:', JSON.stringify(check.rows[0]));
  await client.end();
}
