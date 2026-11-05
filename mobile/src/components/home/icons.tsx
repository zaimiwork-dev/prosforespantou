// Line glyphs for the home screen. Category paths are ported from the
// website's src/components/CategoryIcon.js (same 24x24 drawings, ids are the
// category labels from /api/v1/meta), so tiles match the site.
import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

const CATEGORY_PATHS: Record<string, ReactNode> = {
  'Φρούτα & Λαχανικά': (
    <>
      <Path d="M12 8.5c-1-1.2-2.4-1.8-3.8-1.4C6.3 7.6 5 9.6 5 12.2c0 3.3 2.3 7.3 4.3 7.3.9 0 1.6-.5 2.7-.5s1.8.5 2.7.5c2 0 4.3-4 4.3-7.3 0-2.6-1.3-4.6-3.2-5.1-1.4-.4-2.8.2-3.8 1.4Z" />
      <Path d="M12 8.5V6a3 3 0 0 1 3-3" />
    </>
  ),
  'Κρέας & Ψάρι': (
    <>
      <Path d="M7 12c2.3-3.3 5.2-4.9 8.6-4.9 2.8 0 5.2 1.3 7 4.1.3.5.3 1.1 0 1.6-1.8 2.8-4.2 4.1-7 4.1-3.4 0-6.3-1.6-8.6-4.9Z" />
      <Path d="M7 12 3 8.6v6.8L7 12Z" />
      <Path d="M13 9.6c.9.7 1.4 1.5 1.4 2.4s-.5 1.7-1.4 2.4" />
      <Circle cx={18} cy={10.9} r={0.9} fill="currentColor" stroke="none" />
    </>
  ),
  'Γαλακτοκομικά & Είδη Ψυγείου': (
    <>
      <Path d="M6 10.2 12 3.5l6 6.7V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10.2Z" />
      <Path d="M6 10.2h12M12 3.5v6.7" />
    </>
  ),
  'Τυριά & Αλλαντικά': (
    <>
      <Path d="M3 16V9.5l9-4.5 9 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <Path d="M3 9.5h18" />
      <Circle cx={8} cy={13} r={1.2} />
      <Circle cx={15} cy={12.5} r={1.6} />
    </>
  ),
  'Σαλάτες & Αλοιφές': (
    <>
      <Path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
      <Path d="M12 11c0-2.8 1.9-5 4.5-5.5M12 11c-.6-1.8-2-3-3.9-3.3" />
    </>
  ),
  'Κονσέρβες': (
    <>
      <Ellipse cx={12} cy={6} rx={6} ry={2.5} />
      <Path d="M6 6v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
      <Path d="M6 11.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </>
  ),
  'Αρτοποιία': (
    <>
      <Path d="M4 15.5c0-4.1 3.6-7.5 8-7.5s8 3.4 8 7.5c0 .9-.7 1.5-1.6 1.5H5.6c-.9 0-1.6-.6-1.6-1.5Z" />
      <Path d="M9 17V9.2M15 17V9.2" />
    </>
  ),
  'Κατεψυγμένα': (
    <>
      <Path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      <Path d="m9.5 5 2.5 2.5L14.5 5M9.5 19l2.5-2.5 2.5 2.5" />
    </>
  ),
  'Είδη Παντοπωλείου': (
    <>
      <Path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9Z" />
      <Path d="M8.5 9 10 4m5.5 5L14 4" />
      <Path d="M9 13v3M15 13v3" />
    </>
  ),
  'Πρωινό & Ροφήματα': (
    <>
      <Path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <Path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <Path d="M8 6V4M12 6V4" />
    </>
  ),
  'Σνακ & Γλυκά': (
    <>
      <Rect x={4} y={5} width={16} height={14} rx={1.6} />
      <Path d="M4 10h16M4 14.5h16M9.5 5v14M14.5 5v14" />
    </>
  ),
  'Κάβα': (
    <>
      <Path d="M7 4h10l-.6 5.3a4.5 4.5 0 0 1-8.8 0L7 4Z" />
      <Path d="M12 14v6M9 20h6" />
    </>
  ),
  'Προσωπική Φροντίδα': (
    <>
      <Path d="M8 10h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9Z" />
      <Path d="M11 10V7h2.5" />
      <Path d="M13.5 7h2.5V4.5" />
    </>
  ),
  'Βρεφικά Είδη': (
    <>
      <Path d="M8.5 10h7v8.5a2.5 2.5 0 0 1-2.5 2.5h-2a2.5 2.5 0 0 1-2.5-2.5V10Z" />
      <Path d="M9.5 10V8.2h5V10" />
      <Path d="M12 8.2V6a2 2 0 0 1 2-2" />
      <Path d="M8.5 14h2.5M8.5 17h2.5" />
    </>
  ),
  'Είδη Καθαρισμού & Σπιτιού': (
    <>
      <Path d="M8.2 10.2h5.6V19a2 2 0 0 1-2 2h-1.6a2 2 0 0 1-2-2v-8.8Z" />
      <Path d="M9.6 10.2V6.6h2.8v3.6" />
      <Path d="M12.4 7.4h3.4l-1.1 1.8" />
      <Path d="M18 6.6h.01M19.6 8.4h.01M18.4 10.4h.01" />
    </>
  ),
  'Είδη Κατοικιδίων': (
    <>
      <Ellipse cx={12} cy={16} rx={4} ry={3.4} />
      <Ellipse cx={6.5} cy={11} rx={1.8} ry={2.3} />
      <Ellipse cx={17.5} cy={11} rx={1.8} ry={2.3} />
      <Ellipse cx={9.8} cy={7} rx={1.8} ry={2.3} />
      <Ellipse cx={14.2} cy={7} rx={1.8} ry={2.3} />
    </>
  ),
  'Άλλο': (
    <>
      <Path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
      <Path d="m3 8.5 9 4.5 9-4.5M12 13v7" />
    </>
  ),
};

type IconProps = { size?: number; color: string; strokeWidth?: number };

function Line({ size = 24, color, strokeWidth = 1.7, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" color={color} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function CategoryIcon({ id, ...p }: IconProps & { id: string }) {
  // `currentColor` in the ported paths (fish eye) maps to the stroke colour.
  return <Line {...p}>{CATEGORY_PATHS[id] ?? CATEGORY_PATHS['Άλλο']}</Line>;
}

export function GearIcon(p: IconProps) {
  return (
    <Line {...p} strokeWidth={1.8}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Line>
  );
}

// Shopping bag, like the site's header «λίστα» glyph.
export function ListIcon(p: IconProps) {
  return (
    <Line {...p} strokeWidth={1.8}>
      <Path d="M5 8h14l-1 12H6L5 8Z" />
      <Path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Line>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Line {...p} strokeWidth={2}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </Line>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <Line {...p} strokeWidth={2.2}>
      <Path d="M5 12h14M13 6l6 6-6 6" />
    </Line>
  );
}
