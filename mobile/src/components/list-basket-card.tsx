// «Σε ποιο κατάστημα βγαίνει φθηνότερα» — the shopping list priced at each
// chain. Numbers and sentences come from the shared src/lib/list-basket.ts
// (the website's list says the same thing); the prices are the rows each
// item's comparison sheet shows (GET /api/v1/list-prices).
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { basketText, compareBasket, type ItemPrices } from '@shared/list-basket';
import { api } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { formatPrice } from '@/lib/format';
import type { ListItem } from '@/lib/shopping-list';
import { Fonts, Radius, Space, useType, type Palette, type TypeScale } from '@/constants/theme';

// Stores shown before «Δες και τα άλλα …»: the list itself stays in view.
const ROWS = 3;

export function ListBasketCard({ items }: { items: ListItem[] }) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const chains = useChains();
  const [prices, setPrices] = useState<Record<string, ItemPrices>>({});
  const [all, setAll] = useState(false);

  // Sorted, so the same list asks the same (edge-cached) URL.
  const idsKey = useMemo(() => [...new Set(items.map((i) => i.id))].sort().join(','), [items]);
  useEffect(() => {
    if (!idsKey) return undefined;
    const ctrl = new AbortController();
    api.listPrices(idsKey.split(','), ctrl.signal)
      .then((r) => setPrices(r.items ?? {}))
      // Offline or a server error: no card, the list itself still works.
      .catch(() => {});
    return () => ctrl.abort();
  }, [idsKey]);

  const nameOf = (id: string) => chains.find((c) => c.id === id)?.name ?? id;
  const text = basketText(
    compareBasket(items.map((i) => ({ id: i.id, chain: i.chain, price: i.price, quantity: i.quantity })), prices),
    formatPrice,
    nameOf,
  );
  if (!text.lead) return null;
  const rows = all ? text.rows : text.rows.slice(0, ROWS);
  const more = text.rows.length - ROWS;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title} accessibilityRole="header">Σε ποιο κατάστημα βγαίνει φθηνότερα</Text>
      <Text style={styles.lead}>{text.lead}</Text>
      {rows.map((r) => (
        <View key={r.chain} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: chains.find((c) => c.id === r.chain)?.color ?? C.ink2 }]} />
          <View style={styles.rowBody}>
            <Text style={styles.chain}>{nameOf(r.chain)}</Text>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={r.tone === 'cheaper' ? styles.cheaper : styles.other}>{r.detail}</Text>
          </View>
        </View>
      ))}
      {!all && more > 0 ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={styles.more}>
          <Text style={styles.moreText}>
            {more === 1 ? 'Δες και το άλλο κατάστημα' : `Δες και τα άλλα ${more} καταστήματα`}
          </Text>
        </Pressable>
      ) : null}
      <Text style={styles.note}>{text.note}</Text>
    </View>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    card: { backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.line, padding: Space[4], marginBottom: Space[4] },
    title: { ...T.text.bodyStrong, color: C.ink },
    lead: { ...T.text.body, color: C.ink, marginTop: Space[1], marginBottom: Space[2] },
    row: { flexDirection: 'row', gap: Space[3], paddingVertical: Space[2], borderTopWidth: 1, borderTopColor: C.line },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    rowBody: { flex: 1, minWidth: 0 },
    chain: { ...T.text.bodyStrong, color: C.ink },
    label: { ...T.text.body, color: C.ink2, fontVariant: ['tabular-nums'] },
    cheaper: { ...T.text.bodyStrong, color: C.brandText, fontVariant: ['tabular-nums'] },
    other: { ...T.text.body, color: C.ink2, fontVariant: ['tabular-nums'] },
    more: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: C.line },
    moreText: { ...T.text.bodyStrong, fontFamily: Fonts.sans700, color: C.brandText },
    note: { ...T.text.caption, color: C.ink3Text, marginTop: Space[2] },
  });
