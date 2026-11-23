import { describe, expect, it } from 'vitest';
import { alertText, decideWatchAlert, lowest, COOLDOWN_HOURS, type WatchState } from './watch-alerts';

const base: WatchState = {
  onOffer: true, onDrop: true, targetPrice: null, startPrice: null,
  lastNotifiedAt: null, lastNotifiedPrice: null, notifiedOfferIds: [],
};
const now = new Date('2026-11-24T08:00:00Z');
const fmt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const at = (c: string) => ({ sklavenitis: 'στον Σκλαβενίτη', ab: 'στον AB' } as Record<string, string>)[c] ?? `στο ${c}`;

describe('decideWatchAlert', () => {
  it('first look only remembers the starting price', () => {
    const r = decideWatchAlert({ ...base, onOffer: false }, [{ chain: 'ab', price: 2.5, kind: 'shelf' }], now);
    expect(r.alert).toBeNull();
    expect(r.next.startPrice).toBe(2.5);
  });

  it('alerts once when it goes on offer anywhere, never twice for the same offer', () => {
    const pts = [
      { chain: 'ab', price: 2.5, kind: 'shelf' as const },
      { chain: 'sklavenitis', price: 1.99, kind: 'offer' as const, offerId: 'o1' },
    ];
    const r = decideWatchAlert({ ...base, startPrice: 2.5 }, pts, now);
    expect(r.alert).toMatchObject({ reason: 'offer', chain: 'sklavenitis', price: 1.99, offerId: 'o1' });
    expect(r.next.notifiedOfferIds).toEqual(['o1']);
    const later = new Date(now.getTime() + (COOLDOWN_HOURS + 1) * 3600_000);
    const again = decideWatchAlert({ ...base, startPrice: 2.5, ...r.next } as WatchState, pts, later);
    expect(again.alert).toBeNull();
  });

  it('alerts on a drop below the starting price, and again only for a new low', () => {
    const w = { ...base, onOffer: false, startPrice: 2.5 };
    expect(decideWatchAlert(w, [{ chain: 'ab', price: 2.47, kind: 'shelf' }], now).alert).toBeNull(); // 3 cents: noise
    const r = decideWatchAlert(w, [{ chain: 'ab', price: 2.2, kind: 'shelf' }], now);
    expect(r.alert).toMatchObject({ reason: 'drop', price: 2.2, before: 2.5 });
    const later = new Date(now.getTime() + 2 * 86400_000);
    const w2 = { ...w, ...r.next } as WatchState;
    expect(decideWatchAlert(w2, [{ chain: 'ab', price: 2.2, kind: 'shelf' }], later).alert).toBeNull();
    expect(decideWatchAlert(w2, [{ chain: 'ab', price: 2.0, kind: 'shelf' }], later).alert).toMatchObject({ reason: 'drop', before: 2.2 });
  });

  it('target price wins over the other reasons and fires at or below it', () => {
    const w = { ...base, startPrice: 3, targetPrice: 2 };
    expect(decideWatchAlert({ ...w, onOffer: false }, [{ chain: 'ab', price: 2.1, kind: 'shelf' }], now).alert?.reason).toBe('drop');
    const r = decideWatchAlert(w, [{ chain: 'ab', price: 2, kind: 'offer', offerId: 'x' }], now);
    expect(r.alert).toMatchObject({ reason: 'target', price: 2, before: 2 });
  });

  it('keeps quiet inside the cooldown', () => {
    const w = { ...base, startPrice: 3, lastNotifiedAt: new Date(now.getTime() - 3600_000), lastNotifiedPrice: 2.9 };
    expect(decideWatchAlert(w, [{ chain: 'ab', price: 1, kind: 'offer', offerId: 'z' }], now).alert).toBeNull();
  });

  it('says nothing when no store has a price', () => {
    expect(decideWatchAlert({ ...base, startPrice: 2 }, [], now)).toEqual({ alert: null, next: {} });
  });
});

describe('lowest', () => {
  it('prefers an offer on a tie and skips bad prices', () => {
    expect(lowest([{ chain: 'ab', price: 2, kind: 'shelf' }, { chain: 'lidl', price: 2, kind: 'offer', offerId: 'o' }])?.chain).toBe('lidl');
    expect(lowest([{ chain: 'ab', price: 0, kind: 'shelf' }])).toBeNull();
  });
});

describe('alertText', () => {
  it('writes plain Greek with the store', () => {
    expect(alertText('Lacta 85g', { reason: 'offer', chain: 'sklavenitis', price: 1.29, offerId: 'o', before: null }, fmt, at))
      .toEqual({ title: 'Σε προσφορά: Lacta 85g', body: '1,29 € στον Σκλαβενίτη.' });
    expect(alertText('Lacta 85g', { reason: 'drop', chain: 'ab', price: 1.5, offerId: null, before: 1.7 }, fmt, at).body)
      .toBe('1,50 € στον AB (ήταν 1,70 €).');
    expect(alertText('Lacta 85g', { reason: 'target', chain: 'ab', price: 1.2, offerId: null, before: 1.25 }, fmt, at).title)
      .toBe('Έπεσε στην τιμή σου: Lacta 85g');
  });
});
