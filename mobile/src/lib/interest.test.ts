import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HALF_LIFE_MS, WEIGHTS, bump, clearInterests, decayed, noteInterest, rank, topInterests } from './interest';
import { updateSettings } from './settings';

const disk = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void disk.set(k, v),
    removeItem: async (k: string) => void disk.delete(k),
  },
}));


describe('interest maths', () => {
  it('halves after the half-life and never grows', () => {
    expect(decayed({ score: 8, at: 0 }, HALF_LIFE_MS)).toBeCloseTo(4);
    expect(decayed({ score: 8, at: 0 }, 2 * HALF_LIFE_MS)).toBeCloseTo(2);
    expect(decayed({ score: 8, at: 100 }, 0)).toBe(8); // clock went backwards
  });
  it('bump adds weight on top of the decayed old score', () => {
    const a = bump({}, 'Γάλα', WEIGHTS.list_add, 0);
    const b = bump(a, 'Γάλα', WEIGHTS.view, HALF_LIFE_MS);
    expect(b['Γάλα'].score).toBeCloseTo(1.5 + 1);
    expect(a['Γάλα'].score).toBe(3); // input not mutated
  });
  it('ranks by decayed score, recent beats old', () => {
    let m = bump({}, 'old', 3, 0);
    m = bump(m, 'new', 1, 4 * HALF_LIFE_MS);
    expect(rank(m, 5, 4 * HALF_LIFE_MS)).toEqual(['new', 'old'].slice(0, 2).sort((x) => (x === 'new' ? -1 : 1)));
    expect(rank(m, 1, 4 * HALF_LIFE_MS)).toEqual(['new']);
  });
  it('drops negligible scores and ties break alphabetically', () => {
    const m = bump(bump({}, 'b', 1, 0), 'a', 1, 0);
    expect(rank(m, 5, 0)).toEqual(['a', 'b']);
    expect(rank(m, 5, 20 * HALF_LIFE_MS)).toEqual([]);
  });
  it('caps the number of tracked keys', () => {
    let m: ReturnType<typeof bump> = {};
    for (let i = 0; i < 80; i++) m = bump(m, `k${i}`, 1, i);
    expect(Object.keys(m).length).toBe(60);
    expect(m.k79).toBeDefined();
  });
});

describe('consent gate', () => {
  beforeEach(async () => {
    updateSettings({ consent: 'accepted' });
    await clearInterests();
  });
  it('records nothing unless consent is accepted', async () => {
    updateSettings({ consent: null });
    noteInterest('view', { category: 'Γάλα', chain: 'ab' });
    updateSettings({ consent: 'rejected' });
    noteInterest('view', { category: 'Γάλα', chain: 'ab' });
    await clearInterests();
    expect(topInterests(3)).toEqual({ categories: [], chains: [] });
  });
  it('records when accepted and erases when consent becomes rejected', async () => {
    noteInterest('favourite', { category: 'Γάλα', chain: 'ab' });
    noteInterest('filter', { chain: 'lidl' });
    await new Promise((r) => setTimeout(r, 10));
    expect(topInterests(3)).toEqual({ categories: ['Γάλα'], chains: ['ab', 'lidl'] });
    updateSettings({ consent: 'rejected' });
    await new Promise((r) => setTimeout(r, 10));
    expect(topInterests(3)).toEqual({ categories: [], chains: [] });
    expect(JSON.parse(disk.get('prosfores-pantou:interest:v1') ?? '{}')).toEqual({ categories: {}, chains: {} });
  });
});
