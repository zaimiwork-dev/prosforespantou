import prisma from '../lib/prisma.ts';

async function enableExtension() {
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent;`;
    console.log('✅ unaccent extension enabled successfully.');
  } catch (error) {
    console.error('❌ Failed to enable unaccent:', error);
  }
  process.exit(0);
}

enableExtension();