// «Ανά διάδρομο» — department tiles (icon, short name, offer count). Shown on the
// idle search screen and under an empty result, so there is always a way forward.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MetaResponse } from '@/lib/api';
import { Colors, Radius, Space, useType, type TypeScale } from '@/constants/theme';
import { CategoryIcon } from '@/components/home/icons';
import { useMemo } from 'react';

type Cat = MetaResponse['categories'][number];

export function AisleGrid({ categories, onPick, title = 'Ανά διάδρομο' }: { categories: Cat[] | undefined; onPick: (c: Cat) => void; title?: string }) {
  const T = useType();
  const s = useMemo(() => makeStyles(T), [T]);
  const tiles = (categories ?? []).filter((c) => c.offers > 0);
  if (tiles.length === 0) return null;
  return (
    <View>
      <Text style={s.h2} accessibilityRole="header">{title}</Text>
      <View style={s.grid}>
        {tiles.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPick(c)}
            accessibilityRole="button"
            accessibilityLabel={`${c.full}, ${c.offers} προσφορές`}
            style={({ pressed }) => [s.tile, pressed && s.pressed]}>
            <View style={s.icon}>
              <CategoryIcon id={c.id} size={26} color={Colors.brand} />
            </View>
            <View style={s.text}>
              <Text style={s.label} numberOfLines={2}>{c.label}</Text>
              <Text style={s.count}>{c.offers.toLocaleString('el-GR')} προσφορές</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    h2: { ...T.text.h2, color: Colors.ink, marginTop: Space[6], marginBottom: Space[3] },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[3] },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space[3],
      padding: Space[3],
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.line,
      borderRadius: Radius.md,
    },
    pressed: { opacity: 0.8 },
    icon: { width: 44, height: 44, borderRadius: Radius.pill, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1 },
    label: { ...T.text.bodyStrong, color: Colors.ink },
    count: { ...T.text.caption, color: Colors.ink3Text },
  });
