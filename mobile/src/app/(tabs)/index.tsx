// Αρχική — a discovery feed. The server (GET /api/v1/feed) decides which rails
// exist, their titles and order; this screen draws them in the order received.
// One vertical, virtualised list whose rows are rails, so rails far below the
// fold are not mounted until the shopper scrolls near them.
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View, FlatList, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type FeedSection } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useMeta } from '@/lib/chains';
import { useSettings } from '@/lib/settings';
import { useInterests } from '@/lib/interest';
import { useShoppingList } from '@/lib/shopping-list';
import { track } from '@/lib/analytics';
import { formatCount } from '@/components/home/count';
import { StaleBanner } from '@/components/ui/stale-banner';
import { RailSkeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Space, useType } from '@/constants/theme';
import { CategoryChips, FeedRail, RecentRail } from '@/components/home/feed';
import { ArrowRightIcon } from '@/components/home/icons';
import { ChainStrip, HomeError, HomeHeader, HomeHero, PromoBanner, SearchPill, railCardWidth } from '@/components/home/sections';

type Row =
  | { key: string; type: 'search' }
  | { key: string; type: 'chips' }
  | { key: string; type: 'chains' }
  | { key: string; type: 'recent' }
  | { key: string; type: 'section'; section: FeedSection }
  | { key: string; type: 'banner' }
  | { key: string; type: 'footer' }
  | { key: string; type: 'skeleton' };

const BANNER_AFTER = 4;

export default function HomeScreen() {
  useFocusEffect(useCallback(() => track('page_view', { page: 'home' }), []));
  const { width } = useWindowDimensions();
  const { meta, error: metaError, retry: retryMeta } = useMeta();
  const { items } = useShoppingList();
  const { myChains } = useSettings();
  const { categories: cats } = useInterests(3);
  // The key carries both lists so a changed store set or interest refetches.
  const key = `feed:${myChains.join(',')}|${cats.join(',')}`;
  const feed = useApi(key, (signal) => api.feed({ chains: myChains, cats }, signal));
  const { refresh } = feed;
  const data = feed.data;

  const onRefresh = useCallback(() => {
    refresh();
    if (metaError) retryMeta();
  }, [refresh, metaError, retryMeta]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ key: 'search', type: 'search' }];
    if (meta) {
      out.push({ key: 'chips', type: 'chips' }, { key: 'chains', type: 'chains' });
    }
    out.push({ key: 'recent', type: 'recent' });
    if (!data) {
      out.push({ key: 'skeleton', type: 'skeleton' });
      return out;
    }
    const sections = data.sections.filter((x) => x.deals.length > 0);
    sections.forEach((section, i) => {
      out.push({ key: 'section:' + section.id, type: 'section', section });
      if (i === BANNER_AFTER - 1) out.push({ key: 'banner', type: 'banner' });
    });
    if (sections.length < BANNER_AFTER) out.push({ key: 'banner', type: 'banner' });
    out.push({ key: 'footer', type: 'footer' });
    return out;
  }, [data, meta]);

  const cardWidth = railCardWidth(width);
  const listCount = items.reduce((n, i) => n + i.quantity, 0);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.type) {
        case 'search':
          return (
            <View style={styles.sticky}>
              <SearchPill />
            </View>
          );
        case 'chips':
          return meta ? (
            <View style={{ marginTop: Space[2] }}>
              <CategoryChips categories={meta.categories} />
            </View>
          ) : null;
        case 'chains':
          return meta ? (
            <View style={{ marginTop: Space[4], paddingHorizontal: Space[4] }}>
              <ChainStrip chains={meta.chains} />
            </View>
          ) : null;
        case 'recent':
          return <RecentRail />;
        case 'section':
          return <FeedRail section={item.section} width={cardWidth} />;
        case 'banner':
          return (
            <View style={{ marginTop: Space[6], paddingHorizontal: Space[4] }}>
              <PromoBanner total={data?.total ?? 0} />
            </View>
          );
        case 'footer':
          return <SeeAllButton total={data?.total ?? 0} />;
        case 'skeleton':
          return (
            <View style={{ gap: Space[5], marginTop: Space[6] }}>
              <RailSkeleton cardWidth={cardWidth} />
              <RailSkeleton cardWidth={cardWidth} />
              <RailSkeleton cardWidth={cardWidth} />
            </View>
          );
      }
    },
    [meta, cardWidth, data?.total],
  );

  // Nothing to show and nothing cached: the only full-screen failure.
  if (!data && feed.error) {
    return (
      <SafeAreaView style={styles.screen}>
        <HomeError onRetry={refresh} />
      </SafeAreaView>
    );
  }

  const header = (
    <View style={{ paddingHorizontal: Space[4] }}>
      {feed.stale ? <StaleBanner updatedAt={feed.updatedAt} onRetry={refresh} /> : null}
      <HomeHeader listCount={listCount} />
      <HomeHero total={data?.total ?? meta?.total ?? 0} chainCount={meta?.chains.length ?? 0} />
      {metaError ? <MetaFallback onRetry={retryMeta} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        ListHeaderComponent={header}
        // ScrollView children: 0 = ListHeaderComponent, 1 = the search row (checked on web).
        stickyHeaderIndices={STICKY}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: Space[7] * 2 }}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
      />
    </SafeAreaView>
  );
}

const STICKY = [1];
const rowKey = (r: Row) => r.key;

function SeeAllButton({ total }: { total: number }) {
  const T = useType();
  return (
    <View style={{ marginTop: Space[6], paddingHorizontal: Space[4] }}>
      <Pressable
        onPress={() => router.navigate('/deals')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.85 }]}>
        <Text style={[T.text.button, { color: '#fff' }]}>Δες όλες τις {formatCount(total)} προσφορές</Text>
        <ArrowRightIcon size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

// /meta failed but the feed loaded: the page still works, only the category
// chips and chain strip are missing — say so in one row.
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
  sticky: { backgroundColor: Colors.bg, paddingHorizontal: Space[4], paddingTop: Space[3], paddingBottom: Space[2] },
  seeAllBtn: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space[2],
    backgroundColor: Colors.brand,
    borderRadius: Radius.pill,
    paddingHorizontal: Space[5],
  },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Space[3],
    minHeight: 44,
    paddingHorizontal: Space[3],
    marginTop: Space[3],
    backgroundColor: Colors.bgSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  fallbackBtn: { minHeight: 44, justifyContent: 'center' },
});
