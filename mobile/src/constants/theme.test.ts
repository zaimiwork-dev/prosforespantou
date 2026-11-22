// Every pairing of text and background the screens use must stay readable in
// BOTH palettes: WCAG asks 4.5:1 for text under 18 sp, 3:1 for large text.
// A colour change that breaks one of these fails here instead of on a phone.
import { describe, expect, it } from 'vitest';
import { DarkColors, LightColors, contrastRatio, readableOn, type Palette } from './theme';

const contrast = contrastRatio;

const WHITE = '#FFFFFF';
type Key = keyof Palette;
// [text, background] pairs as the screens use them.
const TEXT: [Key | 'white', Key][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'bgSoft'], ['ink', 'surface2'],
  ['ink2', 'bg'], ['ink2', 'surface'],
  ['ink3Text', 'bg'], ['ink3Text', 'surface'], ['ink3Text', 'bgSoft'],
  ['brandText', 'bg'], ['brandText', 'surface'], ['brandText', 'bgSoft'],
  ['white', 'brand'], // buttons
  ['brandInk', 'promo'], ['gold', 'promo'], // promo banner
  ['accentText', 'bg'], ['accentText', 'surface'], ['accentText', 'discountBg'],
  ['white', 'accent'], // discount badge
  ['good', 'surface'], ['good', 'goodBg'],
  ['white', 'toastBg'], ['gold', 'toastBg'],
];
const LARGE_TEXT: [Key, Key][] = [['ink3', 'bg']]; // an ended offer's 44 sp price

describe.each([
  ['light', LightColors],
  ['dark', DarkColors],
] as const)('%s palette', (_name, P) => {
  const col = (k: Key | 'white') => (k === 'white' ? WHITE : P[k]);

  it.each(TEXT)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(col(fg), P[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(LARGE_TEXT)('%s on %s (large text) is at least 3:1', (fg, bg) => {
    expect(contrast(P[fg], P[bg])).toBeGreaterThanOrEqual(3);
  });

  it('keeps the gold button readable (deep green on gold)', () => {
    expect(contrast(P.promo, P.gold)).toBeGreaterThanOrEqual(4.5);
  });
});

// The chains' own colours from /api/v1/meta (2026-11-22).
const CHAINS: Record<string, string> = {
  ab: '#E63946', sklavenitis: '#1D3557', lidl: '#0050AA', mymarket: '#e07b00',
  masoutis: '#2d6a4f', bazaar: '#7b2d8b', kritikos: '#e85d04',
};

describe('readableOn (chain colours as text and as fills)', () => {
  it.each(Object.entries(CHAINS))('%s reads on a card in both palettes', (_id, hex) => {
    for (const P of [LightColors, DarkColors]) {
      expect(contrastRatio(readableOn(hex, P.surface, P.ink), P.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readableOn(hex, P.bg, P.ink), P.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.entries(CHAINS))('%s as a selected chip keeps white text readable', (_id, hex) => {
    expect(contrastRatio('#FFFFFF', readableOn(hex, '#FFFFFF', LightColors.brand))).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves a colour that already reads untouched', () => {
    expect(readableOn('#1D3557', LightColors.surface, '#000000')).toBe('#1D3557');
  });

  it('lightens on dark, darkens on light, and keeps the hue', () => {
    const onDark = readableOn('#1D3557', DarkColors.surface, '#000000'); // navy on a dark card
    expect(onDark).not.toBe('#1D3557');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(onDark.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r); // still blue
    expect(b).toBeGreaterThan(g);
    const onLight = readableOn('#e07b00', LightColors.surface, '#000000'); // orange on white
    expect(parseInt(onLight.slice(1, 3), 16)).toBeLessThan(0xe0); // darker
  });

  it('falls back when the colour is missing or not #RRGGBB', () => {
    expect(readableOn(null, '#FFFFFF', '#123456')).toBe('#123456');
    expect(readableOn('red', '#FFFFFF', '#123456')).toBe('#123456');
  });
});

describe('palettes', () => {
  it('have exactly the same names', () => {
    expect(Object.keys(DarkColors).sort()).toEqual(Object.keys(LightColors).sort());
  });

  it('use the same green and red for fills and text in light mode (no visual change)', () => {
    expect(LightColors.brandText).toBe(LightColors.brand);
  });

  it('never use pure black or pure white as the dark background or text', () => {
    expect(DarkColors.bg.toUpperCase()).not.toBe('#000000');
    expect(DarkColors.ink.toUpperCase()).not.toBe('#FFFFFF');
  });
});
