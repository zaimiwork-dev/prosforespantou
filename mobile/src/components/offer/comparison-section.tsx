// «Σε άλλα καταστήματα» — the cross-chain price spread, cheapest first, with
// the offer being viewed included so the shopper sees the whole picture.
// Offer rows open that chain's product page; shelf rows («Κανονική τιμή», a
// price we saw on the chain's shelf, not an offer) are never tappable.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatShortDate } from '@shared/expiry-label';
import type { ComparisonRow, DealCard } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { Colors, Radius, Space, Type } from '@/constants/theme';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

type Row = {
  key: string;
  chain: string | null;
  price: number;
  unit: DealCard['unit'];
  kind: 'current' | 'offer' | 'shelf';
  checkedAt?: string;
};

export function ComparisonSection({ current, comparison }: { current: DealCard; comparison: ComparisonRow[] }) {
  const chains = useChains();
  if (comparison.length === 0) return null;

  const rows: Row[] = ([
    { key: current.id, chain: current.chain, price: current.price, unit: current.unit, kind: 'current' as const },
    ...comparison.map((r, i): Row =>
      r.type === 'offer'
        ? { key: r.deal.id, chain: r.deal.chain, price: r.deal.price, unit: r.deal.unit, kind: 'offer' }
        : { key: `shelf-${r.chain}-${i}`, chain: r.chain, price: r.price, unit: null, kind: 'shelf', checkedAt: r.checkedAt || r.recordedAt },
    ),
  ] as Row[]).sort((a, b) => a.price - b.price);
  const cheapest = rows[0];

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const chain = chains.find((c) => c.id === row.chain);
        const name = chain?.name ?? row.chain ?? '';
        // Ties share the tag: 8,32€ at two chains are both the cheapest, and
        // naming only one would send the shopper to it for no reason.
        const best = row.price - cheapest.price < 0.005;
        const diff = row.price - cheapest.price;
        const body = (
          <>
            <View style={[styles.dot, { backgroundColor: chain?.color ?? Colors.ink3 }]} />
            <View style={styles.mid}>
              <Text style={styles.chain}>{name}</Text>
              {row.kind === 'shelf' ? (
                <Text style={styles.sub}>
                  Κανονική τιμή{row.checkedAt ? ` · ελέγχθηκε ${formatShortDate(row.checkedAt)}` : ''}
                </Text>
              ) : null}
              {row.kind === 'current' ? <Text style={styles.current}>Αυτή η προσφορά</Text> : null}
              {best ? <Text style={styles.best}>Φθηνότερα</Text> : null}
              {row.unit ? (
                <Text style={styles.sub}>
                  {euro(row.unit.value)} / {row.unit.per}
                </Text>
              ) : null}
            </View>
            <View style={styles.right}>
              <Text style={styles.price}>{euro(row.price)}</Text>
              {!best && diff > 0.004 ? <Text style={styles.diff}>+{euro(diff)}</Text> : null}
            </View>
          </>
        );
        const rowStyle = [styles.row, best && styles.rowBest];
        return row.kind === 'offer' ? (
          <Pressable
            key={row.key}
            onPress={() => router.push({ pathname: '/offer/[id]', params: { id: row.key } })}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${euro(row.price)}`}
            style={({ pressed }) => [rowStyle, pressed && styles.pressed]}>
            {body}
          </Pressable>
        ) : (
          <View key={row.key} style={rowStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Space[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    gap: Space[3],
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Space[3],
    paddingVertical: Space[3],
  },
  rowBest: { borderColor: Colors.good, borderWidth: 2, backgroundColor: '#F2FAF3' },
  pressed: { opacity: 0.85 },
  dot: { width: 10, height: 36, borderRadius: 5 },
  mid: { flex: 1, gap: 2 },
  chain: { fontSize: Type.bodyLg, fontWeight: '700', color: Colors.ink },
  sub: { fontSize: Type.caption, color: Colors.ink3 },
  current: { fontSize: Type.caption, color: Colors.brand, fontWeight: '700' },
  best: { fontSize: Type.caption, color: Colors.good, fontWeight: '800' },
  right: { alignItems: 'flex-end' },
  price: { fontSize: Type.price, fontWeight: '800', color: Colors.ink },
  diff: { fontSize: Type.caption, color: Colors.accent, fontWeight: '600' },
});
