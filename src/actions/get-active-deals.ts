'use server';

import prisma from '@/lib/prisma';

/**
 * Fetches active discounts from the database.
 * Returns deals where the associated leaflet is still valid.
 * Sorted by expiration date (soonest first).
 */
export async function getActiveDeals() {
  try {
    const now = new Date();

    const deals = await prisma.discount.findMany({
      where: {
        leaflet: {
          validUntil: {
            gt: now,
          },
        },
      },
      include: {
        store: true,
        leaflet: true,
      },
      orderBy: {
        validUntil: 'asc', // Soonest expiring first
      },
    });

    return deals;
  } catch (error) {
    console.error('Error fetching active deals:', error);
    throw new Error('Failed to fetch active deals');
  }
}
