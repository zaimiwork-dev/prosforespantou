// Bottom sheet for the offers screen: chains, departments and sort. The
// choices are a DRAFT until «Δες N προσφορές» is pressed; N comes from the
// API (limit=1) for the draft, so the shopper sees what they will get.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { api, type Chain, type DealSort, type MetaResponse } from '@/lib/api';
import { ChainTile, TileGrid } from '@/components/chain-tile';
import { Chip } from '@/components/chip';
import { Colors, Fonts, Radius, Space, useType } from '@/constants/theme';

export const SORTS: { id: DealSort; label: string }[] = [
  { id: 'hot', label: 'Δημοφιλή' },
  { id: 'expiring', label: 'Λήγουν σύντομα' },
  { id: 'discount', label: 'Μεγαλύτερη έκπτωση' },
  { id: 'price_asc', label: 'Τιμή: χαμηλή → υψηλή' },
  { id: 'price_desc', label: 'Τιμή: υψηλή → χαμηλή' },
  { id: 'newest', label: 'Νεότερες' },
];

export type Filters = {
  // «Τα καταστήματά μου»: stands for the stores picked in Ρυθμίσεις.
  mine: boolean;
  chains: string[];
  categories: string[];
  sort: DealSort;
};

export const NO_FILTERS: Filters = { mine: false, chains: [], categories: [], sort: 'hot' };

// The chain ids a filter set means, «mine» expanded and de-duplicated.
export function effectiveChains(f: Filters, myChains: string[]): string[] {
  return Array.from(new Set([...(f.mine ? myChains : []), ...f.chains]));
}

export function activeCount(f: Filters): number {
  return (f.mine ? 1 : 0) + f.chains.length + f.categories.length;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const H = Dimensions.get('window').height;

export function FilterSheet({
  visible,
  focus,
  value,
  chains,
  categories,
  myChains,
  onClose,
  onApply,
}: {
  visible: boolean;
  focus: 'filters' | 'sort';
  value: Filters;
  chains: Chain[];
  categories: MetaResponse['categories'];
  myChains: string[];
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  // The body mounts on open, so its draft always starts from the applied filters.
  return visible ? (
    <SheetBody focus={focus} initial={value} chains={chains} categories={categories} myChains={myChains} onClose={onClose} onApply={onApply} />
  ) : null;
}

function SheetBody({
  focus,
  initial,
  chains,
  categories,
  myChains,
  onClose,
  onApply,
}: {
  focus: 'filters' | 'sort';
  initial: Filters;
  chains: Chain[];
  categories: MetaResponse['categories'];
  myChains: string[];
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const T = useType();
  const [draft, setDraft] = useState<Filters>(initial);
  const [slide] = useState(() => new Animated.Value(H));
  const [fade] = useState(() => new Animated.Value(0));
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sortY = useRef(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, fade]);

  const close = (after?: () => void) => {
    Animated.parallel([
      Animated.timing(slide, { toValue: H, duration: 200, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => (after ? after() : onClose()));
  };

  // Pending total for the draft. Only the settled request writes state, and
  // «loading» is derived by comparing keys, so no setState runs in the effect body.
  const ids = useMemo(() => effectiveChains(draft, myChains), [draft, myChains]);
  const key = `${ids.join(',')}|${draft.categories.join(',')}|${draft.sort}`;
  const [count, setCount] = useState<{ key: string; n: number | null }>({ key: '', n: null });
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .deals({ limit: 1, chain: ids, categories: draft.categories, sort: draft.sort }, ctrl.signal)
        .then((r) => setCount({ key, n: r.total }))
        .catch(() => {
          if (!ctrl.signal.aborted) setCount({ key, n: null });
        });
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, ids, draft.categories, draft.sort]);
  const settled = count.key === key;
  const total = settled ? count.n : null;

  const hasAny = activeCount(draft) > 0 || draft.sort !== 'hot';
  const label = !settled ? 'Φόρτωση…' : total === null ? 'Δες τις προσφορές' : total === 0 ? 'Καμία προσφορά' : `Δες ${total.toLocaleString('el-GR')} προσφορές`;

  const tiles = [
    myChains.length ? (
      <ChainTile key="mine" label="Τα καταστήματά μου" selected={draft.mine} onPress={() => setDraft({ ...draft, mine: !draft.mine })}>
        <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={Colors.brand} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 20.5s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10.5c0 5.4-7 10-7 10z" />
        </Svg>
      </ChainTile>
    ) : null,
    ...chains.map((c) => (
      <ChainTile key={c.id} chain={c} selected={draft.chains.includes(c.id)} onPress={() => setDraft({ ...draft, chains: toggle(draft.chains, c.id) })} />
    )),
  ];

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Κλείσιμο" accessibilityRole="button" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
            <View style={styles.handle} />
            <View style={styles.head}>
              <Text style={[T.text.h2, { color: Colors.ink, flex: 1 }]}>{focus === 'sort' ? 'Ταξινόμηση' : 'Φίλτρα'}</Text>
              <Pressable onPress={() => close()} accessibilityRole="button" accessibilityLabel="Κλείσιμο" hitSlop={8} style={styles.closeBtn}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2.4} strokeLinecap="round">
                  <Path d="M6 6l12 12M18 6L6 18" />
                </Svg>
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.body}
              onLayout={() => {
                if (focus === 'sort') scrollRef.current?.scrollTo({ y: Math.max(0, sortY.current - Space[2]), animated: false });
              }}>
              <Text style={[T.text.bodyStrong, styles.section]}>Καταστήματα</Text>
              {chains.length ? <TileGrid>{tiles}</TileGrid> : <Text style={[T.text.body, { color: Colors.ink3Text }]}>Φόρτωση καταστημάτων…</Text>}

              <Text style={[T.text.bodyStrong, styles.section]}>Κατηγορίες</Text>
              <TileGrid>
                {categories.map((c) => {
                  const on = draft.categories.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setDraft({ ...draft, categories: toggle(draft.categories, c.id) })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${c.full}, ${c.offers} προσφορές`}
                      style={[styles.cat, on && styles.catOn]}>
                      <Text style={[T.text.chip, { color: Colors.ink, flex: 1 }, on && { fontFamily: Fonts.sans700 }]} numberOfLines={2}>
                        {c.label}
                      </Text>
                      <Text style={[T.text.caption, { color: Colors.ink3Text }]}>{c.offers.toLocaleString('el-GR')}</Text>
                    </Pressable>
                  );
                })}
              </TileGrid>

              <View onLayout={(e) => (sortY.current = e.nativeEvent.layout.y)}>
                <Text style={[T.text.bodyStrong, styles.section]}>Ταξινόμηση</Text>
                <View style={styles.sorts}>
                  {SORTS.map((s) => (
                    <Chip key={s.id} label={s.label} selected={draft.sort === s.id} onPress={() => setDraft({ ...draft, sort: s.id })} />
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              {hasAny ? (
                <Pressable onPress={() => setDraft({ ...NO_FILTERS })} accessibilityRole="button" style={styles.clear}>
                  <Text style={[T.text.button, { color: Colors.brand }]}>Καθαρισμός</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => close(() => onApply(draft))}
                accessibilityRole="button"
                style={({ pressed }) => [styles.apply, pressed && { opacity: 0.85 }]}>
                <Text style={[T.text.button, { color: '#fff' }]}>{label}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(20,32,26,0.5)' },
  sheet: {
    height: '88%',
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.line2, marginTop: Space[2] },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space[4], paddingTop: Space[3], paddingBottom: Space[2] },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: Space[4], paddingBottom: Space[5] },
  section: { color: Colors.ink, marginTop: Space[5], marginBottom: Space[3] },
  cat: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    paddingHorizontal: Space[3],
    paddingVertical: Space[2],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  catOn: { borderColor: Colors.brand, backgroundColor: Colors.bgSoft },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
  footer: { flexDirection: 'row', gap: Space[3], padding: Space[4], borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.surface },
  clear: { minHeight: 52, paddingHorizontal: Space[4], borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  apply: { flex: 1, minHeight: 52, paddingHorizontal: Space[4], borderRadius: Radius.pill, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
});
