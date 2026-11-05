// Αρχική — the website's landing page in the app (HomeClient + Hero): hero and
// search, chain strip, the three rails from GET /api/v1/home, the banner and
// the category tiles (GET /api/v1/meta). Layout pieces live in components/home.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type HomeResponse } from '@/lib/api';
import { dedupeCards } from '@/lib/lists';
import { useMeta } from '@/lib/chains';
import { useShoppingList } from '@/lib/shopping-list';
import { track } from '@/lib/analytics';
import { Colors, Space } from '@/constants/theme';
import {
  CategoryGrid,
  ChainStrip,
  HomeError,
  HomeHeader,
  HomeHero,
  PromoBanner,
  Rail,
  SearchPill,
  railCardWidth,
} from '@/components/home/sections';

export default function HomeScreen() {
  useFocusEffect(useCallback(() => track('page_view', { page: 'home' }), []));
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const { meta, error: metaError, retry: retryMeta } = useMeta();
  const { items } = useShoppingList();

  const apply = useCallback((home: HomeResponse) => {
    setData({ ...home, top: dedupeCards(home.top), endingSoon: dedupeCards(home.endingSoon) });
  }, []);

  // Retry and pull-to-refresh (event handlers, so resetting the error first
  // is fine there).
  const load = useCallback(async () => {
    try {
      setError(false);
      apply(await api.home());
    } catch {
      setError(true);
    }
  }, [apply]);

  // First load: state changes only when the request settles, and not at all
  // if the screen unmounted meanwhile.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .home(ctrl.signal)
      .then(apply)
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [apply]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onRetry = useCallback(() => {
    if (error) void load();
    if (metaError) retryMeta();
  }, [error, load, metaError, retryMeta]);

  if (error || metaError) {
    return (
      <SafeAreaView style={styles.screen}>
        <HomeError onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  if (!data || !meta) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  const cardWidth = railCardWidth(width);
  const listCount = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
        <HomeHeader listCount={listCount} />
        <HomeHero total={data.total} chainCount={meta.chains.length} />
        <SearchPill />
        <View style={{ height: Space[5] }} />
        <ChainStrip chains={meta.chains} />

        <Rail title="Τα βασικά της εβδομάδας" hint="Φθηνότερη προσφορά, ανά κιλό ή λίτρο" deals={data.essentials} width={cardWidth} />
        <Rail
          title="Κορυφαίες προσφορές"
          hint="Ξεχωρίζουν αυτή την εβδομάδα"
          deals={data.top}
          width={cardWidth}
          onSeeAll={() => router.navigate('/deals')}
        />
        <Rail
          title="Τελειώνουν σύντομα"
          hint="Πρόλαβε πριν λήξουν"
          deals={data.endingSoon}
          width={cardWidth}
          onSeeAll={() => router.navigate({ pathname: '/deals', params: { sort: 'expiring' } })}
        />

        <PromoBanner total={data.total} />
        <CategoryGrid categories={meta.categories} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Space[4], paddingBottom: Space[7] * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
});
