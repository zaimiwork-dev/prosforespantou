'use server';

import prisma from '@/lib/prisma';

/**
 * Fetches products from the master catalog with optional filtering.
 */
export async function getProducts({ 
  search = "", 
  supermarket = "all", 
  limit = 50, 
  offset = 0 
} = {}) {
  try {
    const where: any = {};
    
    if (supermarket !== "all") {
      where.supermarket = supermarket;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.count({ where })
    ]);

    return { products, total };
  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error('Failed to fetch products');
  }
}
