// Under the result count: one row of facet chips built from the results
// themselves (stores, then the biggest departments, each with its count) and a
// sort control. Everything is client-side over the results already fetched.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Chip } from '@/components/chip';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';
import { SORT_LABELS, SORT_ORDER, type Facet, type SortKey } from './search-model';

export function ResultBar({
  chains,
  departments,
  chainName,
  chainColor,
  departmentLabel,
  selected,
  onToggleChain,
  onToggleDepartment,
  onClear,
  sort,
  onSort,
}: {
  chains: Facet[];
  departments: Facet[];
  chainName: (id: string) => string;
  chainColor: (id: string) => string | undefined;
  departmentLabel: (id: string) => string;
  selected: { chains: string[]; categories: string[] };
  onToggleChain: (id: string) => void;
  onToggleDepartment: (id: string) => void;
  onClear: () => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const T = useType();
  const s = useMemo(() => makeStyles(T), [T]);
  const [open, setOpen] = useState(false);
  const any = selected.chains.length + selected.categories.length > 0;
  const facetCount = chains.length + departments.length;

  return (
    <View>
      {facetCount > 1 || any ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={s.chips}>
          {any ? (
            <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Καθαρισμός φίλτρων" hitSlop={4} style={s.clear}>
              <Text style={s.clearText}>Καθαρισμός</Text>
            </Pressable>
          ) : null}
          {chains.map((f) => (
            <Chip
              key={`c:${f.id}`}
              label={`${chainName(f.id)} (${f.count})`}
              color={chainColor(f.id)}
              selected={selected.chains.includes(f.id)}
              onPress={() => onToggleChain(f.id)}
            />
          ))}
          {departments.map((f) => (
            <Chip
              key={`d:${f.id}`}
              label={`${departmentLabel(f.id)} (${f.count})`}
              selected={selected.categories.includes(f.id)}
              onPress={() => onToggleDepartment(f.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Ταξινόμηση: ${SORT_LABELS[sort]}`}
        style={s.sortPill}>
        <Text style={s.sortLabel}>Ταξινόμηση:</Text>
        <Text style={s.sortValue} numberOfLines={2}>{SORT_LABELS[sort]}</Text>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.ink2} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
        </Svg>
      </Pressable>

      {open ? (
        <View style={s.options}>
          {SORT_ORDER.map((k, i) => (
            <Pressable
              key={k}
              onPress={() => {
                onSort(k);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sort === k }}
              style={[s.option, i > 0 && s.optionLine]}>
              <View style={[s.radio, sort === k && s.radioOn]}>{sort === k ? <View style={s.dot} /> : null}</View>
              <Text style={[s.optionText, sort === k && s.optionOn]}>{SORT_LABELS[k]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    chipsRow: { marginHorizontal: -Space[4], marginBottom: Space[3], flexGrow: 0 },
    chips: { paddingHorizontal: Space[4], gap: Space[2], alignItems: 'center' },
    clear: { minHeight: 44, justifyContent: 'center', paddingRight: Space[2] },
    clearText: { ...T.text.bodyStrong, color: Colors.brand },
    sortPill: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space[2],
      alignSelf: 'stretch',
      paddingHorizontal: Space[4],
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.line2,
      borderRadius: Radius.pill,
      marginBottom: Space[3],
    },
    sortLabel: { ...T.text.chip, fontFamily: Fonts.sans500, color: Colors.ink3Text },
    sortValue: { ...T.text.chip, color: Colors.ink, flex: 1 },
    options: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, marginBottom: Space[3] },
    option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Space[3], paddingHorizontal: Space[4] },
    optionLine: { borderTopWidth: 1, borderTopColor: Colors.line },
    optionText: { ...T.text.body, color: Colors.ink },
    optionOn: { fontFamily: Fonts.sans700 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.ink3Text, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: Colors.brand },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand },
  });
