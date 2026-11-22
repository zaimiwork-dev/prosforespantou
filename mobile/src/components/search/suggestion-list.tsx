// What appears under the search field while the shopper types: first a row that
// searches exactly what was typed (so search never depends on the suggestion
// request), then departments («σε Γαλακτοκομικά»), then completions with the
// typed part in bold and the number of offers on the right.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SuggestResponse } from '@/lib/api';
import { Radius, Space, useType, type TypeScale, type Palette } from '@/constants/theme';
import { CategoryIcon, SearchIcon } from '@/components/home/icons';
import { splitHighlight } from './search-model';

export function SuggestionList({
  typed,
  data,
  onSearch,
  onTerm,
  onCategory,
}: {
  typed: string;
  data: SuggestResponse | null;
  onSearch: () => void;
  onTerm: (text: string) => void;
  onCategory: (c: { id: string; label: string }) => void;
}) {
  const T = useType();
  const C = T.c;
  const s = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={s.box}>
      <Pressable onPress={onSearch} accessibilityRole="button" accessibilityLabel={`Αναζήτηση για ${typed}`} style={({ pressed }) => [s.row, pressed && s.pressed]}>
        <SearchIcon size={22} color={C.brandText} />
        <Text style={s.rowText} numberOfLines={1}>
          Αναζήτηση για <Text style={s.strong}>«{typed.trim()}»</Text>
        </Text>
      </Pressable>
      {data?.categories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onCategory(c)}
          accessibilityRole="button"
          accessibilityLabel={`Προσφορές σε ${c.label}`}
          style={({ pressed }) => [s.row, s.line, pressed && s.pressed]}>
          <CategoryIcon id={c.id} size={22} color={C.brandText} />
          <Text style={s.rowText} numberOfLines={1}>
            σε <Text style={s.strong}>{c.label}</Text>
          </Text>
        </Pressable>
      ))}
      {data?.terms.map((t) => (
        <Pressable
          key={t.text}
          onPress={() => onTerm(t.text)}
          accessibilityRole="button"
          accessibilityLabel={`${t.text}, ${t.count} προσφορές`}
          style={({ pressed }) => [s.row, s.line, pressed && s.pressed]}>
          <Text style={[s.rowText, s.term]} numberOfLines={1}>
            {splitHighlight(t.text, typed).map((p, i) => (
              <Text key={i} style={p.bold ? s.strong : undefined}>{p.text}</Text>
            ))}
          </Text>
          <Text style={s.count}>{t.count.toLocaleString('el-GR')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    box: { marginTop: Space[3], backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
    row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Space[3], paddingHorizontal: Space[4] },
    line: { borderTopWidth: 1, borderTopColor: C.line },
    pressed: { backgroundColor: C.bgSoft },
    rowText: { ...T.text.body, fontSize: T.bodyLg, color: C.ink, flexShrink: 1 },
    term: { flex: 1 },
    strong: { fontFamily: T.text.bodyStrong.fontFamily },
    count: { ...T.text.caption, color: C.ink3Text },
  });
