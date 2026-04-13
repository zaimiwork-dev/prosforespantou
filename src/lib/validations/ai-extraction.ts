import { z } from "zod";

/**
 * Zod schema for a single extracted discount deal.
 * Aligns with the Prisma schema and ensures type safety for AI output.
 */
export const aiExtractionSchema = z.object({
  productName: z.string().min(1, "Product name is required"),
  discountedPrice: z.number().describe("The final price after discount"),
  originalPrice: z.number().optional().nullable().describe("The original price before discount"),
  category: z.string().describe("The product category (e.g., Γαλακτοκομικά)"),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional().nullable().describe("Normalized coordinates (0-1000) for the product image"),
  supermarket: z.string().optional().describe("The supermarket ID (e.g., ab, lidl)"),
  description: z.string().optional().nullable(),
  discountPercent: z.number().optional().nullable(),
});

/**
 * Schema for an array of discounts returned by the AI.
 */
export const aiExtractionArraySchema = z.array(aiExtractionSchema);

export type AiExtractedDiscount = z.infer<typeof aiExtractionSchema>;
