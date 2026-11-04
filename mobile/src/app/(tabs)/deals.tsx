// Προσφορές — every active offer, filterable by chain and department and
// sortable, like the website's offers page (DealsClient) over
// GET /api/v1/deals. Pages of 24 load as the list nears its end.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type DealCard, type DealSort, type MetaResponse } from '@/lib/api';
import { arrangeDeals } from '@/lib/lists';
import { useChains } from '@/lib/chains';
import { DealCardView } from '@/components/deal-card';
import { track } from '@/lib/analytics';
import { getSettings, useSettings } from '@/lib/settings';
import { Chip } from '@/components/chip';
import { Colors, Radius, Space, useType, type TypeScale } from '@/constants/theme';

const PAGE = 24;

const SORTS: { id: DealSort; label: string }[] = [
  { id: 'hot', label: 'Δημοφιλή' },
  { id: 'price_asc', label: 'Φθηνότερα' },
  { id: 'discount', label: 'Μεγαλύτερη έκπτωση' },
  { id: 'expiring', label: 'Λήγουν σύντομα' },
];

type Status = 'loading' | 'ready' | 'error';

// 'mine' = the chains picked in Ρυθμίσεις. The API takes one chain per
// request, so several are fetched side by side and merged.
type ChainSel = 'all' | 'mine' | string;

type Page = { deals: DealCard[]; total: number; nextOffset: number | null };

async function fetchPage(chains: string[], offset: number, category: string | undefined, sort: DealSort, signal: AbortSignal): Promise<Page> {
  const base = { limit: PAGE, offset, categories: category ? [category] : undefined, sort };
  if (chains.length <= 1) return api.deals({ ...base, chain: chains[0] }, signal);
  const pages = await Promise.all(chains.map((c) => api.deals({ ...base, chain: c }, signal)));
  const seen = new Set<string>();
  const deals = pages.flatMap((p) => p.deals).filter((d) => !seen.has(d.id) && seen.add(d.id));
  return {
    deals,
    total: pages.reduce((n, p) => n + p.total, 0),
    nextOffset: pages.some((p) => p.nextOffset !== null) ? offset + PAGE : null,
  };
}

export default function DealsScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { width } = useWindowDimensions();
  const chains = useChains();
  const { myChains } = useSettings();
  const listRef = useRef<FlatList<DealCard>>(null);

  // Starts on «Τα καταστήματά μου» when the shopper picked stores; they can
  // still change it for this session.
  const [sel, setSel] = useState<ChainSel>(() => (getSettings().myChains.length ? 'mine' : 'all'));
  const mineKey = myChains.join(',');
  const chainList = useMemo(() => (sel === 'all' ? [] : sel === 'mine' ? (mineKey ? mineKey.split(',') : []) : [sel]), [sel, mineKey]);
  const chainKey = chainList.join(',');
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<DealSort>('hot');
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
  // settles; the handlers below put the screen into «loading» beforehand.
  useEffect(() => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    moreBusy.current = false;
    fetchPage(chainKey ? chainKey.split(',') : [], 0, category, sort, ctrl.signal)
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
  }, [chainKey, category, sort, reloadKey]);

  const startReload = useCallback(() => {
    setStatus('loading');
    setRaw([]);
    setNextOffset(null);
    setLoadingMore(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const pickChain = (id: ChainSel) => {
    if (id === sel) return;
    setSel(id);
    startReload();
    track('store_select', { supermarket: id === 'all' || id === 'mine' ? undefined : id, page: 'deals', query: id });
  };
  const pickCategory = (id: string | undefined) => {
    if (id === category) return;
    setCategory(id);
    startReload();
    track('filter', { page: 'deals', category: id ?? 'all' });
  };
  const pickSort = (id: DealSort) => {
    if (id === sort) return;
    setSort(id);
    startReload();
    track('filter', { page: 'deals', query: `sort:${id}` });
  };
  const clearFilters = () => {
    setSel('all');
    setCategory(undefined);
    setSort('hot');
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
    fetchPage(chainList, nextOffset, category, sort, ctrl.signal)
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

  const header = (
    <View>
      <View style={styles.titleBlock}>
        <Text style={styles.h1}>Προσφορές</Text>
        {total !== null ? <Text style={styles.sub}>{total.toLocaleString('el-GR')} προσφορές</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Όλα" selected={sel === 'all' || (sel === 'mine' && !myChains.length)} onPress={() => pickChain('all')} />
        {myChains.length ? <Chip label="Τα καταστήματά μου" selected={sel === 'mine'} onPress={() => pickChain('mine')} /> : null}
        {chains.map((c) => (
          <Chip key={c.id} label={c.name} color={c.color} selected={sel === c.id} onPress={() => pickChain(c.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Όλες" selected={!category} onPress={() => pickCategory(undefined)} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.label} selected={category === c.id} onPress={() => pickCategory(c.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {SORTS.map((s) => (
          <Chip key={s.id} label={s.label} selected={sort === s.id} onPress={() => pickSort(s.id)} />
        ))}
      </ScrollView>
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
    </SafeAreaView>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { paddingBottom: Space[7] },
    titleBlock: { paddingHorizontal: Space[4], paddingTop: Space[4], paddingBottom: Space[3] },
    h1: { fontSize: T.h1, fontWeight: '800', color: Colors.brand },
    sub: { fontSize: T.body, color: Colors.ink2, marginTop: 2 },
    chipRow: { paddingHorizontal: Space[4], gap: Space[2], paddingBottom: Space[2], alignItems: 'center' },
    row: { paddingHorizontal: Space[4], gap: Space[3], marginBottom: Space[3] },
    state: { alignItems: 'center', padding: Space[6], paddingTop: Space[7] },
    stateTitle: { fontSize: T.title, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
    stateText: { fontSize: T.body, color: Colors.ink2, marginTop: Space[2], textAlign: 'center' },
    button: { marginTop: Space[5], backgroundColor: Colors.brand, borderRadius: Radius.md, paddingHorizontal: Space[6], paddingVertical: Space[3], minHeight: 44, justifyContent: 'center' },
    buttonText: { color: '#fff', fontSize: T.bodyLg, fontWeight: '700' },
    footer: { paddingVertical: Space[5] },
  });
