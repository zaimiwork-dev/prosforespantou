import { useColorScheme } from 'react-native';
import { useSettings } from '@/lib/settings';

// Two palettes with the same names. Light is the website's live palette
// (globals.css, data-theme="fresh") so the app and the site read as one
// product. Dark follows Material's advice: near-black with a green tint (no
// pure black), lighter text that is not pure white, and every text pair at
// 4.5:1 or more (checked 2026-11-22).
//
// Green and red each have a FILL shade (buttons, badges, with white text on
// them) and a TEXT shade (words and icons on the page). In light mode they are
// the same colour; in dark mode no single green can be both a fill under white
// text and a text colour on near-black, so they differ.
export const LightColors = {
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
  // Fill green (buttons, selected pills); white text sits on it.
  brand: '#0F5132',
  // Green for words, icons, borders and links on the page.
  brandText: '#0F5132',
  brand2: '#1A7048',
  brandInk: '#F3EEE2',
  // The promo banner and text on the gold button: the deep green in both modes
  // (gold on it is 4.9:1; on the dark-mode fill green it would be 2.8:1).
  promo: '#0F5132',
  onGold: '#1C2A22',
  accent: '#D1453B',
  // Red TEXT. accent is 4.25:1 on bg and 3.85:1 on discountBg (WCAG asks
  // 4.5:1 below 18 sp); this is 5.2 / 4.7 and looks the same. accent stays
  // for fills and badges (white on accent = 4.5:1).
  accentText: '#BD3A30',
  gold: '#E8B24A',
  good: '#1F7A3E',
  goodBg: '#E3F2E6',
  discountBg: '#FBE8E6',
  // Product photos and chain logos are on white: their frames stay light.
  imageBg: '#F9FCF7',
  toastBg: '#1C2A22',
  scrim: 'rgba(20,32,26,0.5)',
  liveRing: '#BFDDC9',
};

export type Palette = { [K in keyof typeof LightColors]: string };

export const DarkColors: Palette = {
  bg: '#0E1411',
  bgSoft: '#223029',
  surface: '#18201B',
  surface2: '#1B241E',
  ink: '#E6EDE8',
  ink2: '#BAC7BF',
  ink3: '#88968E',
  ink3Text: '#A2AFA7',
  ink4: '#5B6862',
  line: '#28342D',
  line2: '#3A4941',
  brand: '#1F7A4D', // white on it 5.3:1
  brandText: '#82D6A3', // 10.7:1 on bg
  brand2: '#2A8F5C',
  brandInk: '#F3EEE2',
  promo: '#0F5132',
  onGold: '#1C2A22',
  accent: '#D1453B',
  accentText: '#FF8E83', // 8.4:1 on bg, 6.7:1 on discountBg
  gold: '#E8B24A',
  good: '#72CF93',
  goodBg: '#1D3426',
  discountBg: '#3A211F',
  // White packshots on a dark card look like holes; a white frame looks meant.
  imageBg: '#FFFFFF',
  toastBg: '#2C3B33',
  scrim: 'rgba(0,0,0,0.6)',
  liveRing: '#2F5A3F',
};

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two #RRGGBB colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * A colour that keeps its hue but reads on `bg` (4.5:1): darkened on a light
 * background, lightened on a dark one, only as much as needed. For chain
 * colours used as text — the chains' own oranges are ~3:1 on white and
 * Σκλαβενίτης navy is invisible on a dark card. As a FILL under white text,
 * pass bg = '#FFFFFF'. Anything that is not #RRGGBB gets `fallback`.
 */
export function readableOn(color: string | null | undefined, bg: string, fallback: string, min = 4.5): string {
  if (!color || !HEX.test(color) || !HEX.test(bg)) return fallback;
  if (contrastRatio(color, bg) >= min) return color;
  const toWhite = luminance(bg) < 0.18;
  const n = parseInt(color.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map((v) => Math.round(toWhite ? v + (255 - v) * t : v * (1 - t)));
    const hex = '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (contrastRatio(hex, bg) >= min) return hex;
  }
  return fallback;
}

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

// `c` is the active palette and `dark` says which one. They travel with the
// type scale because every screen already builds its styles from it
// (`useMemo(() => makeStyles(T), [T])`): when the shopper switches text size
// OR the phone switches to dark, T is a different object and every style is
// rebuilt. Never read a palette from a module-level constant in a component —
// the React Compiler would keep the old colours.
export type TypeScale = Record<keyof typeof Type, number> & {
  text: Record<TextRoleName, Role>;
  c: Palette;
  dark: boolean;
};

const LARGE = 1.2;

function build(k: number, dark: boolean): TypeScale {
  const legacy = Object.fromEntries(Object.entries(Type).map(([n, v]) => [n, Math.round(v * k)]));
  const text = Object.fromEntries(
    Object.entries(TextRoles).map(([n, r]) => [
      n,
      { fontFamily: r.fontFamily, fontSize: Math.round(r.fontSize * k), lineHeight: Math.round(r.lineHeight * k) },
    ]),
  );
  return { ...legacy, text, c: dark ? DarkColors : LightColors, dark } as TypeScale;
}
// Built once each, so T keeps its identity between renders.
const SCALES = {
  normal: { light: build(1, false), dark: build(1, true) },
  large: { light: build(LARGE, false), dark: build(LARGE, true) },
} as const;

export type Scheme = 'light' | 'dark';

// The shopper's «Εμφάνιση» choice; «Αυτόματα» follows the phone (Android's
// own advice). Needs userInterfaceStyle "automatic" in app.json AND
// expo-system-ui installed — without it Android always reports light.
export function useScheme(): Scheme {
  const pref = useSettings().appearance;
  const system = useColorScheme();
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

// Type scaled by the shopper's «Μεγάλα γράμματα» setting (about 1.2x, like the
// website's large mode), in the active palette. Android's own font scaling
// still applies on top.
export function useType(): TypeScale {
  const large = useSettings().textSize === 'large';
  return SCALES[large ? 'large' : 'normal'][useScheme()];
}

// For screens that are always large (onboarding), in the active palette.
export function useTypeLarge(): TypeScale {
  return SCALES.large[useScheme()];
}

// For components that need colours but no text roles.
export function useColors(): Palette {
  return useType().c;
}
