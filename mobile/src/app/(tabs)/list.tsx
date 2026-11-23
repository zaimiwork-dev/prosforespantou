// Λίστα — the shopping list and the favourites, both stored on the device.
// The list is grouped by chain with a subtotal each (as on the website);
// an offer that has ended stays visible, greyed and marked «Έληξε», because a
// list silently losing items is worse than one that says so.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { track } from '@/lib/analytics';
import { useChains } from '@/lib/chains';
import { formatPrice } from '@/lib/format';
import { removeFavourite, useFavourites } from '@/lib/favourites';
import {
  buildShareText,
  changeQuantity,
  groupByChain,
  isExpired,
  removeChecked,
  removeFromList,
  toggleChecked,
  useShoppingList,
  type ListItem,
} from '@/lib/shopping-list';
import { ListBasketCard } from '@/components/list-basket-card';
import { useListPrices } from '@/lib/list-prices';
import { cheaperElsewhere, type CheaperElsewhere } from '@shared/list-basket';
import { Fonts, Radius, Space, useType, type TypeScale, type Palette, readableOn } from '@/constants/theme';

type Tab = 'list' | 'favourites';

export default function ListScreen() {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const [tab, setTab] = useState<Tab>('list');
  const { items, loaded } = useShoppingList();
  const { favourites } = useFavourites();
  useFocusEffect(useCallback(() => track('page_view', { page: 'list' }), []));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.h1} accessibilityRole="header">Λίστα</Text>
      <View style={styles.segment} accessibilityRole="tablist">
        <SegmentButton label={`Η λίστα μου${items.length ? ` (${items.length})` : ''}`} selected={tab === 'list'} onPress={() => setTab('list')} />
        <SegmentButton label={`Αγαπημένα${favourites.length ? ` (${favourites.length})` : ''}`} selected={tab === 'favourites'} onPress={() => setTab('favourites')} />
      </View>
      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.brandText} />
        </View>
      ) : tab === 'list' ? (
        <ShoppingListView items={items} />
      ) : (
        <FavouritesView />
      )}
    </SafeAreaView>
  );
}

function SegmentButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[styles.segBtn, selected && styles.segBtnOn]}>
      <Text style={[styles.segText, selected && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ShoppingListView({ items }: { items: ListItem[] }) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const chains = useChains();
  const [confirming, setConfirming] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const { groups, total } = useMemo(() => groupByChain(items), [items]);
  const prices = useListPrices(items);
  // «Πιο φθηνά στο …» per item: the same prices as the store card above.
  const alternatives = useMemo(() => {
    const out: Record<string, CheaperElsewhere> = {};
    for (const i of items) {
      const alt = cheaperElsewhere({ id: i.id, chain: i.chain, price: i.price, quantity: i.quantity }, prices[i.id]);
      if (alt) out[i.id] = alt;
    }
    return out;
  }, [items, prices]);
  const savings = items.reduce((s, i) => s + (alternatives[i.id]?.savings ?? 0) * i.quantity, 0);
  const checkedCount = items.filter((i) => i.checked).length;
  const chainOf = (id: string | null) => chains.find((c) => c.id === id);

  // An armed «Διαγραφή επιλεγμένων» gives itself back if the shopper does nothing.
  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Η λίστα σου είναι άδεια</Text>
        <Text style={styles.emptyText}>Πρόσθεσε προσφορές για να δεις πόσο θα κοστίσουν τα ψώνια σου και σε ποιο κατάστημα.</Text>
        <Pressable style={styles.primary} onPress={() => router.navigate('/deals')} accessibilityRole="button">
          <Text style={styles.primaryText}>Δες προσφορές</Text>
        </Pressable>
      </View>
    );
  }

  const share = async () => {
    const message = buildShareText(items, (id) => chainOf(id)?.name ?? 'Κατάστημα');
    if (!message) return;
    setShareFailed(false);
    try {
      // Text only, no url: most share targets keep the url and drop the text.
      await Share.share({ title: 'Η λίστα με τις προσφορές μου', message });
    } catch {
      setShareFailed(true);
    }
  };

  const deleteChecked = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    removeChecked();
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ListBasketCard items={items} prices={prices} />
        {groups.length > 1 ? (
          <Text style={styles.multi}>
            Σε {groups.length} καταστήματα · υποσύνολο ανά κατάστημα
          </Text>
        ) : null}
        {groups.map((g) => {
          const chain = chainOf(g.chain);
          return (
            <View key={g.chain ?? 'none'} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.groupDot, { backgroundColor: chain?.color ?? C.ink2 }]} />
                <Text style={[styles.groupName, { color: readableOn(chain?.color, C.bg, C.ink) }]}>
                  {chain?.name ?? g.chain ?? 'Άλλο κατάστημα'}
                </Text>
                <Text style={styles.groupTotal}>{formatPrice(g.subtotal)}</Text>
              </View>
              <View style={[styles.groupCard, { borderTopColor: chain?.color ?? C.line }]}>
                {g.items.map((item, i) => (
                  <ItemRow key={item.id} item={item} first={i === 0} alt={alternatives[item.id]} />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Συνολικό κόστος</Text>
          <Text style={styles.totalValue}>{formatPrice(total)}</Text>
        </View>
        {savings >= 0.095 ? (
          <Text style={styles.footSavings}>
            Με αλλαγή καταστημάτων η λίστα γίνεται έως {formatPrice(savings)} φθηνότερη
          </Text>
        ) : null}
        {shareFailed ? <Text style={styles.footNote}>Δεν άνοιξε η κοινοποίηση. Δοκίμασε ξανά.</Text> : null}
        <View style={styles.footActions}>
          <Pressable style={[styles.footBtn, styles.footBtnPrimary]} onPress={share} accessibilityRole="button">
            <Text style={styles.footBtnPrimaryText}>Κοινοποίηση</Text>
          </Pressable>
          {checkedCount > 0 ? (
            <Pressable
              style={[styles.footBtn, confirming && styles.footBtnDanger]}
              onPress={deleteChecked}
              accessibilityRole="button"
              accessibilityLabel={confirming ? 'Σίγουρα; Πάτησε ξανά για διαγραφή των επιλεγμένων' : 'Διαγραφή επιλεγμένων'}>
              <Text style={[styles.footBtnText, confirming && { color: '#fff' }]}>
                {confirming ? 'Σίγουρα;' : 'Διαγραφή επιλεγμένων'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ItemRow({ item, first, alt }: { item: ListItem; first: boolean; alt?: CheaperElsewhere }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const chains = useChains();
  const altChain = alt ? chains.find((c) => c.id === alt.chain) : undefined;
  const expired = isExpired(item);
  return (
    <View style={[styles.item, first && styles.itemFirst, expired && styles.itemExpired]}>
      <Pressable
        onPress={() => toggleChecked(item.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={`Βάλε τικ: ${item.name}`}
        style={styles.tapBox}>
        <View style={[styles.box, item.checked && styles.boxOn]}>
          {item.checked ? (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12.5l4.5 4.5L19 7.5" />
            </Svg>
          ) : null}
        </View>
      </Pressable>

      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="contain" />
      ) : (
        <View style={[styles.thumb, styles.noThumb]} />
      )}

      <View style={styles.itemBody}>
        <Text style={[styles.itemName, item.checked && styles.done]} numberOfLines={3}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          {expired ? (
            <Text style={styles.expired}>Έληξε</Text>
          ) : (
            <Text style={[styles.itemPrice, item.checked && styles.done]}>{formatPrice(item.price * item.quantity)}</Text>
          )}
          <Pressable
            onPress={() => removeFromList(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Αφαίρεση: ${item.name}`}
            style={styles.remove}>
            <Text style={styles.removeText}>Αφαίρεση</Text>
          </Pressable>
        </View>
        {alt && !expired ? (
          // An offer there opens that offer; a regular shelf price opens this
          // item's own page, whose comparison shows it as «Κανονική τιμή».
          <Pressable
            onPress={() => router.push(`/offer/${alt.kind === 'offer' && alt.offerId ? alt.offerId : item.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`Πιο φθηνά ${altChain?.name ?? alt.chain}: ${formatPrice(alt.price)}, ${formatPrice(alt.savings)} λιγότερα`}
            style={styles.cheaper}>
            <Text style={styles.cheaperText}>
              Πιο φθηνά στο {altChain?.short ?? alt.chain}: −{formatPrice(alt.savings)}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.stepRow}>
          <View style={styles.stepper}>
            <StepButton label="Μείωση ποσότητας" onPress={() => changeQuantity(item.id, -1)} minus />
            <Text style={styles.qty} accessibilityLabel={`Ποσότητα ${item.quantity}`}>
              {item.quantity}
            </Text>
            <StepButton label="Αύξηση ποσότητας" onPress={() => changeQuantity(item.id, 1)} />
          </View>
        </View>
      </View>
    </View>
  );
}

function StepButton({ label, onPress, minus = false }: { label: string; onPress: () => void; minus?: boolean }) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.step}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.5} strokeLinecap="round">
        <Path d={minus ? 'M5 12h14' : 'M5 12h14M12 5v14'} />
      </Svg>
    </Pressable>
  );
}

function FavouritesView() {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const { favourites } = useFavourites();
  const chains = useChains();

  if (favourites.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Δεν έχεις αγαπημένα ακόμα</Text>
        <Text style={styles.emptyText}>Πάτησε την καρδιά σε ένα προϊόν για να το βρίσκεις εύκολα εδώ.</Text>
        <Pressable style={styles.primary} onPress={() => router.navigate('/deals')} accessibilityRole="button">
          <Text style={styles.primaryText}>Δες προσφορές</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.multi}>Πάτησε ένα προϊόν για να δεις τις τρέχουσες τιμές του.</Text>
      {favourites.map((f) => (
        <View key={f.key} style={styles.favRow}>
          {/* Opens a search, not the saved offer: the offer seen when saving may
              have ended, the search shows what is on offer today in every chain. */}
          <Pressable
            style={styles.favMain}
            onPress={() => router.navigate({ pathname: '/search', params: { q: f.name, t: String(Date.now()) } })}
            accessibilityRole="button"
            accessibilityLabel={`Αναζήτηση: ${f.name}`}>
            <Text style={styles.itemName} numberOfLines={3}>
              {f.name}
            </Text>
            {f.chain ? <Text style={styles.favChain}>{chains.find((c) => c.id === f.chain)?.name ?? f.chain}</Text> : null}
          </Pressable>
          <Pressable
            onPress={() => removeFavourite(f.key)}
            accessibilityRole="button"
            accessibilityLabel={`Αφαίρεση από τα αγαπημένα: ${f.name}`}
            style={styles.favRemove}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill={C.accent} stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
            </Svg>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    flex: { flex: 1 },
    h1: { ...T.text.hero, color: C.ink, paddingHorizontal: Space[4], paddingTop: Space[4], marginBottom: Space[3] },
    segment: {
      flexDirection: 'row',
      marginHorizontal: Space[4],
      marginBottom: Space[3],
      backgroundColor: C.bgSoft,
      borderRadius: Radius.pill,
      padding: 4,
    },
    segBtn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, paddingHorizontal: Space[2] },
    segBtnOn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
    segText: { ...T.text.chip, fontFamily: Fonts.sans600, color: C.ink2, textAlign: 'center' },
    segTextOn: { fontFamily: Fonts.sans700, color: C.brandText },
    content: { padding: Space[4], paddingBottom: Space[6] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space[6] },
    emptyTitle: { ...T.text.h2, color: C.ink, textAlign: 'center' },
    emptyText: { ...T.text.body, color: C.ink2, textAlign: 'center', marginTop: Space[2] },
    primary: { marginTop: Space[5], minHeight: 52, justifyContent: 'center', backgroundColor: C.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6] },
    primaryText: { ...T.text.button, color: '#fff' },
    multi: { ...T.text.secondary, color: C.ink3Text, marginBottom: Space[3] },
    group: { marginBottom: Space[4] },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: Space[2], paddingHorizontal: Space[1], paddingBottom: Space[2] },
    groupDot: { width: 12, height: 12, borderRadius: 6 },
    groupName: { ...T.text.title, fontFamily: Fonts.sans900, flex: 1 },
    groupTotal: { ...T.text.title, fontFamily: Fonts.sans900, color: C.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    groupCard: { backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.line, borderTopWidth: 3, overflow: 'hidden' },
    item: { flexDirection: 'row', alignItems: 'flex-start', padding: Space[3], gap: Space[2], borderTopWidth: 1, borderTopColor: C.line },
    itemFirst: { borderTopWidth: 0 },
    itemExpired: { opacity: 0.5 },
    tapBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    box: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    boxOn: { backgroundColor: C.brand, borderColor: C.brand },
    thumb: { width: 64, height: 64, marginTop: 2, borderRadius: Radius.sm, backgroundColor: C.imageBg },
    noThumb: { backgroundColor: C.bgSoft },
    itemBody: { flex: 1, minWidth: 0 },
    itemName: { ...T.text.title, color: C.ink },
    done: { textDecorationLine: 'line-through', color: C.ink3Text },
    itemPrice: { ...T.text.bodyStrong, fontFamily: Fonts.sans900, color: C.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    expired: { ...T.text.bodyStrong, fontFamily: Fonts.sans900, color: C.accentText },
    priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    stepRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: Space[1] },
    stepper: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 24, backgroundColor: C.bgSoft, borderWidth: 1, borderColor: C.line },
    step: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    qty: { ...T.text.bodyStrong, fontFamily: Fonts.sans900, minWidth: 28, textAlign: 'center', color: C.ink },
    remove: { minHeight: 48, justifyContent: 'center', paddingLeft: Space[2] },
    removeText: { ...T.text.bodyStrong, color: C.accentText },
    footer: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, padding: Space[4] },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { ...T.text.body, color: C.ink2 },
    totalValue: { ...T.text.price, color: C.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    footNote: { ...T.text.body, color: C.accentText, marginTop: Space[2] },
    footSavings: { ...T.text.secondary, color: C.brandText, marginTop: Space[1] },
    // A text link, not a pill: the column beside the photo is ~200 dp wide and
    // a bordered pill wrapped mid-phrase there.
    cheaper: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    cheaperText: { ...T.text.secondary, fontFamily: Fonts.sans700, color: C.brandText, textDecorationLine: 'underline' },
    footActions: { flexDirection: 'row', gap: Space[3], marginTop: Space[3] },
    footBtn: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 2, borderColor: C.brandText, backgroundColor: C.surface, paddingHorizontal: Space[3] },
    footBtnPrimary: { backgroundColor: C.brand, borderColor: C.brand },
    footBtnPrimaryText: { ...T.text.button, color: '#fff', textAlign: 'center' },
    footBtnText: { ...T.text.button, color: C.brandText, textAlign: 'center' },
    footBtnDanger: { backgroundColor: C.accent, borderColor: C.accent },
    favRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.line, marginBottom: Space[3] },
    favMain: { flex: 1, minHeight: 56, justifyContent: 'center', padding: Space[3] },
    favChain: { ...T.text.secondary, color: C.ink3Text, marginTop: 2 },
    favRemove: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  });
