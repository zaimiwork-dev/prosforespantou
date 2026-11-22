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
  await client.query('COMMIT');
  console.log('ok: comparison_verdicts in place');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed, nothing changed:', error.message);
  process.exitCode = 1;
} finally {
  const check = await client.query(
    `SELECT (SELECT count(*)::int FROM information_schema.tables WHERE table_name = 'comparison_verdicts') AS tbl,
            (SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'comparison_verdicts') AS cols`,
  );
  console.log('present:', JSON.stringify(check.rows[0]));
  await client.end();
}
