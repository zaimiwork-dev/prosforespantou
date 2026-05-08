import prisma from '../lib/prisma.ts';

async function checkCols() {
  try {
    const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'discounts'`;
    console.log('Columns in discounts table:');
    console.log(cols);
  } catch (e) {
    console.error('Failed to query columns:', e);
  }
  process.exit(0);
}

checkCols();