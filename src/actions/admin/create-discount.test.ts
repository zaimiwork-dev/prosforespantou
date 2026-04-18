import { describe, it, expect } from 'vitest';
import { discountInputSchema } from '@/lib/validations/discount-input';

describe('Discount Input Validation Schema', () => {
  it('should accept valid discount input', () => {
    const valid = {
      supermarket: 'ab',
      product_name: 'Feta Cheese 400g',
      category: 'Γαλακτοκομικά',
      discounted_price: 5.50,
      original_price: '7.20',
      valid_until: '2026-12-31',
    };
    
    const result = discountInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountedPrice).toBe(5.50);
      expect(result.data.originalPrice).toBe(7.20);
    }
  });

  it('should reject invalid dates (until before from)', () => {
    const invalid = {
      supermarket: 'ab',
      product_name: 'Test',
      discounted_price: 1,
      valid_from: '2026-02-01',
      valid_until: '2026-01-01',
    };
    
    const result = discountInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should require product name', () => {
    const invalid = {
      supermarket: 'ab',
      product_name: '',
      discounted_price: 1,
    };
    
    const result = discountInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
