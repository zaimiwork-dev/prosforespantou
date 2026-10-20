// The website's live palette (globals.css, data-theme="fresh") so the app and
// the site read as one product. Light only for now: the audience is older
// shoppers and the site has no dark theme to match.
export const Colors = {
  bg: '#F4F9F2',
  bgSoft: '#E8F1E4',
  surface: '#FFFFFF',
  surface2: '#F9FCF7',
  ink: '#1C2A22',
  ink2: '#43544A',
  ink3: '#7A8880',
  ink4: '#A9B3AD',
  line: '#DCE6D5',
  line2: '#C4D2BA',
  brand: '#0F5132',
  brand2: '#1A7048',
  brandInk: '#F3EEE2',
  accent: '#D1453B',
  gold: '#E8B24A',
  good: '#1F7A3E',
  discountBg: '#FBE8E6',
} as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const Space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32 } as const;

// Base sizes are deliberately larger than a typical app's: the audience is
// elderly and 40+ shoppers. A text-size setting scales these later (week 3).
export const Type = {
  caption: 13,
  body: 16,
  bodyLg: 17,
  title: 18,
  price: 22,
  h2: 22,
  h1: 28,
} as const;
