import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
const { default: prisma } = await import('../lib/prisma.ts');

// Manually-curated current Masoutis leaflet — the visual flipbook on
// pubhtml5. Owner provides a fresh URL each cycle (every ~3 weeks); update
// this row when a new leaflet drops. The supermarket page reads `pdfUrl` and
// renders the "Δες το φυλλάδιο" link.
//
// To update for the next cycle: change URL + validFrom + validUntil + title,
// re-run this script. It upserts on (storeId, validFrom).

const URL = 'https://online.pubhtml5.com/efyf/omei/';
const TITLE = "Φυλλάδιο Λιανικής - Απρίλιος Β'";
const VALID_FROM = new Date('2026-04-16T00:00:00Z');
const VALID_UNTIL = new Date('2026-05-06T23:59:59Z');

const store = await prisma.store.findUnique({ where: { name: 'Μασούτης' } });
if (!store) {
  console.error('❌ Μασούτης store not found — cannot seed leaflet.');
  process.exit(1);
}

const existing = await prisma.leaflet.findFirst({
  where: { storeId: store.id, validFrom: VALID_FROM },
});

if (existing) {
  await prisma.leaflet.update({
    where: { id: existing.id },
    data: { title: TITLE, pdfUrl: URL, validUntil: VALID_UNTIL },
  });
  console.log(`✅ Updated existing leaflet row ${existing.id}`);
} else {
  const created = await prisma.leaflet.create({
    data: {
      storeId: store.id,
      title: TITLE,
      pdfUrl: URL,
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      pageImages: [],
    },
  });
  console.log(`✅ Created new leaflet row ${created.id}`);
  console.log(`   ${TITLE}`);
  console.log(`   ${URL}`);
  console.log(`   ${VALID_FROM.toISOString().slice(0,10)} → ${VALID_UNTIL.toISOString().slice(0,10)}`);
}

process.exit(0);
