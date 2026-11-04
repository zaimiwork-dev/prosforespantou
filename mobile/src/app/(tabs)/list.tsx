// Λίστα — the shopping list and the favourites, both stored on the device.
// The list is grouped by chain with a subtotal each (as on the website);
// an offer that has ended stays visible, greyed and marked «Έληξε», because a
// list silently losing items is worse than one that says so.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useChains } from '@/lib/chains';
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
import { Colors, Radius, Space, Type } from '@/constants/theme';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

type Tab = 'list' | 'favourites';

export default function ListScreen() {
  const [tab, setTab] = useState<Tab>('list');
  const { items, loaded } = useShoppingList();
  const { favourites } = useFavourites();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.h1}>Λίστα</Text>
      <View style={styles.segment} accessibilityRole="tablist">
        <SegmentButton label={`Η λίστα μου${items.length ? ` (${items.length})` : ''}`} selected={tab === 'list'} onPress={() => setTab('list')} />
        <SegmentButton label={`Αγαπημένα${favourites.length ? ` (${favourites.length})` : ''}`} selected={tab === 'favourites'} onPress={() => setTab('favourites')} />
      </View>
      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brand} />
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
  const chains = useChains();
  const [confirming, setConfirming] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const { groups, total } = useMemo(() => groupByChain(items), [items]);
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
    const message = buildShareText(items, (id) => chainOf(id)?.short ?? 'SM');
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
        {groups.length > 1 ? (
          <Text style={styles.multi}>
            Η λίστα σου απλώνεται σε {groups.length} καταστήματα. Το σύνολο είναι ανά κατάστημα.
          </Text>
        ) : null}
        {groups.map((g) => {
          const chain = chainOf(g.chain);
          return (
            <View key={g.chain ?? 'none'} style={styles.group}>
              <View style={[styles.groupHead, { backgroundColor: chain?.color ?? Colors.ink2 }]}>
                <Text style={styles.groupName}>{chain?.name ?? g.chain ?? 'Άλλο κατάστημα'}</Text>
                <Text style={styles.groupTotal}>{euro(g.subtotal)}</Text>
              </View>
              {g.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Συνολικό κόστος</Text>
          <Text style={styles.totalValue}>{euro(total)}</Text>
        </View>
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

function ItemRow({ item }: { item: ListItem }) {
  const expired = isExpired(item);
  return (
    <View style={[styles.item, expired && styles.itemExpired]}>
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
        {expired ? (
          <Text style={styles.expired}>Έληξε</Text>
        ) : (
          <Text style={[styles.itemPrice, item.checked && styles.done]}>{euro(item.price * item.quantity)}</Text>
        )}
        <View style={styles.stepper}>
          <StepButton label="Μείωση ποσότητας" onPress={() => changeQuantity(item.id, -1)} minus />
          <Text style={styles.qty} accessibilityLabel={`Ποσότητα ${item.quantity}`}>
            {item.quantity}
          </Text>
          <StepButton label="Αύξηση ποσότητας" onPress={() => changeQuantity(item.id, 1)} />
          <Pressable
            onPress={() => removeFromList(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Αφαίρεση: ${item.name}`}
            style={styles.remove}>
            <Text style={styles.removeText}>Αφαίρεση</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StepButton({ label, onPress, minus = false }: { label: string; onPress: () => void; minus?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.step}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2.5} strokeLinecap="round">
        <Path d={minus ? 'M5 12h14' : 'M5 12h14M12 5v14'} />
      </Svg>
    </Pressable>
  );
}

function FavouritesView() {
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
            <Svg width={26} height={26} viewBox="0 0 24 24" fill={Colors.accent} stroke={Colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
            </Svg>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  h1: { fontSize: Type.h1, fontWeight: '800', color: Colors.brand, paddingHorizontal: Space[4], paddingTop: Space[4], marginBottom: Space[3] },
  segment: {
    flexDirection: 'row',
    marginHorizontal: Space[4],
    marginBottom: Space[3],
    backgroundColor: Colors.bgSoft,
    borderRadius: Radius.md,
    padding: 4,
  },
  segBtn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  segBtnOn: { backgroundColor: Colors.surface },
  segText: { fontSize: Type.body, fontWeight: '700', color: Colors.ink2 },
  segTextOn: { color: Colors.brand },
  content: { padding: Space[4], paddingBottom: Space[6] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space[6] },
  emptyTitle: { fontSize: Type.title, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  emptyText: { fontSize: Type.bodyLg, color: Colors.ink2, textAlign: 'center', marginTop: Space[2], lineHeight: 24 },
  primary: { marginTop: Space[5], minHeight: 48, justifyContent: 'center', backgroundColor: Colors.brand, borderRadius: Radius.md, paddingHorizontal: Space[6] },
  primaryText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '700' },
  multi: { fontSize: Type.body, color: Colors.ink2, marginBottom: Space[3], lineHeight: 22 },
  group: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', marginBottom: Space[4] },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Space[4], paddingVertical: Space[3] },
  groupName: { color: '#fff', fontSize: Type.title, fontWeight: '800', flexShrink: 1 },
  groupTotal: { color: '#fff', fontSize: Type.title, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'flex-start', padding: Space[3], gap: Space[2], borderTopWidth: 1, borderTopColor: Colors.line },
  itemExpired: { opacity: 0.5 },
  tapBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: Colors.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  boxOn: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  thumb: { width: 56, height: 56, marginTop: 2 },
  noThumb: { backgroundColor: Colors.bgSoft, borderRadius: Radius.sm },
  itemBody: { flex: 1 },
  itemName: { fontSize: Type.body, fontWeight: '700', color: Colors.ink, lineHeight: 21 },
  done: { textDecorationLine: 'line-through', color: Colors.ink3 },
  itemPrice: { fontSize: Type.bodyLg, fontWeight: '800', color: Colors.ink, marginTop: 2 },
  expired: { fontSize: Type.bodyLg, fontWeight: '800', color: Colors.accent, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: Space[1] },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line2, backgroundColor: Colors.surface },
  qty: { minWidth: 36, textAlign: 'center', fontSize: Type.bodyLg, fontWeight: '800', color: Colors.ink },
  remove: { minHeight: 44, justifyContent: 'center', marginLeft: 'auto', paddingHorizontal: Space[2] },
  removeText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  footer: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.line, padding: Space[4] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: Type.bodyLg, color: Colors.ink2 },
  totalValue: { fontSize: Type.h2, fontWeight: '800', color: Colors.ink },
  footNote: { fontSize: Type.body, color: Colors.accent, marginTop: Space[2] },
  footActions: { flexDirection: 'row', gap: Space[3], marginTop: Space[3] },
  footBtn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, borderWidth: 2, borderColor: Colors.brand, backgroundColor: Colors.surface, paddingHorizontal: Space[2] },
  footBtnPrimary: { backgroundColor: Colors.brand },
  footBtnPrimaryText: { color: '#fff', fontSize: Type.body, fontWeight: '800', textAlign: 'center' },
  footBtnText: { color: Colors.brand, fontSize: Type.body, fontWeight: '800', textAlign: 'center' },
  footBtnDanger: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  favRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, marginBottom: Space[3] },
  favMain: { flex: 1, minHeight: 56, justifyContent: 'center', padding: Space[3] },
  favChain: { fontSize: Type.caption, color: Colors.ink3, marginTop: 2 },
  favRemove: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
