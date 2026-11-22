import { useMemo } from 'react';
// A filter chip — the one used for chains, departments, sorts and search
// suggestions everywhere in the app, so they all look and behave the same.
// Pill, 44 dp tall (older users), Inter 600 → 700 when selected; the selected
// state is announced to screen readers.
import { Pressable, StyleSheet, Text } from 'react-native';
import { Fonts, Radius, Space, useType, useColors, type Palette, readableOn } from '@/constants/theme';

export function Chip({
  label,
  selected = false,
  onPress,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  // Optional accent (e.g. a chain's colour) used when selected.
  color?: string;
}) {
  const styles = useStyles();
  const T = useType();
  const C = T.c;
  const accent = readableOn(color, '#FFFFFF', C.brand);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: accent, borderColor: accent },
        pressed && styles.pressed,
      ]}>
      <Text
        style={[T.text.chip, styles.label, selected && styles.labelSelected]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Space[4],
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.surface,
  },
  pressed: { opacity: 0.8 },
  label: { color: C.ink },
  labelSelected: { color: '#fff', fontFamily: Fonts.sans700 },
});

// Rebuilt when the palette changes (light/dark).
function useStyles() {
  const C = useColors();
  return useMemo(() => makeStyles(C), [C]);
}
