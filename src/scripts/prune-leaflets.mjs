// Nightly: delete dateless leaflets whose admin-set auto-delete window has
// passed (lib/leaflet-prune). Used to run as a write on every supermarket page
// view; the page now just hides expired ones when it reads.
//
// Usage:
//   node src/scripts/prune-leaflets.mjs
//
// dotenv first (ESM hoist trap).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { pruneExpiredDatelessLeaflets } from '../lib/leaflet-prune.ts';

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const count = await pruneExpiredDatelessLeaflets(prisma);
  console.log(`🧹 expired dateless leaflets deleted: ${count}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`❌ ${e.stack || e.message}`); process.exit(1); });
