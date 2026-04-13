'use server';

import prisma from '@/lib/prisma';

/**
 * Performs an accent-insensitive and case-insensitive search for deals.
 * Uses PostgreSQL's unaccent extension via raw SQL.
 */
export async function searchDeals(query: string) {
  if (!query || query.trim() === "") {
    // If empty, we can revert to standard fetching or return empty
    return [];
  }

  try {
    const searchTerm = `%${query}%`;
    
    // We use $queryRaw because Prisma's built-in filters do not 
    // natively support the PostgreSQL 'unaccent' function.
    const deals = await prisma.$queryRaw`
      SELECT d.*, s.name as "storeName", s.color as "storeColor"
      FROM "Discount" d
      JOIN "Store" s ON d."storeId" = s.id
      WHERE unaccent(d."productName") ILIKE unaccent(${searchTerm})
      OR unaccent(d."description") ILIKE unaccent(${searchTerm})
      ORDER BY d."validUntil" ASC
      LIMIT 50
    `;

    return deals;
  } catch (error) {
    console.error('Search Action Error:', error);
    return [];
  }
}
