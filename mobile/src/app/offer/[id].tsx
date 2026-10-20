// Product page — the website's offer page (OfferDetails + PriceComparison +
// PriceHistory) from GET /api/v1/offers/:id, laid out for a phone. The server
// answers for ended offers too (shared links, saved lists) with active:false,
// so an old price is never shown as if it were current.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { expiryInfo } from '@shared/expiry-label';
import { api, ApiError, type OfferResponse } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { DealCardView } from '@/components/deal-card';
import { ComparisonSection } from '@/components/offer/comparison-section';
import { PriceHistoryChart } from '@/components/offer/price-history-chart';
import { Colors, Radius, Space, Type } from '@/constants/theme';

const VERDICT_LABEL = { lowest: 'Χαμηλότερη τιμή', good: 'Καλή τιμή' } as const;

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

type Result = { key: string; data: OfferResponse | null; status: number | null };

export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chains = useChains();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${id}:${attempt}`;

  // State is stamped with the request it belongs to, so a new id (tapping a
  // comparison row reuses nothing) or a retry reads as loading without any
  // synchronous setState in the effect.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .offer(id, ctrl.signal)
      .then((data) => setResult({ key, data, status: null }))
      .catch((e) => {
        if (!ctrl.signal.aborted) setResult({ key, data: null, status: e instanceof ApiError ? e.status : 0 });
      });
    return () => ctrl.abort();
  }, [id, key]);

  const current = result?.key === key ? result : null;
  const data = current?.data ?? null;
  const chainName = data ? chains.find((c) => c.id === data.offer.chain)?.name : undefined;
  const title = chainName ?? 'Προσφορά';

  if (!current) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (!data) {
    const notFound = current.status === 404;
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.errorTitle}>{notFound ? 'Η προσφορά δεν βρέθηκε' : 'Δεν φορτώθηκε η προσφορά'}</Text>
        {notFound ? null : <Text style={styles.errorText}>Έλεγξε τη σύνδεσή σου στο ίντερνετ.</Text>}
        {notFound ? (
          <Pressable
            style={styles.primary}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Πίσω</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button">
            <Text style={styles.primaryText}>Δοκίμασε ξανά</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <OfferContent data={data} />
    </>
  );
}

function OfferContent({ data }: { data: OfferResponse }) {
  const { offer, comparison, history, similar } = data;
  const chains = useChains();
  const chain = chains.find((c) => c.id === offer.chain);
  const exp = useMemo(
    () =>
      expiryInfo({
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        updatedAt: offer.updatedAt,
        datesFromSource: offer.datesFromSource,
      }),
    [offer.validFrom, offer.validUntil, offer.updatedAt, offer.datesFromSource],
  );
  const muted = !offer.active;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {muted ? (
        <View style={styles.ended} accessibilityRole="alert">
          <Text style={styles.endedText}>Η προσφορά έχει λήξει</Text>
        </View>
      ) : null}

      <View style={styles.imagePanel}>
        {offer.imageUrl ? (
          <Image source={{ uri: offer.imageUrl }} style={styles.image} contentFit="contain" transition={150} />
        ) : (
          <View style={[styles.image, styles.noImage]} />
        )}
      </View>

      <View style={[styles.chainPill, { backgroundColor: chain?.bg ?? Colors.bgSoft }]}>
        <Text style={[styles.chainText, { color: chain?.color ?? Colors.ink2 }]}>{chain?.name ?? offer.chain ?? ''}</Text>
      </View>
      <Text style={styles.name}>{offer.title || offer.name}</Text>
      {offer.size ? <Text style={styles.size}>{offer.size}</Text> : null}

      <View style={styles.priceRow}>
        <Text style={[styles.price, muted && styles.priceMuted]}>{euro(offer.price)}</Text>
        {offer.originalPrice ? (
          <>
            <Text style={styles.was}>{euro(offer.originalPrice)}</Text>
            {offer.percent ? (
              <View style={styles.percent}>
                <Text style={styles.percentText}>-{offer.percent}%</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      {!offer.originalPrice && offer.baseline ? (
        <Text style={styles.baseline}>κανονικά ~{euro(offer.baseline.price)}</Text>
      ) : null}
      {offer.unit ? (
        <Text style={styles.unit}>
          {euro(offer.unit.value)} / {offer.unit.per}
        </Text>
      ) : null}
      {offer.verdict && !muted ? <Text style={styles.verdict}>{VERDICT_LABEL[offer.verdict]}</Text> : null}

      {exp.upcoming && exp.startFull ? (
        <Text style={styles.upcoming}>Η προσφορά ξεκινά στις {exp.startFull}</Text>
      ) : null}
      {/* Έναρξη only while the offer is still to start: for most chains
          validFrom is our ingest timestamp, and showing it as a promo start
          would be invented (same rule as the website's detail view). */}
      {/* An ended offer without chain-published dates must not say «Σε ισχύ». */}
      {exp.real || !muted ? (
        <View style={styles.dates}>
          {exp.upcoming && exp.startFull ? <DateBox label="Έναρξη" value={exp.startFull} /> : null}
          <DateBox
            label={exp.real ? 'Λήξη προσφοράς' : 'Κατάσταση'}
            value={exp.status}
            sub={exp.statusSub}
            urgent={exp.urgent}
          />
        </View>
      ) : null}

      {offer.description ? <Text style={styles.description}>{offer.description}</Text> : null}

      {offer.leafletUrl ? (
        <Pressable
          style={styles.secondary}
          onPress={() => WebBrowser.openBrowserAsync(offer.leafletUrl as string)}
          accessibilityRole="button"
          accessibilityLabel={`Δες το φυλλάδιο του ${chain?.name ?? 'καταστήματος'}`}>
          <Text style={styles.secondaryText}>Δες το φυλλάδιο</Text>
        </Pressable>
      ) : null}

      {comparison.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.h2}>Σε άλλα καταστήματα</Text>
          <ComparisonSection current={offer} comparison={comparison} />
        </View>
      ) : null}

      {history.points.length >= 2 ? (
        <View style={styles.section}>
          <Text style={styles.h2}>Ιστορικό τιμής</Text>
          <PriceHistoryChart history={history} />
        </View>
      ) : null}

      {similar.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.h2}>Παρόμοιες προσφορές</Text>
          <FlatList
            horizontal
            data={similar}
            keyExtractor={(d) => d.id}
            renderItem={({ item }) => <DealCardView deal={item} width={170} />}
            ItemSeparatorComponent={() => <View style={{ width: Space[3] }} />}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Space[4] }}
            style={{ marginHorizontal: -Space[4] }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function DateBox({ label, value, sub, urgent }: { label: string; value: string; sub?: string | null; urgent?: boolean }) {
  return (
    <View style={styles.dateBox}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={[styles.dateValue, urgent && { color: Colors.accent }]}>{value}</Text>
      {sub ? <Text style={styles.dateSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Space[4], paddingBottom: Space[7] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Space[6] },
  errorTitle: { fontSize: Type.title, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  errorText: { fontSize: Type.body, color: Colors.ink2, marginTop: Space[2], textAlign: 'center' },
  primary: {
    marginTop: Space[5],
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Space[6],
  },
  primaryText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '700' },
  ended: { backgroundColor: Colors.discountBg, borderRadius: Radius.md, padding: Space[3], marginBottom: Space[3] },
  endedText: { color: Colors.accent, fontSize: Type.bodyLg, fontWeight: '800', textAlign: 'center' },
  imagePanel: {
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Space[4],
    marginBottom: Space[4],
  },
  image: { width: '100%', aspectRatio: 1 },
  noImage: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md },
  chainPill: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  chainText: { fontSize: Type.caption, fontWeight: '700' },
  name: { fontSize: Type.h2, fontWeight: '800', color: Colors.ink, marginTop: Space[2], lineHeight: 28 },
  size: { fontSize: Type.body, color: Colors.ink3, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Space[3], marginTop: Space[3] },
  price: { fontSize: Type.h1, fontWeight: '800', color: Colors.ink },
  priceMuted: { color: Colors.ink4 },
  was: { fontSize: Type.bodyLg, color: Colors.ink3, textDecorationLine: 'line-through' },
  percent: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  percentText: { color: '#fff', fontWeight: '800', fontSize: Type.body },
  baseline: { fontSize: Type.body, color: Colors.ink3, marginTop: 2 },
  unit: { fontSize: Type.body, color: Colors.ink2, marginTop: 2 },
  verdict: { fontSize: Type.bodyLg, color: Colors.good, fontWeight: '800', marginTop: Space[2] },
  upcoming: { fontSize: Type.body, color: Colors.brand, fontWeight: '700', marginTop: Space[3] },
  dates: { flexDirection: 'row', gap: Space[3], marginTop: Space[4] },
  dateBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Space[3],
  },
  dateLabel: { fontSize: Type.caption, color: Colors.ink3 },
  dateValue: { fontSize: Type.bodyLg, fontWeight: '800', color: Colors.ink, marginTop: 2 },
  dateSub: { fontSize: Type.caption, color: Colors.ink3, marginTop: 2 },
  description: { fontSize: Type.body, color: Colors.ink2, lineHeight: 23, marginTop: Space[4] },
  secondary: {
    marginTop: Space[4],
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.brand,
    backgroundColor: Colors.surface,
  },
  secondaryText: { color: Colors.brand, fontSize: Type.bodyLg, fontWeight: '700' },
  section: { marginTop: Space[6] },
  h2: { fontSize: Type.h2, fontWeight: '800', color: Colors.ink, marginBottom: Space[3] },
});
