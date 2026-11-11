import { describe, expect, it } from 'vitest';
import { dedupeCards } from '@/lib/lists';

// Proves both path aliases resolve under vitest: '@/…' (the app) and, through
// lists.ts, '@shared/…' (the website's src/lib).
describe('dedupeCards', () => {
  it('returns an empty list unchanged', () => {
    expect(dedupeCards([])).toEqual([]);
  });
});
