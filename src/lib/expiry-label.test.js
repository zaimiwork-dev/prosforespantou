import { describe, it, expect } from 'vitest';
import { expiryInfo, daysLeft } from './expiry-label';

// Fixed clock: 2026-07-06 12:00 local.
const NOW = new Date(2026, 6, 6, 12, 0, 0).getTime();
const d = (y, m, day) => new Date(y, m - 1, day, 10, 0, 0).toISOString();

describe('expiryInfo — fabricated dates (datesFromSource=false)', () => {
  const base = {
    validFrom: d(2026, 7, 1),
    validUntil: d(2026, 7, 20),
    updatedAt: d(2026, 7, 6),
    datesFromSource: false,
  };

  it('never shows the +14d default as a real expiry — and no card chip at all', () => {
    const e = expiryInfo(base, NOW);
    expect(e.real).toBe(false);
    expect(e.chip).toBeNull();
    expect(e.status).toBe('Σε ισχύ');
    expect(e.statusSub).toBe('ελέγχθηκε 06/07/2026');
    expect(e.startFull).toBeNull();
  });

  it('is never urgent and never upcoming', () => {
    const e = expiryInfo({ ...base, validUntil: d(2026, 7, 6), validFrom: d(2026, 8, 1) }, NOW);
    expect(e.urgent).toBe(false);
    expect(e.upcoming).toBe(false);
  });

  it('survives a missing updatedAt (no footnote text, plain status)', () => {
    const e = expiryInfo({ ...base, updatedAt: null }, NOW);
    expect(e.chip).toBeNull();
    expect(e.status).toBe('Σε ισχύ');
    expect(e.statusSub).toBeNull();
  });
});

describe('expiryInfo — real chain dates (datesFromSource=true)', () => {
  const base = {
    validFrom: d(2026, 7, 1),
    validUntil: d(2026, 7, 20),
    updatedAt: d(2026, 7, 6),
    datesFromSource: true,
  };

  it('shows the real end date on the chip and detail box', () => {
    const e = expiryInfo(base, NOW);
    expect(e.real).toBe(true);
    expect(e.chip).toBe('Έως 20/07');
    expect(e.status).toBe('Σε 14 ημέρες');
    expect(e.statusSub).toBe('έως 20/07/2026');
    expect(e.startFull).toBe('01/07/2026');
  });

  it('urgency vocabulary inside the 2-day window', () => {
    expect(expiryInfo({ ...base, validUntil: d(2026, 7, 6) }, NOW).chip).toBe('Λήγει σήμερα');
    expect(expiryInfo({ ...base, validUntil: d(2026, 7, 7) }, NOW).chip).toBe('Λήγει αύριο');
    const e = expiryInfo({ ...base, validUntil: d(2026, 7, 8) }, NOW);
    expect(e.chip).toBe('Λήγει σε 2 μέρες');
    expect(e.urgent).toBe(true);
  });

  it('upcoming offers announce their start date', () => {
    const e = expiryInfo({ ...base, validFrom: d(2026, 7, 10) }, NOW);
    expect(e.upcoming).toBe(true);
    expect(e.chip).toBe('Ξεκινά 10/07');
  });

  it('expired reads as expired in the detail box', () => {
    expect(expiryInfo({ ...base, validUntil: d(2026, 7, 5) }, NOW).status).toBe('Έχει λήξει');
  });
});

describe('daysLeft', () => {
  it('counts calendar days, ignoring time of day', () => {
    expect(daysLeft(d(2026, 7, 6), NOW)).toBe(0);
    expect(daysLeft(d(2026, 7, 8), NOW)).toBe(2);
    expect(daysLeft(d(2026, 7, 5), NOW)).toBe(-1);
    expect(daysLeft(null, NOW)).toBeNull();
  });
});
