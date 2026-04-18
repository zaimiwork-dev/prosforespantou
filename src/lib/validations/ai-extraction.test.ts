import { describe, it, expect } from 'vitest';
import { aiExtractionArraySchema } from './ai-extraction';

describe('AI Extraction Schema Validation', () => {
  it('should accept a valid discount array', () => {
    const validData = [
      {
        productName: 'Gala 1L',
        discountedPrice: 1.45,
        originalPrice: 1.80,
        category: 'Γαλακτοκομικά',
      },
      {
        productName: 'Apples 1kg',
        discountedPrice: '2.10', // coerce should handle this
      }
    ];
    
    const result = aiExtractionArraySchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].productName).toBe('Gala 1L');
      expect(result.data[1].discountedPrice).toBe(2.10);
    }
  });

  it('should reject invalid payloads (missing productName)', () => {
    const invalidData = [
      {
        discountedPrice: 1.45,
      }
    ];
    
    const result = aiExtractionArraySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should handle coerced numbers correctly', () => {
    const data = [{ productName: 'Test', discountedPrice: '1,50'.replace(',', '.') }];
    const result = aiExtractionArraySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].discountedPrice).toBe(1.5);
    }
  });
});
