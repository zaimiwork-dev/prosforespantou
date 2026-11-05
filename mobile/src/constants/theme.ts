import { useSettings } from '@/lib/settings';

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
  // Grey text under 18 px: ink3 is only 3.7:1 on white, this one is ~5.6:1.
  ink3Text: '#5F6E65',
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

// Font family names exactly as registered by useFonts() in the root layout.
// On Android every weight is its own family, so a weight is chosen by family
// name and fontWeight is never set next to it (it would fake-bold the file).
export const Fonts = {
  sans400: 'Inter_400Regular',
  sans500: 'Inter_500Medium',
  sans600: 'Inter_600SemiBold',
  sans700: 'Inter_700Bold',
  sans900: 'Inter_900Black',
  serif: 'NotoSerifDisplay_400Regular',
  serifItalic: 'NotoSerifDisplay_400Regular_Italic',
} as const;

// Legacy numeric sizes. Screens written before the redesign still read these
// (T.body ...); new code uses the role styles in useType().text instead.
export const Type = {
  caption: 14,
  body: 16,
  bodyLg: 17,
  title: 18,
  price: 22,
  h2: 22,
  h1: 28,
} as const;

type Role = { fontFamily: string; fontSize: number; lineHeight: number };
const role = (fontFamily: string, fontSize: number, lineHeight: number): Role => ({ fontFamily, fontSize, lineHeight });

// DESIGN.md type table as ready-to-spread text styles: <Text style={T.text.price}>.
// Always an explicit lineHeight: the default clips Greek accents on Android.
export const TextRoles = {
  hero: role(Fonts.serif, 32, 36),
  heroItalic: role(Fonts.serifItalic, 32, 36), // second hero line, set in brand green by the screen
  h2: role(Fonts.serif, 26, 30),
  priceLarge: role(Fonts.sans900, 44, 48),
  price: role(Fonts.sans900, 26, 30),
  title: role(Fonts.sans500, 17, 22),
  secondary: role(Fonts.sans500, 15, 20),
  badge: role(Fonts.sans900, 14, 18),
  button: role(Fonts.sans700, 17, 22),
  tabLabel: role(Fonts.sans600, 13, 18),
  chip: role(Fonts.sans600, 16, 22),
  body: role(Fonts.sans400, 16, 22),
  bodyStrong: role(Fonts.sans700, 16, 22),
  caption: role(Fonts.sans500, 14, 18),
} as const;
export type TextRoleName = keyof typeof TextRoles;

export type TypeScale = Record<keyof typeof Type, number> & { text: Record<TextRoleName, Role> };

const LARGE = 1.2;

function build(k: number): TypeScale {
  const legacy = Object.fromEntries(Object.entries(Type).map(([n, v]) => [n, Math.round(v * k)]));
  const text = Object.fromEntries(
    Object.entries(TextRoles).map(([n, r]) => [
      n,
      { fontFamily: r.fontFamily, fontSize: Math.round(r.fontSize * k), lineHeight: Math.round(r.lineHeight * k) },
    ]),
  );
  return { ...legacy, text } as TypeScale;
}
const TYPE_NORMAL = build(1);
const TYPE_LARGE = build(LARGE);
// For screens that are always large (onboarding).
export const TypeLarge: TypeScale = TYPE_LARGE;

// Type scaled by the shopper's «Μεγάλα γράμματα» setting (about 1.2x, like the
// website's large mode). Android's own font scaling still applies on top.
export function useType(): TypeScale {
  return useSettings().textSize === 'large' ? TYPE_LARGE : TYPE_NORMAL;
}
