// «Σε άλλα καταστήματα» — the cross-chain price spread, cheapest first, with
// the offer being viewed included so the shopper sees the whole picture.
// Laid out like Trolley's comparison: plain rows on the page, the cheapest one
// raised as a white card. Offer rows open that chain's product page; shelf rows
// («Κανονική τιμή», a price we saw on the chain's shelf, not an offer) are
// never tappable.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatShortDate } from '@shared/expiry-label';
import type { ComparisonRow, DealCard } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { formatPrice, formatUnitPrice } from '@/lib/format';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

type Row = {
  key: string;
  chain: string | null;
  price: number;
  unit: DealCard['unit'];
  kind: 'current' | 'offer' | 'shelf';
  checkedAt?: string;
};

export function ComparisonSection({ current, comparison }: { current: DealCard; comparison: ComparisonRow[] }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const chains = useChains();
  const rows: Row[] = ([
    { key: current.id, chain: current.chain, price: current.price, unit: current.unit, kind: 'current' as const },
    ...comparison.map((r, i): Row =>
      r.type === 'offer'
        ? { key: r.deal.id, chain: r.deal.chain, price: r.deal.price, unit: r.deal.unit, kind: 'offer' }
        : { key: `shelf-${r.chain}-${i}`, chain: r.chain, price: r.price, unit: null, kind: 'shelf', checkedAt: r.checkedAt || r.recordedAt },
    ),
  ] as Row[]).sort((a, b) => a.price - b.price);
  const cheapest = rows[0];
  const lead = rows[0].kind === 'current' && rows.length > 1 ? rows[1].price - rows[0].price : 0;

  if (comparison.length === 0) {
    return (
      <View>
        <Text style={styles.empty}>Δεν βρήκαμε το ίδιο προϊόν σε άλλο κατάστημα ακόμα</Text>
        <Pressable
          style={styles.similar}
          onPress={() => router.navigate({ pathname: '/search', params: { q: current.title || current.name, t: String(Date.now()) } })}
          accessibilityRole="button"
          accessibilityLabel="Ψάξε παρόμοια προϊόντα">
          <Text style={styles.similarText}>Ψάξε παρόμοια</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {lead >= 0.01 ? <Text style={styles.leadLine}>Φθηνότερο εδώ κατά {formatPrice(lead)}</Text> : null}
      {rows.map((row) => {
        const chain = chains.find((c) => c.id === row.chain);
        const name = chain?.name ?? row.chain ?? '';
        // Ties share the tag: 8,32 € at two chains are both the cheapest, and
        // naming only one would send the shopper to it for no reason.
        const best = row.price - cheapest.price < 0.005;
        const diff = row.price - cheapest.price;
        const body = (
          <>
            <View style={[styles.dot, { backgroundColor: chain?.color ?? Colors.ink3 }]} />
            <View style={styles.mid}>
              <Text style={styles.chain}>{name}</Text>
              {best ? <Text style={styles.best}>Φθηνότερα</Text> : null}
              {row.kind === 'current' ? <Text style={styles.current}>Αυτή η προσφορά</Text> : null}
              {row.kind === 'shelf' ? (
                <Text style={styles.note}>
                  Κανονική τιμή{row.checkedAt ? ` · ελέγχθηκε ${formatShortDate(row.checkedAt)}` : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.right}>
              <Text style={styles.price}>{formatPrice(row.price)}</Text>
              {row.unit ? <Text style={styles.sub}>{formatUnitPrice(row.unit)}</Text> : null}
              {!best && diff > 0.004 ? <Text style={styles.diff}>+{formatPrice(diff)}</Text> : null}
            </View>
          </>
        );
        const rowStyle = [styles.row, best && styles.rowBest];
        return row.kind === 'offer' ? (
          <Pressable
            key={row.key}
            onPress={() => router.push({ pathname: '/offer/[id]', params: { id: row.key } })}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${formatPrice(row.price)}`}
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

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    empty: { ...T.text.body, color: Colors.ink2 },
    similar: {
      marginTop: Space[3],
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.pill,
      borderWidth: 2,
      borderColor: Colors.brand,
      backgroundColor: Colors.surface,
    },
    similarText: { ...T.text.button, color: Colors.brand },
    leadLine: { ...T.text.bodyStrong, color: Colors.good, marginBottom: Space[2] },
    list: { gap: Space[1] },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 64,
      gap: Space[3],
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: Space[3],
      paddingVertical: Space[3],
    },
    // Raised: white, hairline border and a soft shadow (elevation on Android).
    rowBest: {
      backgroundColor: Colors.surface,
      borderColor: Colors.line,
      shadowColor: '#1C2A22',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    pressed: { opacity: 0.85 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    mid: { flex: 1, gap: 2 },
    chain: { ...T.text.title, fontFamily: Fonts.sans700, color: Colors.ink },
    sub: { ...T.text.secondary, color: Colors.ink3Text, textAlign: 'right' },
    note: { ...T.text.secondary, color: Colors.ink3Text },
    current: { ...T.text.caption, fontFamily: Fonts.sans700, color: Colors.brand },
    best: { ...T.text.badge, color: Colors.good },
    right: { alignItems: 'flex-end', flexShrink: 0 },
    price: { ...T.text.price, color: Colors.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    diff: { ...T.text.caption, fontFamily: Fonts.sans700, color: Colors.accent },
  });
