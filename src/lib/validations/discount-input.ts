import { z } from 'zod';

export const discountInputSchema = z
  .object({
    supermarket: z.string().min(1),
    product_name: z.string().trim().min(1, 'Product name is required'),
    category: z.string().min(1).default('Άλλο'),
    original_price: z.union([z.string(), z.number(), z.null()]).optional(),
    discounted_price: z.union([z.string(), z.number()]),
    discount_percent: z.union([z.string(), z.number(), z.null()]).optional(),
    description: z.string().optional().nullable(),
    valid_from: z.union([z.string(), z.null()]).optional(),
    valid_until: z.union([z.string(), z.null()]).optional(),
    image_url: z.string().optional().nullable(),
    is_active: z.boolean().optional().default(true),
    is_featured: z.boolean().optional().default(false),
    featured_until: z.union([z.string(), z.null()]).optional(),
    featured_label: z.string().optional().nullable(),
  })
  .transform((v) => ({
    supermarket: v.supermarket,
    productName: v.product_name,
    category: v.category,
    originalPrice: v.original_price ? Number(v.original_price) : null,
    discountedPrice: Number(v.discounted_price),
    discountPercent: v.discount_percent ? Number(v.discount_percent) : null,
    description: v.description || null,
    validFrom: v.valid_from ? new Date(v.valid_from) : new Date(),
    validUntil: v.valid_until ? new Date(v.valid_until) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    imageUrl: v.image_url || null,
    isActive: v.is_active ?? true,
    isFeatured: v.is_featured ?? false,
    featuredUntil: v.featured_until ? new Date(v.featured_until) : null,
    featuredLabel: v.featured_label || null,
  }))
  .refine((v) => Number.isFinite(v.discountedPrice) && v.discountedPrice >= 0, {
    message: 'Discounted price must be a non-negative number',
    path: ['discounted_price'],
  })
  .refine((v) => v.originalPrice === null || (Number.isFinite(v.originalPrice) && v.originalPrice >= 0), {
    message: 'Original price must be a non-negative number',
    path: ['original_price'],
  })
  .refine((v) => v.validUntil.getTime() >= v.validFrom.getTime(), {
    message: 'Valid until must be on or after valid from',
    path: ['valid_until'],
  });
