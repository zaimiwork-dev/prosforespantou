// One-shot / re-runnable Lidl own-image backfill.
//   node src/scripts/backfill-lidl-images.mjs           # apply
//   DRY_RUN=1 node src/scripts/backfill-lidl-images.mjs # report only
// The same backfill runs automatically at the end of each Lidl scrape
// (runLidlAdapter → backfillLidlImages).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { backfillLidlImages } = await import('./lib/lidl-image-backfill.mjs');
const { default: prisma } = await import('../lib/prisma.ts');

await backfillLidlImages({ dryRun: process.env.DRY_RUN === '1', prisma });
await prisma.$disconnect();
process.exit(0);
