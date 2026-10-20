// One offer — the app's version of the website card (src/components/
// DiscountCard.js). Every display decision except expiry wording arrives
// precomputed in the DealCard (src/lib/api/deal-card.ts on the server);
// expiry is derived here with the website's own expiryInfo because it depends
// on today and a card can sit in a saved list for days.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { expiryInfo } from '@shared/expiry-label';
import type { DealCard as Deal } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { Colors, Radius, Space, Type } from '@/constants/theme';

const VERDICT_LABEL = { lowest: 'Χαμηλότερη τιμή', good: 'Καλή τιμή' } as const;

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

export function DealCardView({
  deal,
  width,
  onPress,
}: {
  deal: Deal;
  width?: number;
  onPress?: (deal: Deal) => void;
}) {
  const chains = useChains();
  const chain = chains.find((c) => c.id === deal.chain);
  const exp = useMemo(
    () =>
      expiryInfo({
        validFrom: deal.validFrom,
        validUntil: deal.validUntil,
        updatedAt: deal.updatedAt,
        datesFromSource: deal.datesFromSource,
      }),
    [deal.validFrom, deal.validUntil, deal.updatedAt, deal.datesFromSource],
  );

  return (
    <Pressable
      onPress={onPress ? () => onPress(deal) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${deal.name}, ${euro(deal.price)}, ${chain?.name ?? deal.chain ?? ''}`}
      style={({ pressed }) => [styles.card, width ? { width } : null, pressed && styles.pressed]}>
      <View style={styles.imageWrap}>
        {deal.imageUrl ? (
          <Image source={{ uri: deal.imageUrl }} style={styles.image} contentFit="contain" transition={150} />
        ) : (
          <View style={[styles.image, styles.noImage]} />
        )}
        {deal.percent ? (
          <View style={styles.percent}>
            <Text style={styles.percentText}>-{deal.percent}%</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={[styles.chainPill, { backgroundColor: chain?.bg ?? Colors.bgSoft }]}>
          <Text style={[styles.chainText, { color: chain?.color ?? Colors.ink2 }]} numberOfLines={1}>
            {chain?.name ?? deal.chain ?? ''}
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {deal.title || deal.name}
        </Text>
        {deal.size ? <Text style={styles.size}>{deal.size}</Text> : null}

        <View style={styles.priceRow}>
          <Text style={styles.price}>{euro(deal.price)}</Text>
          {deal.originalPrice ? <Text style={styles.was}>{euro(deal.originalPrice)}</Text> : null}
        </View>
        {deal.baseline ? <Text style={styles.baseline}>κανονικά ~{euro(deal.baseline.price)}</Text> : null}
        {deal.unit ? (
          <Text style={styles.unit}>
            {euro(deal.unit.value)} / {deal.unit.per}
          </Text>
        ) : null}

        {deal.verdict ? <Text style={styles.verdict}>{VERDICT_LABEL[deal.verdict]}</Text> : null}
        {exp.chip ? <Text style={[styles.chip, exp.urgent && styles.chipUrgent]}>{exp.chip}</Text> : null}
        {deal.compareChains >= 2 ? (
          <Text style={styles.compare}>Σε {deal.compareChains} καταστήματα</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  imageWrap: { backgroundColor: Colors.surface2, padding: Space[3] },
  image: { width: '100%', aspectRatio: 1 },
  noImage: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md },
  percent: {
    position: 'absolute',
    top: Space[2],
    left: Space[2],
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  percentText: { color: '#fff', fontWeight: '800', fontSize: Type.caption },
  body: { padding: Space[3], gap: 3 },
  chainPill: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chainText: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: Type.body, fontWeight: '600', color: Colors.ink, lineHeight: 21 },
  size: { fontSize: Type.caption, color: Colors.ink3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space[2], marginTop: 2 },
  price: { fontSize: Type.price, fontWeight: '800', color: Colors.ink },
  was: { fontSize: Type.caption, color: Colors.ink3, textDecorationLine: 'line-through' },
  baseline: { fontSize: Type.caption, color: Colors.ink3 },
  unit: { fontSize: Type.caption, color: Colors.ink2 },
  verdict: { fontSize: Type.caption, color: Colors.good, fontWeight: '700' },
  chip: { fontSize: Type.caption, color: Colors.ink2 },
  chipUrgent: { color: Colors.accent, fontWeight: '700' },
  compare: { fontSize: Type.caption, color: Colors.brand, fontWeight: '600' },
});
