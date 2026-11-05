// A chain as a tile: logo on white, name under it, a check mark when picked.
// Used by the offers filter sheet, settings and onboarding (2-column grid).
// `children` replaces the logo (the «Τα καταστήματά μου» tile has no chain).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import type { Chain } from '@/lib/api';
import { Colors, Fonts, Radius, Space, useType } from '@/constants/theme';

export function ChainTile({
  chain,
  label,
  selected,
  onPress,
  children,
}: {
  chain?: Chain;
  label?: string;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const T = useType();
  const name = label ?? chain?.name ?? '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.tile, selected && styles.tileOn, pressed && { opacity: 0.85 }]}>
      <View style={styles.logoBox}>
        {children ??
          (chain?.logoUrl ? (
            <Image source={{ uri: chain.logoUrl }} style={styles.logo} contentFit="contain" accessibilityLabel={name} />
          ) : (
            <Text style={[T.text.h2, { color: chain?.color ?? Colors.brand }]}>{chain?.short ?? name.slice(0, 2)}</Text>
          ))}
      </View>
      <Text style={[T.text.caption, styles.name, selected && { fontFamily: Fonts.sans700 }]} numberOfLines={2}>
        {name}
      </Text>
      {selected ? (
        <View style={styles.check}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space[2],
    padding: Space[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  tileOn: { borderColor: Colors.brand, backgroundColor: Colors.bgSoft },
  logoBox: { height: 44, width: '100%', alignItems: 'center', justifyContent: 'center' },
  logo: { height: 44, width: '80%' },
  name: { color: Colors.ink, textAlign: 'center' },
  check: {
    position: 'absolute',
    top: Space[2],
    right: Space[2],
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Tiles in rows of two; an odd last tile gets an empty partner so it keeps its width.
export function TileGrid({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: Space[3] }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: Space[3] }}>
          {r}
          {r.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}
