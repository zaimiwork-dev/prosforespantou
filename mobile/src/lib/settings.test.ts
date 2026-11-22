import { describe, expect, it } from 'vitest';
import { migrateChains } from './settings';

describe('migrateChains', () => {
  it('moves a shopper from Κρητικός to Μασούτης, keeping order and dropping duplicates', () => {
    expect(migrateChains(['lidl', 'kritikos'])).toEqual(['lidl', 'masoutis']);
    expect(migrateChains(['kritikos', 'masoutis', 'ab'])).toEqual(['masoutis', 'ab']);
    expect(migrateChains(['ab'])).toEqual(['ab']);
  });
});
