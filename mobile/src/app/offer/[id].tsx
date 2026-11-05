// Product page — the website's product sheet (OfferDetails + PriceComparison +
// PriceHistory) from GET /api/v1/offers/:id, laid out per DESIGN.md «Product
// page». The server answers for ended offers too (shared links, saved lists)
// with active:false, so an old price is never shown as if it were current.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { expiryInfo, formatFullDate } from '@shared/expiry-label';
import { api, ApiError, type OfferResponse } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useChains } from '@/lib/chains';
import { favouriteKeyFor, toggleFavourite, useFavourites } from '@/lib/favourites';
import { formatPrice, formatUnitPrice } from '@/lib/format';
import { addToList, useShoppingList } from '@/lib/shopping-list';
import { DealCardView } from '@/components/deal-card';
import { ComparisonSection } from '@/components/offer/comparison-section';
import { PriceHistoryChart } from '@/components/offer/price-history-chart';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

const VERDICT_LABEL = { lowest: 'Χαμηλότερη τιμή', good: 'Καλή τιμή' } as const;

type Result = { key: string; data: OfferResponse | null; status: number | null };

export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
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
  const headerOptions = {
    title: chainName ?? 'Προσφορά',
    headerTitleStyle: { fontFamily: Fonts.sans700, fontSize: T.title, color: Colors.ink },
  };

  if (!current) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={headerOptions} />
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (!data) {
    const notFound = current.status === 404;
    return (
      <View style={styles.center}>
        <Stack.Screen options={headerOptions} />
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
      <Stack.Screen options={headerOptions} />
      <OfferContent data={data} />
    </>
  );
}

function OfferContent({ data }: { data: OfferResponse }) {
  const { offer, comparison, history, similar } = data;
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
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
  const struck = offer.originalPrice != null;
  // Same badge rule as the card: «−N%», else the chain's own sticker, else ΜΟΝΟ.
  const badge = offer.percent
    ? `−${offer.percent}%`
    : !offer.originalPrice ? (offer.sticker ?? 'ΜΟΝΟ').toLocaleUpperCase('el') : null;
  const updated = formatFullDate(offer.updatedAt);

  // Once per visit to the page (not per re-render): focus fires again when the
  // shopper comes back from the comparison row or the browser.
  useFocusEffect(
    useCallback(() => {
      track('page_view', { page: 'offer', discountId: offer.id, supermarket: offer.chain ?? undefined });
    }, [offer.id, offer.chain]),
  );

  const openLeaflet = () => {
    track('leaflet_click', { discountId: offer.id, supermarket: offer.chain ?? undefined });
    WebBrowser.openBrowserAsync(offer.leafletUrl as string);
  };

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
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>

      {offer.category ? <Text style={styles.eyebrow}>{offer.category.toLocaleUpperCase('el')}</Text> : null}
      <Text style={styles.name}>{offer.title || offer.name}</Text>
      {offer.size ? <Text style={styles.size}>{offer.size}</Text> : null}

      <Text style={styles.priceLabel}>ΤΙΜΗ ΠΡΟΣΦΟΡΑΣ</Text>
      <View style={styles.priceRow}>
        <Text style={[styles.price, struck && !muted && styles.priceSale, muted && styles.priceMuted]}>
          {formatPrice(offer.price)}
        </Text>
        {struck ? <Text style={styles.was}>{formatPrice(offer.originalPrice!)}</Text> : null}
      </View>
      {!struck && offer.baseline ? (
        <Text style={styles.baseline}>κανονικά ~{formatPrice(offer.baseline.price)}</Text>
      ) : null}
      {offer.unit ? (
        <View style={styles.unitBox}>
          <Text style={styles.unitText}>{formatUnitPrice(offer.unit)}</Text>
        </View>
      ) : null}
      {offer.verdict && !muted ? <Text style={styles.verdict}>{VERDICT_LABEL[offer.verdict]}</Text> : null}

      <ListActions offer={offer} />

      {updated ? <Text style={styles.fresh}>Ενημερώθηκε {updated}</Text> : null}

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
          onPress={openLeaflet}
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
            renderItem={({ item, index }) => <DealCardView deal={item} width={170} position={index} />}
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

// Heart, quantity and «Στη λίστα». The stepper only chooses how many to add;
// the list's own quantity is changed on the Λίστα tab. The pill shows a tick
// while the offer is on the list and keeps adding the chosen amount.
function ListActions({ offer }: { offer: OfferResponse['offer'] }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { items } = useShoppingList();
  const { favourites } = useFavourites();
  const [qty, setQty] = useState(1);
  const onList = items.some((i) => i.id === offer.id);
  const fav = favourites.some((f) => f.key === favouriteKeyFor(offer));
  return (
    <View style={styles.actions}>
      <Pressable
        style={[styles.favBtn, fav && styles.favBtnOn]}
        onPress={() => toggleFavourite(offer)}
        accessibilityRole="button"
        accessibilityState={{ selected: fav }}
        accessibilityLabel={fav ? 'Αφαίρεση από τα αγαπημένα' : 'Πρόσθεσε στα αγαπημένα'}>
        <Svg width={26} height={26} viewBox="0 0 24 24" fill={fav ? Colors.accent : 'none'} stroke={fav ? Colors.accent : Colors.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
        </Svg>
      </Pressable>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => setQty((q) => Math.max(1, q - 1))}
          accessibilityRole="button"
          accessibilityLabel="Μείωση ποσότητας"
          style={styles.step}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2.5} strokeLinecap="round">
            <Path d="M5 12h14" />
          </Svg>
        </Pressable>
        <Text style={styles.qty} accessibilityLabel={`Ποσότητα ${qty}`}>
          {qty}
        </Text>
        <Pressable
          onPress={() => setQty((q) => Math.min(99, q + 1))}
          accessibilityRole="button"
          accessibilityLabel="Αύξηση ποσότητας"
          style={styles.step}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2.5} strokeLinecap="round">
            <Path d="M5 12h14M12 5v14" />
          </Svg>
        </Pressable>
      </View>
      <Pressable
        style={[styles.listBtn, onList && styles.listBtnOn]}
        onPress={() => {
          addToList(offer, qty);
          setQty(1);
        }}
        accessibilityRole="button"
        accessibilityLabel={onList ? 'Στη λίστα. Πάτησε για να προσθέσεις ακόμα' : 'Πρόσθεσε στη λίστα'}>
        {onList ? (
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.brand} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        ) : null}
        <Text style={[styles.listBtnText, onList && { color: Colors.brand }]} numberOfLines={1}>
          Στη λίστα
        </Text>
      </Pressable>
    </View>
  );
}

function DateBox({ label, value, sub, urgent }: { label: string; value: string; sub?: string | null; urgent?: boolean }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.dateBox}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={[styles.dateValue, urgent && { color: Colors.accent }]}>{value}</Text>
      {sub ? <Text style={styles.dateSub}>{sub}</Text> : null}
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { padding: Space[4], paddingBottom: Space[7] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Space[6] },
    errorTitle: { ...T.text.h2, fontSize: T.title, lineHeight: T.title + 6, fontFamily: Fonts.sans700, color: Colors.ink, textAlign: 'center' },
    errorText: { ...T.text.body, color: Colors.ink2, marginTop: Space[2], textAlign: 'center' },
    primary: {
      marginTop: Space[5],
      minHeight: 52,
      justifyContent: 'center',
      backgroundColor: Colors.brand,
      borderRadius: Radius.pill,
      paddingHorizontal: Space[6],
    },
    primaryText: { ...T.text.button, color: '#fff' },
    ended: { backgroundColor: Colors.discountBg, borderRadius: Radius.md, padding: Space[3], marginBottom: Space[3] },
    endedText: { ...T.text.bodyStrong, color: Colors.accent, textAlign: 'center' },
    imagePanel: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Colors.line,
      padding: Space[4],
      marginBottom: Space[4],
    },
    image: { width: '100%', aspectRatio: 1 },
    noImage: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md },
    badge: { position: 'absolute', top: Space[3], right: Space[3], backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { ...T.text.badge, color: '#fff' },
    eyebrow: { ...T.text.caption, fontFamily: Fonts.sans700, color: Colors.brand, letterSpacing: 0.8 },
    name: { fontFamily: Fonts.sans700, fontSize: Math.round(T.title * 1.22), lineHeight: Math.round(T.title * 1.22) + 6, color: Colors.ink, marginTop: Space[1] },
    size: { ...T.text.secondary, color: Colors.ink3Text, marginTop: 2 },
    priceLabel: { ...T.text.caption, fontFamily: Fonts.sans700, color: Colors.ink3Text, letterSpacing: 0.8, marginTop: Space[5] },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: Space[3] },
    price: { ...T.text.priceLarge, color: Colors.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    priceSale: { color: Colors.accent },
    priceMuted: { color: Colors.ink4 },
    was: { ...T.text.secondary, color: Colors.ink3Text, textDecorationLine: 'line-through' },
    baseline: { ...T.text.secondary, color: Colors.ink3Text, marginTop: 2 },
    unitBox: {
      alignSelf: 'stretch',
      marginTop: Space[3],
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.line,
      borderRadius: Radius.md,
      paddingHorizontal: Space[4],
      paddingVertical: Space[3],
    },
    unitText: { ...T.text.bodyStrong, color: Colors.ink },
    verdict: { ...T.text.bodyStrong, color: Colors.good, marginTop: Space[2] },
    actions: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginTop: Space[4] },
    favBtn: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 28,
      borderWidth: 1,
      borderColor: Colors.line2,
      backgroundColor: Colors.surface,
    },
    favBtnOn: { borderColor: Colors.accent, backgroundColor: Colors.discountBg },
    stepper: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 28,
      backgroundColor: Colors.bgSoft,
      borderWidth: 1,
      borderColor: Colors.line,
      paddingHorizontal: 2,
    },
    step: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
    qty: { ...T.text.bodyStrong, minWidth: 24, textAlign: 'center', color: Colors.ink },
    listBtn: {
      flex: 1,
      minWidth: 0,
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space[2],
      borderRadius: 28,
      borderWidth: 2,
      borderColor: Colors.brand,
      backgroundColor: Colors.brand,
      paddingHorizontal: Space[3],
    },
    listBtnOn: { backgroundColor: Colors.surface },
    listBtnText: { ...T.text.button, color: '#fff' },
    fresh: { ...T.text.caption, color: Colors.ink3Text, textAlign: 'center', marginTop: Space[3] },
    upcoming: { ...T.text.bodyStrong, color: Colors.brand, marginTop: Space[3] },
    dates: { flexDirection: 'row', gap: Space[3], marginTop: Space[4] },
    dateBox: {
      flex: 1,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.line,
      padding: Space[3],
    },
    dateLabel: { ...T.text.caption, color: Colors.ink3Text },
    dateValue: { fontFamily: Fonts.sans900, fontSize: T.bodyLg, lineHeight: T.bodyLg + 6, color: Colors.ink, marginTop: 2 },
    dateSub: { ...T.text.caption, color: Colors.ink3Text, marginTop: 2 },
    description: { ...T.text.body, color: Colors.ink2, marginTop: Space[4] },
    secondary: {
      marginTop: Space[4],
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.pill,
      borderWidth: 2,
      borderColor: Colors.brand,
      backgroundColor: Colors.surface,
    },
    secondaryText: { ...T.text.button, color: Colors.brand },
    section: { marginTop: Space[6] },
    h2: { ...T.text.h2, color: Colors.ink, marginBottom: Space[3] },
  });
