// A filter chip — the one used for chains, departments, sorts and search
// suggestions everywhere in the app, so they all look and behave the same.
// Touch target is at least 44 px tall (older users), selected state is
// announced to screen readers.
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Radius, Space, Type } from '@/constants/theme';

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
  const accent = color ?? Colors.brand;
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
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Space[4],
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.line2,
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.8 },
  label: { fontSize: Type.body, color: Colors.ink, fontWeight: '600' },
  labelSelected: { color: '#fff' },
});
