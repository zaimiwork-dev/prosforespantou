// Προσφορές — every active offer, like the website's offers page
// (DealsClient) over GET /api/v1/deals. One filter row («Φίλτρα» + sort) opens
// a bottom sheet; pages of 24 load as the list nears its end. Several chains
// are ONE request (chain=ab,lidl), so ranking and paging stay correct.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { api, type DealCard, type DealSort, type MetaResponse } from '@/lib/api';
import { arrangeDeals } from '@/lib/lists';
import { DealCardView } from '@/components/deal-card';
import { track } from '@/lib/analytics';
import { getSettings, useSettings } from '@/lib/settings';
import { useChainList } from '@/components/filters/use-chain-list';
import { FilterSheet, NO_FILTERS, SORTS, activeCount, effectiveChains, type Filters } from '@/components/filters/filter-sheet';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

const PAGE = 24;

type Status = 'loading' | 'ready' | 'error';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// The home screen links here with ?chain=<id> or ?category=<id>; otherwise
// the shopper starts on «Τα καταστήματά μου» when they picked stores.
const asSort = (v?: string): DealSort | undefined => SORTS.find((s) => s.id === v)?.id;

function initialFilters(chain?: string, category?: string, sort?: DealSort): Filters {
  if (chain || category || sort) {
    return { ...NO_FILTERS, chains: chain ? [chain] : [], categories: category ? [category] : [], sort: sort ?? NO_FILTERS.sort };
  }
  return { ...NO_FILTERS, mine: getSettings().myChains.length > 0 };
}

export default function DealsScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { width } = useWindowDimensions();
  const { chains } = useChainList();
  const { myChains } = useSettings();
  const listRef = useRef<FlatList<DealCard>>(null);
  const params = useLocalSearchParams<{ chain?: string; category?: string; sort?: string }>();
  const pChain = one(params.chain);
  const pCategory = one(params.category);
  // «Όλες» on the home screen's «Τελειώνουν σύντομα» rail sends ?sort=expiring.
  const pSort = asSort(one(params.sort));

  const [filters, setFilters] = useState<Filters>(() => initialFilters(pChain, pCategory, pSort));
  const [sheet, setSheet] = useState<null | 'filters' | 'sort'>(null);
  const mineKey = myChains.join(',');
  const chainKey = useMemo(() => effectiveChains(filters, mineKey ? mineKey.split(',') : []).join(','), [filters, mineKey]);
  const catKey = filters.categories.join(',');
  const sort = filters.sort;
  // Bumped by retry / pull-to-refresh to re-run the load with the same filters.
  const [reloadKey, setReloadKey] = useState(0);

  const [categories, setCategories] = useState<MetaResponse['categories']>([]);
  const [raw, setRaw] = useState<DealCard[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // The current first-page request's controller; load-more shares its signal
  // so changing a filter cancels both.
  const ctrlRef = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);

  const startReload = useCallback(() => {
    setStatus('loading');
    setRaw([]);
    setNextOffset(null);
    setLoadingMore(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // A new ?chain / ?category / ?sort from the home screen replaces the filters
  // (state adjusted during render, the supported alternative to an effect).
  const paramKey = `${pChain ?? ''}|${pCategory ?? ''}|${pSort ?? ''}`;
  const [seenParams, setSeenParams] = useState(paramKey);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    if (pChain || pCategory || pSort) {
      setFilters(initialFilters(pChain, pCategory, pSort));
      setStatus('loading');
      setRaw([]);
      setNextOffset(null);
      setLoadingMore(false);
    }
  }

  // Department list, once.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .meta(ctrl.signal)
      .then((m) => setCategories(m.categories))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // First page for the current filters. State changes only when the request
  // settles; the handlers put the screen into «loading» beforehand.
  useEffect(() => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    moreBusy.current = false;
    api
      .deals(
        { limit: PAGE, offset: 0, chain: chainKey ? chainKey.split(',') : undefined, categories: catKey ? catKey.split(',') : undefined, sort },
        ctrl.signal,
      )
      .then((res) => {
        setRaw(res.deals);
        setTotal(res.total);
        setNextOffset(res.nextOffset);
        setLoadingMore(false);
        setStatus('ready');
        setRefreshing(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setStatus('error');
        setRefreshing(false);
      });
    return () => ctrl.abort();
  }, [chainKey, catKey, sort, reloadKey]);

  // Apply from the sheet: analytics per changed dimension, with the chosen values.
  const applyFilters = (f: Filters) => {
    const nextChains = effectiveChains(f, myChains).join(',');
    const changed = nextChains !== chainKey || f.categories.join(',') !== catKey || f.sort !== sort;
    if (nextChains !== chainKey) {
      track('store_select', { page: 'deals', query: nextChains || 'all', supermarket: f.chains.length === 1 && !f.mine ? f.chains[0] : undefined });
    }
    if (f.categories.join(',') !== catKey) track('filter', { page: 'deals', category: f.categories.join(',') || 'all' });
    if (f.sort !== sort) track('filter', { page: 'deals', query: `sort:${f.sort}` });
    setSheet(null);
    setFilters(f);
    if (changed) startReload();
  };
  const clearFilters = () => {
    setFilters({ ...NO_FILTERS });
    setReloadKey((k) => k + 1);
    startReload();
  };
  const retry = () => {
    setReloadKey((k) => k + 1);
    startReload();
  };
  const onRefresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const loadMore = () => {
    const ctrl = ctrlRef.current;
    if (!ctrl || status !== 'ready' || nextOffset === null || moreBusy.current) return;
    moreBusy.current = true;
    setLoadingMore(true);
    api
      .deals(
        { limit: PAGE, offset: nextOffset, chain: chainKey ? chainKey.split(',') : undefined, categories: catKey ? catKey.split(',') : undefined, sort },
        ctrl.signal,
      )
      .then((res) => {
        setRaw((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          return [...prev, ...res.deals.filter((d) => !seen.has(d.id))];
        });
        setNextOffset(res.nextOffset);
        setTotal(res.total);
        moreBusy.current = false;
        setLoadingMore(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        // Keep nextOffset: reaching the end again retries this page.
        moreBusy.current = false;
        setLoadingMore(false);
      });
  };

  useFocusEffect(useCallback(() => track('page_view', { page: 'deals' }), []));

  const arranged = useMemo(() => arrangeDeals(raw, sort), [raw, sort]);
  const cardWidth = (width - Space[4] * 2 - Space[3]) / 2;

  const nActive = activeCount(filters);
  const sortLabel = SORTS.find((x) => x.id === sort)?.label ?? 'Δημοφιλή';

  const header = (
    <View>
      <View style={styles.titleBlock}>
        <Text style={styles.h2}>Προσφορές</Text>
        {total !== null ? <Text style={styles.sub}>{total.toLocaleString('el-GR')} προσφορές</Text> : null}
      </View>
      <View style={styles.pillRow}>
        <Pressable
          onPress={() => setSheet('filters')}
          accessibilityRole="button"
          accessibilityLabel={nActive ? `Φίλτρα, ${nActive} ενεργά` : 'Φίλτρα'}
          style={({ pressed }) => [styles.pill, nActive > 0 && styles.pillOn, pressed && { opacity: 0.85 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={nActive ? '#fff' : Colors.ink} strokeWidth={2.2} strokeLinecap="round">
            <Path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <Path d="M16 4.5v5M8 14.5v5" />
          </Svg>
          <Text style={[T.text.chip, { color: nActive ? '#fff' : Colors.ink }]}>Φίλτρα</Text>
          {nActive > 0 ? (
            <View style={styles.count}>
              <Text style={[T.text.caption, { color: Colors.brand, fontFamily: Fonts.sans900 }]}>{nActive}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => setSheet('sort')}
          accessibilityRole="button"
          accessibilityLabel={`Ταξινόμηση: ${sortLabel}`}
          style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}>
          <Text style={[T.text.chip, { color: Colors.ink }]} numberOfLines={1}>
            {sortLabel}
          </Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );

  let empty: React.ReactNode = null;
  if (status === 'loading') {
    empty = (
      <View style={styles.state}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  } else if (status === 'error') {
    empty = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Δεν φορτώθηκαν οι προσφορές</Text>
        <Text style={styles.stateText}>Έλεγξε τη σύνδεσή σου στο ίντερνετ.</Text>
        <Pressable style={styles.button} onPress={retry} accessibilityRole="button">
          <Text style={styles.buttonText}>Δοκίμασε ξανά</Text>
        </Pressable>
      </View>
    );
  } else {
    empty = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Δεν βρέθηκαν προσφορές με αυτά τα φίλτρα</Text>
        <Pressable style={styles.button} onPress={clearFilters} accessibilityRole="button">
          <Text style={styles.buttonText}>Καθαρισμός φίλτρων</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        ref={listRef}
        data={status === 'ready' ? arranged : []}
        keyExtractor={(d) => d.id}
        numColumns={2}
        renderItem={({ item, index }) => <DealCardView deal={item} width={cardWidth} position={index} />}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={styles.footer}>{loadingMore ? <ActivityIndicator color={Colors.brand} /> : null}</View>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} colors={[Colors.brand]} />}
        contentContainerStyle={styles.content}
      />
      <FilterSheet
        visible={sheet !== null}
        focus={sheet ?? 'filters'}
        value={filters}
        chains={chains}
        categories={categories}
        myChains={myChains}
        onClose={() => setSheet(null)}
        onApply={applyFilters}
      />
    </SafeAreaView>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { paddingBottom: Space[7] },
    titleBlock: { paddingHorizontal: Space[4], paddingTop: Space[4], paddingBottom: Space[3] },
    h2: { ...T.text.h2, color: Colors.ink },
    sub: { ...T.text.body, color: Colors.ink3Text, marginTop: 2 },
    pillRow: { flexDirection: 'row', gap: Space[2], paddingHorizontal: Space[4], paddingBottom: Space[3], alignItems: 'center' },
    pill: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space[2],
      paddingHorizontal: Space[4],
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: Colors.line2,
      backgroundColor: Colors.surface,
    },
    pillOn: { backgroundColor: Colors.brand, borderColor: Colors.brand },
    count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    row: { paddingHorizontal: Space[4], gap: Space[3], marginBottom: Space[3] },
    state: { alignItems: 'center', padding: Space[6], paddingTop: Space[7] },
    stateTitle: { ...T.text.bodyStrong, color: Colors.ink, textAlign: 'center' },
    stateText: { ...T.text.body, color: Colors.ink2, marginTop: Space[2], textAlign: 'center' },
    button: { marginTop: Space[5], backgroundColor: Colors.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6], minHeight: 52, justifyContent: 'center' },
    buttonText: { ...T.text.button, color: '#fff' },
    footer: { paddingVertical: Space[5] },
  });
