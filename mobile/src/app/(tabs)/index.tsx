// Αρχική — the website's landing page in the app (HomeClient + Hero): hero and
// search, chain strip, the three rails from GET /api/v1/home, the banner and
// the category tiles (GET /api/v1/meta). Layout pieces live in components/home.
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { dedupeCards } from '@/lib/lists';
import { useMeta } from '@/lib/chains';
import { useShoppingList } from '@/lib/shopping-list';
import { track } from '@/lib/analytics';
import { StaleBanner } from '@/components/ui/stale-banner';
import { Colors, Radius, Space, useType } from '@/constants/theme';
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
  const { width } = useWindowDimensions();
  const { meta, error: metaError, retry: retryMeta } = useMeta();
  const { items } = useShoppingList();
  const home = useApi('home', fetchHome);
  const { refresh } = home;

  // The rails show each product once; derived here, not stored, so the cache
  // keeps the server's answer as it came.
  const data = useMemo(
    () => (home.data ? { ...home.data, top: dedupeCards(home.data.top), endingSoon: dedupeCards(home.data.endingSoon) } : null),
    [home.data],
  );

  const onRefresh = useCallback(() => {
    refresh();
    if (metaError) retryMeta();
  }, [refresh, metaError, retryMeta]);

  // Nothing to show and nothing cached: the only full-screen failure.
  if (!data && home.error) {
    return (
      <SafeAreaView style={styles.screen}>
        <HomeError onRetry={refresh} />
      </SafeAreaView>
    );
  }

  if (!data) {
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
        refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
        {home.stale ? <StaleBanner updatedAt={home.updatedAt} onRetry={refresh} /> : null}
        <HomeHeader listCount={listCount} />
        <HomeHero total={data.total} chainCount={meta?.chains.length ?? 0} />
        <SearchPill />
        <View style={{ height: Space[5] }} />
        {meta ? <ChainStrip chains={meta.chains} /> : null}
        {metaError ? <MetaFallback onRetry={retryMeta} /> : null}

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
        {meta ? <CategoryGrid categories={meta.categories} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const fetchHome = (signal: AbortSignal) => api.home(signal);

// /meta failed but /home loaded: the page still works, only the chain strip and
// category tiles are missing — say so in one row instead of blocking the screen.
function MetaFallback({ onRetry }: { onRetry: () => void }) {
  const T = useType();
  return (
    <View style={styles.fallback}>
      <Text style={[T.text.caption, { flexShrink: 1, color: Colors.ink2 }]}>Δεν φορτώθηκαν τα καταστήματα</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={styles.fallbackBtn}>
        <Text style={[T.text.caption, { color: Colors.brand, textDecorationLine: 'underline' }]}>Δοκίμασε ξανά</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Space[4], paddingBottom: Space[7] * 2 },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Space[3],
    minHeight: 44,
    paddingHorizontal: Space[3],
    marginBottom: Space[3],
    backgroundColor: Colors.bgSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  fallbackBtn: { minHeight: 44, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
});
