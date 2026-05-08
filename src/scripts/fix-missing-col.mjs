import prisma from '../lib/prisma.ts';

async function fixDb() {
  try {
    console.log('Adding column is_from_flyer to discounts table...');
    await prisma.$executeRawUnsafe('ALTER TABLE discounts ADD COLUMN IF NOT EXISTS is_from_flyer BOOLEAN DEFAULT false;');
    console.log('✅ Column added successfully.');
  } catch (e) {
    console.error('❌ Failed to add column:', e.message);
  }
  process.exit(0);
}

fixDb();